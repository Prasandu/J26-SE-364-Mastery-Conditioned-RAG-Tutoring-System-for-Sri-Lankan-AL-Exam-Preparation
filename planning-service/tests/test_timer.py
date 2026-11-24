from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest

from app.errors import Conflict, NotFound
from app.main import app
from app.models import StudyPlan, StudyTask
from app.services.task_views import elapsed_seconds, scheduled_task_response
from app.services.timer import (
    finish_timer,
    pause_timer,
    resume_timer,
    start_timer,
    stop_timer_for_outcome,
)

# 10:00 in Colombo (UTC+5:30)
T0 = datetime(2026, 10, 20, 4, 30, tzinfo=UTC)
PLAN_ID = uuid4()
PLAN = SimpleNamespace(
    id=PLAN_ID,
    student_id="student-1",
    constraints={"timezone": "Asia/Colombo", "priorities": [{"topic_id": "ketones", "priority": 0.7}]},
)


def make_task(
    *,
    student_id: str = "student-1",
    duration: int = 60,
    status: str = "planned",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        plan_id=PLAN_ID,
        student_id=student_id,
        topic_id="ketones",
        activity="error_review",
        start_at=T0,
        duration_min=duration,
        status=status,
        reason="Weak topic.",
        reason_details=None,
        steps=[],
        replanned_from=None,
        actual_duration_min=None,
        timer_state="idle",
        started_at=None,
        last_resumed_at=None,
        paused_at=None,
        paused_total_sec=0,
    )


class Scalars:
    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def first(self) -> Any:
        return self.values[0] if self.values else None


class FakeSession:
    def __init__(self, *tasks: SimpleNamespace) -> None:
        self.tasks = {task.id: task for task in tasks}
        self.commits = 0

    def get(self, model: type, key: Any) -> Any:
        if model is StudyTask:
            return self.tasks.get(key)
        if model is StudyPlan:
            return PLAN if key == PLAN_ID else None
        return None

    def scalars(self, _statement: Any) -> Scalars:
        # The only query is "this student's other running task".
        return Scalars([task for task in self.tasks.values() if task.timer_state == "running"])

    def flush(self) -> None:
        return None

    def commit(self) -> None:
        self.commits += 1


def test_timer_state_machine_measures_active_time_excluding_pauses() -> None:
    task = make_task()
    session = FakeSession(task)

    started = start_timer(session, "student-1", task.id, now=T0)  # type: ignore[arg-type]
    pause_timer(session, "student-1", task.id, now=T0 + timedelta(minutes=20))  # type: ignore[arg-type]
    resumed = resume_timer(session, "student-1", task.id, now=T0 + timedelta(minutes=30))  # type: ignore[arg-type]
    finished = finish_timer(session, "student-1", task.id, now=T0 + timedelta(minutes=55))  # type: ignore[arg-type]

    assert started.task.timer_state == "running" and started.task.timer_elapsed_sec == 0
    assert resumed.task.timer_elapsed_sec == 20 * 60
    assert task.paused_total_sec == 10 * 60
    assert finished.measured_minutes == 45
    assert finished.suggested_actual_minutes == 45
    assert finished.task.timer_state == "finished"
    assert task.actual_duration_min == 45
    assert task.status == "planned"  # the outcome is chosen next: done / partial / missed
    assert session.commits == 4


@pytest.mark.parametrize(
    ("setup", "action", "message"),
    [
        ("idle", pause_timer, "Only a running timer"),
        ("idle", resume_timer, "Only a paused timer"),
        ("idle", finish_timer, "Start the timer"),
        ("running", start_timer, "already running"),
        ("running", resume_timer, "Only a paused timer"),
        ("paused", pause_timer, "Only a running timer"),
    ],
)
def test_invalid_timer_transitions_are_rejected(setup: str, action: Any, message: str) -> None:
    task = make_task()
    session = FakeSession(task)
    if setup != "idle":
        start_timer(session, "student-1", task.id, now=T0)  # type: ignore[arg-type]
    if setup == "paused":
        pause_timer(session, "student-1", task.id, now=T0 + timedelta(minutes=5))  # type: ignore[arg-type]

    with pytest.raises(Conflict, match=message):
        action(session, "student-1", task.id, now=T0 + timedelta(minutes=10))


def test_timer_only_works_on_own_planned_tasks() -> None:
    done = make_task(status="completed")
    other = make_task(student_id="student-2")
    session = FakeSession(done, other)

    with pytest.raises(Conflict, match="planned sessions"):
        start_timer(session, "student-1", done.id, now=T0)  # type: ignore[arg-type]
    with pytest.raises(NotFound):
        start_timer(session, "student-1", other.id, now=T0)  # type: ignore[arg-type]


def test_starting_a_second_task_pauses_the_running_one() -> None:
    first, second = make_task(), make_task()
    session = FakeSession(first, second)
    start_timer(session, "student-1", first.id, now=T0)  # type: ignore[arg-type]

    result = start_timer(session, "student-1", second.id, now=T0 + timedelta(minutes=15))  # type: ignore[arg-type]

    assert result.task.timer_state == "running"
    assert result.paused_task is not None and result.paused_task.id == first.id
    assert result.paused_task.timer_state == "paused"
    assert result.paused_task.timer_elapsed_sec == 15 * 60
    assert "paused" in (result.message or "")
    assert [task.timer_state for task in (first, second)].count("running") == 1


def test_resuming_a_task_pauses_any_other_running_task() -> None:
    first, second = make_task(), make_task()
    session = FakeSession(first, second)
    start_timer(session, "student-1", first.id, now=T0)  # type: ignore[arg-type]
    start_timer(session, "student-1", second.id, now=T0 + timedelta(minutes=5))  # type: ignore[arg-type]

    result = resume_timer(session, "student-1", first.id, now=T0 + timedelta(minutes=10))  # type: ignore[arg-type]

    assert first.timer_state == "running" and second.timer_state == "paused"
    assert result.paused_task is not None and result.paused_task.id == second.id


def test_elapsed_time_survives_a_refresh_because_it_is_rebuilt_from_server_state() -> None:
    task = make_task()
    start_timer(FakeSession(task), "student-1", task.id, now=T0)  # type: ignore[arg-type]

    # A page refresh just re-reads the stored task later; nothing comes from the client.
    after_refresh = scheduled_task_response(task, 0.7, now=T0 + timedelta(minutes=12, seconds=30))

    assert after_refresh.timer_state == "running"
    assert after_refresh.timer_started_at == T0
    assert after_refresh.timer_elapsed_sec == 750

    pause_timer(FakeSession(task), "student-1", task.id, now=T0 + timedelta(minutes=20))  # type: ignore[arg-type]
    assert elapsed_seconds(task, T0 + timedelta(hours=3)) == 20 * 60


def test_session_longer_than_three_times_planned_needs_confirmation() -> None:
    task = make_task(duration=30)
    session = FakeSession(task)
    start_timer(session, "student-1", task.id, now=T0)  # type: ignore[arg-type]

    unconfirmed = finish_timer(session, "student-1", task.id, now=T0 + timedelta(minutes=100))  # type: ignore[arg-type]

    assert unconfirmed.requires_confirmation
    assert "100 minutes" in (unconfirmed.confirmation_reason or "")
    assert unconfirmed.measured_minutes == 100
    assert unconfirmed.suggested_actual_minutes == 30
    assert task.timer_state == "running" and task.actual_duration_min is None

    confirmed = finish_timer(  # type: ignore[arg-type]
        session,
        "student-1",
        task.id,
        confirmed_minutes=25,
        now=T0 + timedelta(minutes=101),
    )

    assert not confirmed.requires_confirmation
    assert task.timer_state == "finished"
    assert task.actual_duration_min == 25


def test_session_running_past_local_midnight_needs_confirmation() -> None:
    task = make_task(duration=60)
    session = FakeSession(task)
    late_evening = datetime(2026, 10, 20, 18, 20, tzinfo=UTC)  # 23:50 in Colombo
    start_timer(session, "student-1", task.id, now=late_evening)  # type: ignore[arg-type]

    result = finish_timer(session, "student-1", task.id, now=late_evening + timedelta(minutes=20))  # type: ignore[arg-type]

    assert result.requires_confirmation
    assert "midnight" in (result.confirmation_reason or "")


def test_measured_minutes_above_plan_are_capped_for_actual_duration() -> None:
    task = make_task(duration=60)
    session = FakeSession(task)
    start_timer(session, "student-1", task.id, now=T0)  # type: ignore[arg-type]

    result = finish_timer(session, "student-1", task.id, now=T0 + timedelta(minutes=75))  # type: ignore[arg-type]

    assert result.measured_minutes == 75
    assert result.suggested_actual_minutes == 60
    assert task.actual_duration_min == 60


def test_recording_an_outcome_stops_an_active_timer() -> None:
    task = make_task()
    start_timer(FakeSession(task), "student-1", task.id, now=T0)  # type: ignore[arg-type]

    stop_timer_for_outcome(task, now=T0 + timedelta(minutes=10))

    assert task.timer_state == "finished"
    assert elapsed_seconds(task, T0 + timedelta(hours=1)) == 600


def test_timer_routes_and_columns_exist() -> None:
    paths = app.openapi()["paths"]
    columns = StudyTask.__table__.c.keys()

    assert {
        f"/api/v1/tasks/{{task_id}}/timer/{action}" for action in ("start", "pause", "resume", "finish")
    }.issubset(set(paths))
    assert {"timer_state", "started_at", "last_resumed_at", "paused_at", "paused_total_sec"}.issubset(columns)
    assert "ix_study_tasks_student_timer_running" in {index.name for index in StudyTask.__table__.indexes}
