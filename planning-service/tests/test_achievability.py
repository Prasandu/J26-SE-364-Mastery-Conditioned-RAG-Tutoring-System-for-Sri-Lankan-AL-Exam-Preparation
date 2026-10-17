from datetime import UTC, datetime, time, timedelta
from types import SimpleNamespace
from uuid import uuid4

import app.services.scheduling as scheduling
from app.models import AvailabilitySlot, LearnerTopicState, StudyPlan, StudyTask, Topic
from app.services.achievability import (
    allocate_hours,
    build_achievability_report,
    expected_gain_per_hour,
    learning_rate,
    projected_score_range,
    required_hours_for_target,
)
from app.services.scheduler import ScheduleResult


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
