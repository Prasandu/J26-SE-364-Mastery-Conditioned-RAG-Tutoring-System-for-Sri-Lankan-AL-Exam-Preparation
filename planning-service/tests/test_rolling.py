from datetime import UTC, date, datetime, time, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest

from app.errors import Conflict
from app.main import app
from app.models import (
    AvailabilitySlot,
    LearnerTopicState,
    Question,
    RawEvent,
    ReplanLog,
    StudyPlan,
    StudyTask,
    Topic,
    TopicEvidence,
)
from app.schemas.roadmap import RoadmapResponse
from app.schemas.tasks import ScheduleResponse
from app.services import rolling, scheduling
from app.services.roadmap import (
    NO_NEW_THEORY_ACTIVITIES,
    apply_overload_rule,
    committed_window_days,
    compress_allocation,
    compressed_load,
    daily_hours_by_weekday,
    final_week_activity,
    forecast_weeks,
    is_final_week,
    project_mastery,
    rescheduling_horizon_days,
    schedule_limits,
)
from app.services.scheduler import ScheduleResult
from app.services.task_content import build_activity_steps
from app.services.weights import ADHERENCE_FLOOR, FINAL_WEEK_DAYS

MONDAY = date(2026, 10, 19)
NOW = datetime(2026, 10, 19, 2, 0, tzinfo=UTC)


def topic_input(topic_id: str, exam_weight: float, mastery: float) -> dict[str, Any]:
    return {
        "topic_id": topic_id,
        "exam_weight": exam_weight,
        "mastery": mastery,
        "prerequisites": [],
        "prerequisite_mastery": {},
    }


def every_day_slots(plan_id: Any, hours: int = 2) -> list[SimpleNamespace]:
    return [
        SimpleNamespace(plan_id=plan_id, weekday=weekday, start_time=time(16), end_time=time(16 + hours))
        for weekday in range(7)
    ]


class Scalars:
    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def all(self) -> list[Any]:
        return self.values

    def first(self) -> Any:
        return self.values[0] if self.values else None


class FakeSession:
    def __init__(
        self,
        plan: Any,
        *,
        topics: dict[str, Any] | None = None,
        states: list[Any] | None = None,
        slots: list[Any] | None = None,
        raw_events: list[Any] | None = None,
    ) -> None:
        self.plan = plan
        self.topics = topics or {}
        self.states = states or []
        self.slots = slots or []
        self.raw_events = raw_events or []
        self.added: list[Any] = []
        self.commits = 0

    def get(self, model: type, key: Any) -> Any:
        if model is StudyPlan:
            return self.plan if key == self.plan.id else None
        if model is Topic:
            return self.topics.get(key)
        return None

    def scalars(self, statement: Any) -> Scalars:
        entity = statement.column_descriptions[0]["entity"]
        records = {
            LearnerTopicState: self.states,
            AvailabilitySlot: self.slots,
            RawEvent: self.raw_events,
        }
        return Scalars(list(records.get(entity, [])))

    def add(self, record: Any) -> None:
        self.added.append(record)

    def delete(self, _record: Any) -> None:
        return None

    def flush(self) -> None:
        return None

    def commit(self) -> None:
        self.commits += 1


def make_plan(
    *,
    exam_in_days: int = 42,
    rolling_state: dict[str, Any] | None = None,
    daily_minutes: int = 120,
) -> SimpleNamespace:
    constraints: dict[str, Any] = {
        "timezone": "UTC",
        "max_session_minutes": 60,
        "max_daily_minutes": daily_minutes,
        "fixed_commitments": [],
        "priorities": [
            {"topic_id": "high", "priority": 0.9},
            {"topic_id": "mid", "priority": 0.5},
            {"topic_id": "low", "priority": 0.1},
        ],
    }
    if rolling_state is not None:
        constraints["rolling"] = rolling_state
    return SimpleNamespace(
        id=uuid4(),
        student_id="student-1",
        mode="manual",
        exam_date=MONDAY + timedelta(days=exam_in_days),
        target_grade="A",
        constraints=constraints,
    )


TOPICS = {
    "high": SimpleNamespace(id="high", name="Organic", exam_weight=0.9, prerequisites=[], parent_id=None),
    "mid": SimpleNamespace(id="mid", name="Calculations", exam_weight=0.5, prerequisites=[], parent_id=None),
    "low": SimpleNamespace(
        id="low", name="Periodic table", exam_weight=0.1, prerequisites=[], parent_id=None
    ),
}
STATES = [
    SimpleNamespace(student_id="student-1", topic_id="high", mastery=0.2),
    SimpleNamespace(student_id="student-1", topic_id="mid", mastery=0.4),
    SimpleNamespace(student_id="student-1", topic_id="low", mastery=0.5),
]


# --- Committed window -------------------------------------------------------


@pytest.mark.parametrize(
    ("days_to_exam", "window"),
    [(60, 14), (42, 14), (21, 14), (20, 7), (14, 7), (10, 3), (8, 1), (7, 7), (3, 3), (0, 0)],
)
def test_committed_window_is_14_days_then_7_and_never_splits_the_final_week(
    days_to_exam: int,
    window: int,
) -> None:
    assert committed_window_days(days_to_exam) == window
    if days_to_exam > FINAL_WEEK_DAYS:
        assert days_to_exam - window >= FINAL_WEEK_DAYS


def test_full_period_is_covered_by_windows_ending_in_one_fixed_final_week() -> None:
    remaining, windows = 42, []
    while remaining > 0:
        windows.append(committed_window_days(remaining))
        remaining -= windows[-1]

    assert windows == [14, 14, 7, 7]
    assert sum(windows) == 42


def test_rescheduling_stays_inside_the_committed_window() -> None:
    plan = make_plan(rolling_state={"window_start": "2026-10-19", "window_end": "2026-11-01"})

    assert rescheduling_horizon_days(plan, date(2026, 10, 30)) == 3
    assert rescheduling_horizon_days(make_plan(), MONDAY) == 14


# --- Roadmap ----------------------------------------------------------------


def test_roadmap_covers_every_week_until_exam_and_labels_forecast_weeks() -> None:
    topics = [topic_input("high", 0.9, 0.2), topic_input("mid", 0.5, 0.4), topic_input("low", 0.1, 0.5)]
    exam = MONDAY + timedelta(days=42)

    weeks = forecast_weeks(
        topics,
        daily_hours={weekday: 2.0 for weekday in range(7)},
        today=MONDAY,
        exam_date=exam,
        window_end=MONDAY + timedelta(days=13),
    )

    assert [week.week_start for week in weeks] == [MONDAY + timedelta(weeks=index) for index in range(6)]
    assert [week.label for week in weeks] == ["committed"] * 2 + ["forecast"] * 4
    assert [week.phase for week in weeks] == ["learning"] * 5 + ["final_revision"]
    assert all(week.total_hours == pytest.approx(14.0) for week in weeks)
    assert all(row["focus"] == "revision and past papers" for row in weeks[-1].topics)
    assert weeks[0].weeks_to_exam == 5 and weeks[-1].weeks_to_exam == 0


def test_roadmap_projects_mastery_forward_so_topic_mix_shifts() -> None:
    weeks = forecast_weeks(
        [topic_input("high", 0.9, 0.1), topic_input("mid", 0.6, 0.3)],
        daily_hours={weekday: 2.0 for weekday in range(7)},
        today=MONDAY,
        exam_date=MONDAY + timedelta(days=56),
        window_end=None,
    )

    def mastery(week_index: int, topic_id: str) -> float:
        rows = weeks[week_index].topics
        return next(row["projected_mastery"] for row in rows if row["topic_id"] == topic_id)

    assert mastery(-1, "high") > mastery(0, "high")
    assert weeks[0].topics[0]["topic_id"] == "high"
    assert all(week.label == "forecast" for week in weeks)


def test_roadmap_prorates_partial_first_week_and_skips_deferred_topics() -> None:
    thursday = MONDAY + timedelta(days=3)
    weeks = forecast_weeks(
        [topic_input("high", 0.9, 0.2), topic_input("low", 0.1, 0.5)],
        daily_hours={weekday: 1.0 for weekday in range(7)},
        today=thursday,
        exam_date=MONDAY + timedelta(days=28),
        window_end=thursday + timedelta(days=13),
        deferred={"low"},
        compression_note="lighter plan",
    )

    assert weeks[0].total_hours == pytest.approx(4.0)
    assert all(row["topic_id"] != "low" for week in weeks for row in week.topics)
    assert all(week.compressed and week.compression_note == "lighter plan" for week in weeks)


def test_project_mastery_is_bounded_and_increasing() -> None:
    topic = topic_input("high", 0.9, 0.4)

    assert 0.4 < project_mastery(topic, 2) < project_mastery(topic, 20) < 1
    assert project_mastery(topic_input("done", 0.9, 1.0), 5) == 1.0


def test_daily_hours_apply_the_cap_per_weekday() -> None:
    slots = [
        SimpleNamespace(weekday=0, start_time=time(8), end_time=time(12)),
        SimpleNamespace(weekday=0, start_time=time(18), end_time=time(19)),
        SimpleNamespace(weekday=2, start_time=time(18), end_time=time(19)),
    ]

    assert daily_hours_by_weekday(slots, 180) == {0: 3.0, 2: 1.0}


# --- Overload handling --------------------------------------------------------


def test_compression_drops_lowest_gain_topics_first_and_keeps_the_best() -> None:
    allocation = {"high": 6.0, "mid": 4.0, "low": 3.0, "unused": 0.0}
    gains = {"high": 0.09, "mid": 0.04, "low": 0.01, "unused": 0.0}

    shrunk = compress_allocation(allocation, gains, budget_hours=7.0)
    trimmed = compress_allocation(allocation, gains, budget_hours=3.0)
    minimal = compress_allocation(allocation, gains, budget_hours=1.0)

    assert shrunk.dropped == () and sum(shrunk.kept.values()) == pytest.approx(7.0, abs=0.02)
    assert trimmed.dropped == ("low",) and trimmed.kept == {"high": 1.8, "mid": 1.2}
    assert minimal.dropped == ("low", "mid") and minimal.kept == {"high": 1.0}
    assert compress_allocation(allocation, gains, budget_hours=20.0).kept == {
        "high": 6.0,
        "mid": 4.0,
        "low": 3.0,
    }


def test_compressed_load_leaves_headroom_above_measured_adherence() -> None:
    assert compressed_load(0.5) == pytest.approx(0.65)
    assert compressed_load(0.1) == pytest.approx(0.4)
    assert compressed_load(0.95) == 1.0


def test_low_adherence_compresses_plan_logs_it_and_never_changes_target() -> None:
    plan = make_plan(daily_minutes=180)
    session = FakeSession(plan, topics=TOPICS, states=STATES, slots=every_day_slots(plan.id, hours=3))

    outcome = apply_overload_rule(session, "student-1", plan, 0.3, now=NOW)  # type: ignore[arg-type]

    rolling_state = plan.constraints["rolling"]
    gains = {"high": 0.9 * 0.8, "mid": 0.5 * 0.6, "low": 0.1 * 0.5}  # weight x (1 - mastery) ordering
    assert outcome.compressed and outcome.dropped_topics
    assert "high" not in outcome.dropped_topics
    assert all(gains[topic_id] < gains["high"] for topic_id in outcome.dropped_topics)
    assert rolling_state["deferred_topics"] == outcome.dropped_topics
    assert outcome.dropped_topics == ["low"]
    assert rolling_state["session_minutes"] < 60 and rolling_state["daily_minutes"] < 180
    assert schedule_limits(plan) == (rolling_state["session_minutes"], rolling_state["daily_minutes"])
    assert plan.target_grade == "A"
    assert "target grade (A) has not changed" in (outcome.explanation or "")
    assert all(TOPICS[topic_id].name in (outcome.explanation or "") for topic_id in outcome.dropped_topics)
    logs = [record for record in session.added if isinstance(record, ReplanLog)]
    assert len(logs) == 1 and logs[0].changes[0]["dropped_topics"] == outcome.dropped_topics
    if outcome.target_choice is not None:
        assert outcome.target_choice["keep_target"]["grade"] == "A"
        assert outcome.target_choice["adjust_goal"]["grade"] != "A"


def test_adherence_at_floor_or_unknown_leaves_plan_unchanged() -> None:
    plan = make_plan()
    session = FakeSession(plan, topics=TOPICS, states=STATES, slots=every_day_slots(plan.id))

    for adherence in (ADHERENCE_FLOOR, None):
        outcome = apply_overload_rule(session, "student-1", plan, adherence, now=NOW)  # type: ignore[arg-type]
        assert not outcome.compressed
    assert "rolling" not in plan.constraints
    assert session.added == []


def test_recovered_adherence_restores_deferred_topics() -> None:
    plan = make_plan(rolling_state={"deferred_topics": ["low"], "session_minutes": 45, "daily_minutes": 60})
    session = FakeSession(plan, topics=TOPICS, states=STATES, slots=every_day_slots(plan.id))

    outcome = apply_overload_rule(session, "student-1", plan, 0.8, now=NOW)  # type: ignore[arg-type]

    assert outcome.restored_topics == ["low"]
    assert plan.constraints["rolling"]["deferred_topics"] == []
    assert schedule_limits(plan) == (60, 120)
    assert "Periodic table" in (outcome.explanation or "")


# --- Final week ------------------------------------------------------------


def test_final_week_activities_never_contain_new_theory() -> None:
    for activity in ("theory", "guided_practice", "structured_questions", *NO_NEW_THEORY_ACTIVITIES):
        for mastery in (0.1, 0.5, 0.9):
            for declining in (False, True):
                for studied in (False, True):
                    mapped = final_week_activity(
                        activity, mastery=mastery, declining=declining, studied=studied
                    )
                    assert mapped in NO_NEW_THEORY_ACTIVITIES

    assert final_week_activity("theory", mastery=0.3, declining=False, studied=False) == "past_paper"
    assert final_week_activity("guided_practice", mastery=0.3, declining=False, studied=True) == (
        "error_review"
    )
    assert final_week_activity("structured_questions", mastery=0.5, declining=True, studied=True) == (
        "recovery_revision"
    )
    assert is_final_week(FINAL_WEEK_DAYS) and not is_final_week(FINAL_WEEK_DAYS + 1)
    assert not is_final_week(0)


def test_final_week_steps_have_no_theory() -> None:
    steps = build_activity_steps(
        duration_minutes=60,
        mastery=0.2,
        studied=False,
        activity="past_paper",
        declining=False,
        question_ids=(),
        allow_theory=False,
    )

    assert [step["kind"] for step in steps] == ["practice"]


def test_generated_final_week_tasks_are_revision_only_and_skip_deferred_topics() -> None:
    plan = make_plan(exam_in_days=5, rolling_state={"deferred_topics": ["low"]})
    session = FakeSession(plan, topics=TOPICS, slots=every_day_slots(plan.id))
    session.scalars = _with_empty(session.scalars, Question, TopicEvidence, StudyTask)  # type: ignore[method-assign]

    response = scheduling.generate_plan_schedule(
        session,  # type: ignore[arg-type]
        "student-1",
        plan.id,
        horizon_days=5,
        now=NOW,
    )

    tasks = [record for record in session.added if isinstance(record, StudyTask)]
    assert tasks and len(tasks) == len(response.tasks)
    assert all(task.activity in NO_NEW_THEORY_ACTIVITIES for task in tasks)
    assert all(step["kind"] != "theory" for task in tasks for step in task.steps)
    assert all(task.reason_details["final_week"] for task in tasks)
    assert all(task.topic_id != "low" for task in tasks)


def _with_empty(scalars: Any, *models: type) -> Any:
    def wrapped(statement: Any) -> Scalars:
        if statement.column_descriptions[0]["entity"] in models:
            return Scalars([])
        return scalars(statement)

    return wrapped


# --- Committed generation ---------------------------------------------------


@pytest.mark.parametrize(("exam_in_days", "expected_window"), [(42, 14), (15, 7), (5, 5)])
def test_generate_commits_only_the_rolling_window_and_builds_roadmap(
    monkeypatch: pytest.MonkeyPatch,
    exam_in_days: int,
    expected_window: int,
) -> None:
    plan = make_plan(exam_in_days=exam_in_days)
    session = FakeSession(plan)
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        scheduling,
        "generate_plan_schedule",
        lambda *_args, **kwargs: captured.update(kwargs) or empty_schedule(),
    )
    monkeypatch.setattr(
        scheduling,
        "build_and_store_roadmap",
        lambda *_args, **_kwargs: captured.setdefault("roadmap", True),
    )

    scheduling.generate_and_commit_schedule(session, "student-1", plan.id, now=NOW)  # type: ignore[arg-type]

    rolling_state = plan.constraints["rolling"]
    assert captured["horizon_days"] == expected_window
    assert captured["roadmap"]
    assert rolling_state["window_days"] == expected_window
    assert rolling_state["window_end"] == (MONDAY + timedelta(days=expected_window - 1)).isoformat()
    assert session.commits == 1


# --- Checkpoints --------------------------------------------------------------


def window_plan(*, daily_minutes: int = 120, **overrides: Any) -> SimpleNamespace:
    state = {
        "window_start": "2026-10-05",
        "window_end": "2026-10-18",
        "window_days": 14,
        "last_checkpoint_at": "2026-10-05T00:00:00+00:00",
        "last_expected_score": 0.5,
    }
    state.update(overrides)
    return make_plan(rolling_state=state, daily_minutes=daily_minutes)


def test_checkpoint_is_due_when_the_window_ends() -> None:
    plan = window_plan()

    assert rolling.checkpoint_status(FakeSession(plan), "student-1", plan, now=NOW) == (  # type: ignore[arg-type]
        True,
        "window_end",
    )


def test_checkpoint_is_due_when_new_assessment_evidence_arrives() -> None:
    plan = window_plan(window_end="2026-10-25")
    session = FakeSession(plan, raw_events=["event-1"])

    assert rolling.checkpoint_status(session, "student-1", plan, now=NOW) == (True, "new_evidence")  # type: ignore[arg-type]
    assert rolling.checkpoint_status(FakeSession(plan), "student-1", plan, now=NOW) == (False, None)  # type: ignore[arg-type]


def test_plan_stops_rolling_in_the_final_week_and_before_first_window() -> None:
    final = make_plan(
        exam_in_days=5,
        rolling_state={"window_start": "2026-10-19", "window_end": "2026-10-23"},
    )
    session = FakeSession(final, raw_events=["event-1"])

    later = NOW + timedelta(days=3)
    fresh = make_plan()
    assert rolling.checkpoint_status(session, "student-1", final, now=later) == (False, None)  # type: ignore[arg-type]
    assert rolling.checkpoint_status(FakeSession(fresh), "student-1", fresh, now=NOW) == (False, None)  # type: ignore[arg-type]


def stub_checkpoint_dependencies(
    monkeypatch: pytest.MonkeyPatch,
    *,
    adherence: float,
    expected: float,
) -> dict[str, Any]:
    captured: dict[str, Any] = {}
    measured = ([], 100, round(100 * adherence), adherence)
    monkeypatch.setattr(rolling, "measure_adherence", lambda *_a, **_k: measured)
    monkeypatch.setattr(rolling, "recompute_for", lambda *_a, **_k: None)
    monkeypatch.setattr(rolling, "refresh_predicted_priorities", lambda *_a, **_k: None)
    monkeypatch.setattr(
        rolling,
        "build_plan_achievability",
        lambda *_a, **_k: {"projected_range": {"low": 0.4, "expected": expected, "high": 0.7}},
    )
    monkeypatch.setattr(
        rolling,
        "generate_plan_schedule",
        lambda *_a, **kwargs: captured.update(kwargs) or empty_schedule(),
    )
    monkeypatch.setattr(rolling, "build_and_store_roadmap", lambda *_a, **_k: [])
    monkeypatch.setattr(rolling, "roadmap_view", lambda *_a, **_k: fake_roadmap())
    return captured


def test_due_checkpoint_rebuilds_window_with_adherence_and_reports_range_change(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = window_plan(daily_minutes=180)
    session = FakeSession(plan, topics=TOPICS, states=STATES, slots=every_day_slots(plan.id, hours=3))
    captured = stub_checkpoint_dependencies(monkeypatch, adherence=0.3, expected=0.6)

    result = rolling.run_checkpoint(session, "student-1", plan.id, now=NOW)  # type: ignore[arg-type]

    assert result.ran and result.trigger == "window_end"
    assert result.compressed and result.deferred_topics == ["low"]
    assert result.target_grade == "A"
    assert result.range_change is not None and result.range_change.direction == "up"
    assert captured["horizon_days"] == 14
    assert plan.constraints["rolling"]["window_start"] == "2026-10-19"
    assert plan.constraints["rolling"]["checkpoint_count"] == 1
    assert plan.constraints["rolling"]["last_expected_score"] == 0.6
    reasons = [record.reason for record in session.added if isinstance(record, ReplanLog)]
    assert any(reason.startswith("Checkpoint (window_end)") for reason in reasons)
    assert session.commits == 1


def test_checkpoint_that_is_not_due_changes_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    plan = window_plan(window_end="2026-10-25")
    session = FakeSession(plan)
    captured = stub_checkpoint_dependencies(monkeypatch, adherence=0.3, expected=0.6)

    result = rolling.run_checkpoint(session, "student-1", plan.id, now=NOW)  # type: ignore[arg-type]

    assert not result.ran
    assert captured == {}
    assert session.commits == 0


def test_range_change_messages_are_kind_in_both_directions() -> None:
    assert rolling.describe_range_change(0.5, 0.6).direction == "up"
    down = rolling.describe_range_change(0.6, 0.5)
    assert down.direction == "down" and "help most" in down.message
    assert rolling.describe_range_change(0.5, 0.505).direction == "same"
    assert rolling.describe_range_change(None, 0.5).direction == "same"


# --- Target choice -----------------------------------------------------------


PENDING_CHOICE = {
    "target_grade": "A",
    "keep_target": {"grade": "A", "hours_per_day": 2.5, "label": "Keep target A"},
    "adjust_goal": {"grade": "B", "hours_per_day": 1.0, "label": "Adjust goal to B"},
}


@pytest.mark.parametrize(
    ("choice", "grade", "deferred"),
    [("keep_target", "A", []), ("adjust_goal", "B", ["low"])],
)
def test_student_chooses_between_keeping_target_and_adjusting_goal(
    monkeypatch: pytest.MonkeyPatch,
    choice: str,
    grade: str,
    deferred: list[str],
) -> None:
    plan = window_plan(window_end="2026-10-25", deferred_topics=["low"], pending_target_choice=PENDING_CHOICE)
    session = FakeSession(plan)
    stub_checkpoint_dependencies(monkeypatch, adherence=0.3, expected=0.6)

    result = rolling.choose_target(session, "student-1", plan.id, choice, now=NOW)  # type: ignore[arg-type]

    assert plan.target_grade == grade
    assert result.target_grade == grade
    assert plan.constraints["rolling"]["pending_target_choice"] is None
    assert plan.constraints["rolling"]["deferred_topics"] == deferred
    log = next(record for record in session.added if isinstance(record, ReplanLog))
    assert log.changes[0] == {"field": "target_grade", "old": "A", "new": grade, "choice": choice}


def test_target_cannot_change_without_a_pending_decision() -> None:
    plan = window_plan()

    with pytest.raises(Conflict, match="no target decision"):
        rolling.choose_target(FakeSession(plan), "student-1", plan.id, "adjust_goal", now=NOW)  # type: ignore[arg-type]
    assert plan.target_grade == "A"


def test_rolling_routes_are_registered() -> None:
    paths = app.openapi()["paths"]

    assert {
        "/api/v1/plans/{plan_id}/roadmap",
        "/api/v1/plans/{plan_id}/checkpoint",
        "/api/v1/plans/{plan_id}/target-choice",
    }.issubset(set(paths))


def empty_schedule() -> ScheduleResponse:
    return ScheduleResponse(tasks=[], infeasible=False, shortfall_minutes=0, unscheduled_minutes={})


def fake_roadmap() -> RoadmapResponse:
    return RoadmapResponse(
        plan_id=uuid4(),
        exam_date=MONDAY + timedelta(days=42),
        days_to_exam=42,
        window_days=14,
        window_start=MONDAY,
        window_end=MONDAY + timedelta(days=13),
        next_checkpoint=MONDAY + timedelta(days=14),
        final_week_start=MONDAY + timedelta(days=35),
        final_week=False,
        checkpoint_due=False,
        deferred_topics=[],
        weeks=[],
    )


def test_replanning_keeps_sessions_being_timed_and_blocks_their_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = make_plan()
    timed = SimpleNamespace(
        id=uuid4(),
        status="planned",
        timer_state="running",
        start_at=NOW + timedelta(hours=14),
        duration_min=60,
    )
    untouched = SimpleNamespace(
        id=uuid4(), status="planned", timer_state="idle", start_at=NOW, duration_min=60
    )
    session = FakeSession(plan, topics=TOPICS, slots=every_day_slots(plan.id))
    deleted: list[Any] = []
    session.delete = deleted.append  # type: ignore[method-assign]
    base_scalars = _with_empty(session.scalars, Question, TopicEvidence)

    def scalars(statement: Any) -> Scalars:
        if statement.column_descriptions[0]["entity"] is StudyTask:
            return Scalars([timed, untouched])
        return base_scalars(statement)

    session.scalars = scalars  # type: ignore[method-assign]
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        scheduling,
        "schedule_tasks",
        lambda **kwargs: captured.update(kwargs) or ScheduleResult((), False, 0, {}),
    )

    scheduling.generate_plan_schedule(session, "student-1", plan.id, horizon_days=7, now=NOW)  # type: ignore[arg-type]

    assert deleted == [untouched]
    assert any(
        item.start_at == timed.start_at and item.end_at == timed.start_at + timedelta(minutes=60)
        for item in captured["commitments"]
    )


def test_rescheduling_missed_work_keeps_every_other_session_in_place(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = make_plan()
    tomorrow = SimpleNamespace(
        id=uuid4(),
        status="planned",
        timer_state="idle",
        start_at=NOW + timedelta(days=1, hours=14),
        duration_min=60,
    )
    session = FakeSession(plan, topics=TOPICS, slots=every_day_slots(plan.id))
    deleted: list[Any] = []
    session.delete = deleted.append  # type: ignore[method-assign]
    base_scalars = _with_empty(session.scalars, Question, TopicEvidence)

    def scalars(statement: Any) -> Scalars:
        if statement.column_descriptions[0]["entity"] is StudyTask:
            return Scalars([tomorrow])
        return base_scalars(statement)

    session.scalars = scalars  # type: ignore[method-assign]
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        scheduling,
        "schedule_tasks",
        lambda **kwargs: captured.update(kwargs) or ScheduleResult((), False, 0, {}),
    )

    scheduling.generate_plan_schedule(  # type: ignore[arg-type]
        session,
        "student-1",
        plan.id,
        horizon_days=7,
        now=NOW,
        duration_overrides={"mid": 45},
        keep_existing=True,
    )

    assert deleted == []
    assert [(item.topic_id, item.duration_minutes) for item in captured["priorities"]] == [("mid", 45)]
    assert any(item.start_at == tomorrow.start_at for item in captured["commitments"])
    tomorrow_local = tomorrow.start_at.astimezone(scheduling.ZoneInfo("UTC")).date()
    assert captured["existing_daily_minutes"] == {tomorrow_local: 60}


def test_new_results_replan_early_only_for_full_papers_and_not_too_often() -> None:
    recent = window_plan(window_end="2026-10-25", last_checkpoint_at="2026-10-18T00:00:00+00:00")
    session = FakeSession(recent, raw_events=["paper-event"])

    # Last checkpoint was yesterday: a new paper waits instead of reshuffling again.
    assert rolling.checkpoint_status(session, "student-1", recent, now=NOW) == (False, None)  # type: ignore[arg-type]

    older = window_plan(window_end="2026-10-25", last_checkpoint_at="2026-10-15T00:00:00+00:00")
    captured: dict[str, Any] = {}
    paper_session = FakeSession(older, raw_events=["paper-event"])
    base_scalars = paper_session.scalars

    def scalars(statement: Any) -> Scalars:
        captured["sql"] = str(statement)
        return base_scalars(statement)

    paper_session.scalars = scalars  # type: ignore[method-assign]
    assert rolling.checkpoint_status(paper_session, "student-1", older, now=NOW) == (True, "new_evidence")  # type: ignore[arg-type]
    # Quizzes (assessments without a paper) do not count.
    assert "raw_events.paper_id IS NOT NULL" in captured["sql"]
