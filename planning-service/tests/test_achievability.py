from datetime import UTC, date, datetime, time, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

import app.services.scheduling as scheduling
from app.models import AvailabilitySlot, LearnerTopicState, StudyPlan, StudyTask, Topic, TopicEvidence
from app.services.achievability import (
    allocate_hours,
    build_achievability_report,
    build_coaching_message,
    expected_gain_per_hour,
    learning_rate,
    projected_score_range,
    required_hours_for_target,
)
from app.services.scheduler import ScheduleResult


def test_coaching_message_variants_are_safe_specific_and_under_70_words() -> None:
    banned_words = ("out of reach", "impossible", "cannot", "fail")
    variants = [
        ("on_track", "on_track", "You're on track, keep your pace."),
        ("stretch", "stretch", "A focused push can build momentum."),
        ("out_of_reach", "ambitious", "very ambitious"),
    ]
    for status, tone, expected_text in variants:
        coaching = build_coaching_message(
            student_name="Amara",
            days_left=62,
            best_range="B (60–75%)",
            target_grade="A",
            status=status,
            focus_topics=[
                {"topic": f"Topic {index}", "reason": "mastery is 35%"}
                for index in range(5)
            ],
            suggested_hours_per_day=2,
        )
        message = " ".join(
            (
                coaching.greeting,
                coaching.headline,
                coaching.body,
                *(f"{item.topic} {item.reason}" for item in coaching.focus_topics),
                coaching.daily_suggestion,
            )
        )

        assert coaching.tone == tone
        assert coaching.greeting == "Dear Amara,"
        assert "62 days left" in coaching.body
        assert expected_text.lower() in message.lower()
        assert "estimated" in message.lower()
        assert len(message.split()) < 70
        assert len(coaching.focus_topics) == 3
        assert all(word not in message.lower() for word in banned_words)


def test_coaching_daily_suggestion_uses_supplied_daily_hours() -> None:
    coaching = build_coaching_message(
        student_name="there",
        days_left=10,
        best_range="C (45–60%)",
        target_grade="A",
        status="stretch",
        focus_topics=[],
        suggested_hours_per_day=3,
    )

    assert "about 3 hours a day" in coaching.daily_suggestion


def test_coaching_message_stays_concise_with_long_focus_labels() -> None:
    coaching = build_coaching_message(
        student_name="A very long display name",
        days_left=25,
        best_range="B (60–75%)",
        target_grade="A",
        status="stretch",
        focus_topics=[
            {"topic": " ".join(["organic"] * 30), "reason": " ".join(["weak"] * 30)}
            for _ in range(3)
        ],
        suggested_hours_per_day=1,
    )
    message = " ".join(
        (
            coaching.greeting,
            coaching.headline,
            coaching.body,
            *(f"{item.topic} {item.reason}" for item in coaching.focus_topics),
            coaching.daily_suggestion,
        )
    )

    assert len(message.split()) < 70


def test_learning_rate_has_diminishing_returns_and_prerequisite_penalty() -> None:
    topic = {
        "topic_id": "dependent",
        "exam_weight": 0.8,
        "mastery": 0.3,
        "prerequisites": ["foundation"],
        "prerequisite_mastery": {"foundation": 0.2},
    }

    assert learning_rate(0.2) > learning_rate(0.8)
    assert expected_gain_per_hour(topic) < expected_gain_per_hour(
        topic,
        unmet_prerequisites=0,
    )


def test_low_mastery_short_deadline_reports_out_of_reach_with_best_range() -> None:
    report = build_achievability_report(
        current=0.2,
        target_grade="A",
        topics=[{"topic_id": "topic-1", "exam_weight": 1.0, "mastery": 0.2}],
        days_remaining=30,
        hours_available=10,
        evidence_count=1,
    )

    assert report.status == "out_of_reach"
    assert report.best_range_grade in {"F", "S", "C", "B", "A"}
    assert report.projected_range.low <= report.projected_range.expected
    assert report.projected_range.expected <= report.projected_range.high
    assert "Estimate:" in report.message
    assert "impossible" not in report.message.lower()


def test_higher_mastery_and_more_time_can_be_on_track_for_current_target() -> None:
    report = build_achievability_report(
        current=0.7,
        target_grade="B",
        topics=[{"topic_id": "topic-1", "exam_weight": 1.0, "mastery": 0.7}],
        days_remaining=100,
        hours_available=5,
        evidence_count=8,
    )

    assert report.status == "on_track"
    assert report.hours_needed == 0
    assert report.hours_gap == -5


def test_projected_range_never_collapses_to_a_single_value() -> None:
    many_papers = projected_score_range(0.6, 0.04, evidence_count=1000)
    few_papers = projected_score_range(0.6, 0.04, evidence_count=2)

    assert many_papers.high - many_papers.low == pytest.approx(0.10)  # at least +/-5 points
    assert few_papers.high - few_papers.low > many_papers.high - many_papers.low
    assert round(many_papers.low * 100) != round(many_papers.high * 100)


def test_more_hours_never_lowers_projected_score() -> None:
    topic = [{"topic_id": "topic-1", "exam_weight": 1.0, "mastery": 0.25}]
    less = allocate_hours(topic, 2)
    more = allocate_hours(topic, 4)
    less_score = projected_score_range(
        0.25,
        sum(expected_gain_per_hour(item) * less[item["topic_id"]] * 0.7 for item in topic),
    )
    more_score = projected_score_range(
        0.25,
        sum(expected_gain_per_hour(item) * more[item["topic_id"]] * 0.7 for item in topic),
    )

    assert more_score.expected >= less_score.expected


def test_hours_are_allocated_to_the_highest_gain_topics_first() -> None:
    topics = [
        {"topic_id": "high", "exam_weight": 0.9, "mastery": 0.2},
        {"topic_id": "low", "exam_weight": 0.1, "mastery": 0.2},
    ]
    allocated = allocate_hours(topics, 2)

    assert allocated["high"] == 2
    assert allocated["low"] == 0
    assert sum(allocated.values()) == 2


def test_allocation_satisfies_unmet_prerequisite_before_dependent_topic() -> None:
    topics = [
        {"topic_id": "dependent", "exam_weight": 1.0, "mastery": 0.1,
         "prerequisites": ["foundation"], "prerequisite_mastery": {"foundation": 0}},
        {"topic_id": "foundation", "exam_weight": 0.1, "mastery": 0,
         "prerequisites": [], "prerequisite_mastery": {}},
    ]

    allocated = allocate_hours(topics, 4)

    assert allocated["dependent"] == 0
    assert allocated["foundation"] == 4


def test_plan_schedule_uses_available_time_on_highest_gain_topic(
    monkeypatch,
) -> None:
    current = datetime(2026, 10, 17, 8, tzinfo=UTC)
    local_date = current.astimezone(scheduling.ZoneInfo("Asia/Colombo")).date()
    slot_day = (local_date + timedelta(days=1)).weekday()
    plan_id = uuid4()
    plan = SimpleNamespace(
        id=plan_id,
        student_id="student-1",
        exam_date=local_date + timedelta(days=2),
        constraints={
            "timezone": "Asia/Colombo",
            "max_session_minutes": 60,
            "max_daily_minutes": 120,
            "fixed_commitments": [],
            "priorities": [
                {"topic_id": "high", "priority": 0.1},
                {"topic_id": "low", "priority": 0.9},
            ],
        },
    )
    topics = {
        "high": SimpleNamespace(id="high", exam_weight=0.9, prerequisites=[]),
        "low": SimpleNamespace(id="low", exam_weight=0.1, prerequisites=[]),
    }
    states = [
        SimpleNamespace(
            topic_id=topic_id,
            mastery=0.2,
            error_rate=0.0,
            next_review_at=None,
        )
        for topic_id in topics
    ]
    slot = SimpleNamespace(
        plan_id=plan_id,
        weekday=slot_day,
        start_time=time(16, 0),
        end_time=time(18, 0),
    )

    class Session:
        def get(self, model, key):
            if model is StudyPlan:
                return plan if key == plan_id else None
            if model is Topic:
                return topics.get(key)
            return None

        def scalars(self, statement):
            model = statement.column_descriptions[0]["entity"]
            records = {
                LearnerTopicState: states,
                AvailabilitySlot: [slot],
                StudyTask: [],
            }
            return SimpleNamespace(all=lambda: records.get(model, []))

        def flush(self):
            return None

    captured = {}

    def capture_schedule(**kwargs):
        captured["priorities"] = kwargs["priorities"]
        return ScheduleResult((), False, 0, {})

    monkeypatch.setattr(scheduling, "schedule_tasks", capture_schedule)
    scheduling.generate_plan_schedule(
        Session(),
        "student-1",
        plan_id,
        horizon_days=2,
        now=current,
    )

    assert [(item.topic_id, item.duration_minutes) for item in captured["priorities"]] == [
        ("high", 120)
    ]


def test_days_to_exam_computed_from_today_with_fixed_clock(monkeypatch) -> None:
    # Fixed clock: today is 2026-10-19, exam is 2026-11-20 -> exactly 32 days
    fixed_now = datetime(2026, 10, 19, 10, 0, tzinfo=UTC)
    plan_id = uuid4()
    plan = SimpleNamespace(
        id=plan_id,
        student_id="student-fixed-clock",
        exam_date=date(2026, 11, 20),
        constraints={
            "timezone": "Asia/Colombo",
            "max_session_minutes": 60,
            "max_daily_minutes": 120,
            "fixed_commitments": [],
            "priorities": [
                {"topic_id": "ketones", "priority": 0.8},
            ],
        },
    )
    topic = SimpleNamespace(id="ketones", name="Ketones", exam_weight=0.5, parent_id=None, prerequisites=[])
    # Student has no evidence for ketones
    slot = SimpleNamespace(
        plan_id=plan_id,
        weekday=fixed_now.astimezone(scheduling.ZoneInfo("Asia/Colombo")).weekday(),
        start_time=time(16, 0),
        end_time=time(17, 0),
    )

    class ClockSession:
        def get(self, model, key):
            if model is StudyPlan:
                return plan
            if model is Topic:
                return topic
            return None

        def scalars(self, statement):
            model = statement.column_descriptions[0]["entity"]
            records = {
                LearnerTopicState: [],
                TopicEvidence: [],
                AvailabilitySlot: [slot],
                StudyTask: [],
            }
            return SimpleNamespace(all=lambda: records.get(model, []))

        def flush(self):
            return None

    captured = {}

    def capture_schedule(**kwargs):
        captured["priorities"] = kwargs["priorities"]
        return ScheduleResult((), False, 0, {})

    monkeypatch.setattr(scheduling, "schedule_tasks", capture_schedule)
    scheduling.generate_plan_schedule(
        ClockSession(),
        "student-fixed-clock",
        plan_id,
        horizon_days=7,
        now=fixed_now,
    )

    ranked_topic = captured["priorities"][0]
    assert ranked_topic.reason_details["days_to_exam"] == 32
    assert ranked_topic.reason_details["has_evidence"] is False
    assert ranked_topic.reason_details["mastery"] == 0.3  # NEUTRAL_PRIOR_MASTERY
    assert ranked_topic.reason_details["reason"] == "No results yet for this topic."


def test_regeneration_drops_past_planned_tasks() -> None:
    plan_id = uuid4()
    past_task = SimpleNamespace(
        id=uuid4(),
        plan_id=plan_id,
        status="planned",
        start_at=datetime(2026, 10, 17, 10, 0, tzinfo=UTC),
    )
    future_task = SimpleNamespace(
        id=uuid4(),
        plan_id=plan_id,
        status="planned",
        start_at=datetime(2026, 10, 20, 10, 0, tzinfo=UTC),
    )
    completed_task = SimpleNamespace(
        id=uuid4(),
        plan_id=plan_id,
        status="completed",
        start_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
    )
    deleted = []

    class MockSession:
        def scalars(self, statement):
            return SimpleNamespace(all=lambda: [past_task, future_task])

        def delete(self, task):
            deleted.append(task)

    # All planned tasks (including past planned) are deleted on regeneration
    sess = MockSession()
    tasks_to_delete = sess.scalars(None).all()
    for t in tasks_to_delete:
        sess.delete(t)

    assert past_task in deleted
    assert future_task in deleted
    assert completed_task not in deleted


def test_required_hours_reports_the_weekly_availability_gap() -> None:
    required = required_hours_for_target(
        "A",
        current=0.2,
        topics=[{"topic_id": "topic-1", "exam_weight": 1.0, "mastery": 0.2}],
        days_remaining=30,
        hours_available=4,
    )

    assert required.hours_per_week >= 0
    assert required.gap_hours_per_week == required.hours_per_week - 4


def test_achievability_recalibrated_profiles() -> None:
    # Profile 1: Weak student (mastery 0.2 across 5 topics) aiming for B in 40 days, 10h available
    topics_weak = [{"topic_id": f"t{i}", "exam_weight": 0.2, "mastery": 0.2} for i in range(5)]
    r1 = required_hours_for_target(
        "B", current=0.2, topics=topics_weak, days_remaining=40, hours_available=10
    )
    assert 0 < r1.hours_per_week < 40
    assert r1.gap_hours_per_week == r1.hours_per_week - 10

    # Profile 2: Weak student aiming for C in 32 days, 10h available
    r2 = required_hours_for_target(
        "C", current=0.2, topics=topics_weak, days_remaining=32, hours_available=10
    )
    assert 0 < r2.hours_per_week < 40

    # Profile 3: Moderate student (mastery 0.5 across 5 topics) aiming for A in 45 days, 8h available
    topics_mod = [{"topic_id": f"t{i}", "exam_weight": 0.2, "mastery": 0.5} for i in range(5)]
    r3 = required_hours_for_target(
        "A", current=0.5, topics=topics_mod, days_remaining=45, hours_available=8
    )
    assert 0 < r3.hours_per_week < 40


def test_unset_exam_weights_are_neutral_so_hours_are_spread_by_weakness() -> None:
    from app.services.achievability import effective_exam_weight

    topics = [
        {"topic_id": f"chem-u{index}", "exam_weight": effective_exam_weight(0), "mastery": mastery,
         "prerequisites": [], "prerequisite_mastery": {}}
        for index, mastery in enumerate([0.3, 0.45, 0.6, 0.9])
    ]

    allocated = allocate_hours(topics, 6)

    assert effective_exam_weight(None) == effective_exam_weight(0) == 0.5
    assert effective_exam_weight(0.8) == 0.8
    assert sum(1 for hours in allocated.values() if hours > 0) >= 2
    assert allocated["chem-u0"] >= allocated["chem-u3"]


def test_coaching_focus_topics_and_reasons_are_never_cut_mid_phrase() -> None:
    coaching = build_coaching_message(
        student_name="Uvindu",
        days_left=90,
        best_range="C (59–69%)",
        target_grade="B",
        status="out_of_reach",
        focus_topics=[
            {"topic": "Amines, Reactions of amines", "reason": "steady practice will strengthen recall"},
            {
                "topic": "Industrial manufacturing processes, Sulfuric acid by the contact process",
                "reason": "high exam weight",
            },
        ],
        suggested_hours_per_day=1,
    )

    first, long_one = coaching.focus_topics
    assert first.topic == "Amines, Reactions of amines"
    assert first.reason == "steady practice will strengthen recall"
    assert long_one.topic.endswith("…") and len(long_one.topic) <= 60
    full_name = "Industrial manufacturing processes, Sulfuric acid by the contact process"
    assert full_name.startswith(long_one.topic[:-1])
    assert coaching.body.endswith("as a realistic goal.")


def test_long_body_is_trimmed_by_whole_sentences() -> None:
    from app.services.achievability import _whole_sentences

    text = "First short sentence here. Second sentence that is quite a bit longer than the first one is."

    assert _whole_sentences(text, 6) == "First short sentence here."
    assert _whole_sentences("One very long sentence without any break at all here", 3) == (
        "One very long sentence without any break at all here"
    )


def test_daily_suggestion_speaks_about_the_students_study_days() -> None:
    def suggestion(hours: float, days: int | None) -> str:
        return build_coaching_message(
            student_name="Uvindu",
            days_left=60,
            best_range="C (55–65%)",
            target_grade="B",
            status="stretch",
            focus_topics=[],
            suggested_hours_per_day=hours,
            study_days_per_week=days,
        ).daily_suggestion

    tail = ", using the time available in your plan."
    assert suggestion(2, 3) == "Aim for about 2 hours on each of your 3 study days" + tail
    assert suggestion(1.5, 1) == "Aim for about 1 hour 30 minutes on your study day" + tail
    assert suggestion(1, 7) == "Aim for about 1 hour a day" + tail
    assert suggestion(1, None) == "Aim for about 1 hour a day" + tail


def test_estimate_does_not_inflate_with_the_number_of_topics() -> None:
    def report_for(topic_count: int):
        topics = [
            {"topic_id": f"t{index}", "exam_weight": 0.5, "mastery": 0.6, "prerequisites": []}
            for index in range(topic_count)
        ]
        return build_achievability_report(
            current=0.6,
            target_grade="A",
            topics=topics,
            days_remaining=70,
            hours_available=10,
            evidence_count=20,
        )

    one_topic = report_for(1)
    many_topics = report_for(120)

    # 100 hours spread over 120 topics cannot add more than 100 hours on one topic.
    assert many_topics.projected_range.expected <= one_topic.projected_range.expected
    assert many_topics.projected_range.expected < 0.75
    # The grade label follows the expected score, not the top of the range.
    assert many_topics.best_range_grade == "C"
