from datetime import UTC, datetime
from types import SimpleNamespace

from app.services.decline import DeclineAlert
from app.services.scheduling import _question_ids_for_topic
from app.services.task_content import build_activity_steps, build_task_reason


def test_reason_builder_includes_explanation_factors_and_decline_alert() -> None:
    decline = DeclineAlert(
        topic_id="alkanes",
        baseline=1.0,
        recent=0.5,
        drop=0.5,
        attempts=(),
        latest_attempt_at=datetime(2026, 10, 1, tzinfo=UTC),
        message="Your last 3 papers show a decline from 10/10 to 5/10.",
    )

    reason = build_task_reason(
        topic_name="Organic chemistry",
        sub_topic_name="Alkanes",
        mastery=0.35,
        trend=-0.2,
        decline=decline,
        exam_weight=0.8,
        days_to_exam=62,
        main_factors={"weakness": 0.65, "exam_weight": 0.8},
        activity="recovery_revision",
    )

    assert reason["topic"] == "Organic chemistry"
    assert reason["sub_topic"] == "Alkanes"
    assert reason["mastery"] == 0.35
    assert reason["trend"] == -0.2
    assert reason["decline_alert"]["drop"] == 0.5
    assert reason["days_to_exam"] == 62
    assert reason["main_factors"] == {"weakness": 0.65, "exam_weight": 0.8}
    assert "redo questions" in reason["activity_recommendation"]


def test_low_mastery_recovery_steps_are_ordered_and_fit_the_slot() -> None:
    steps = build_activity_steps(
        duration_minutes=60,
        mastery=0.35,
        studied=True,
        activity="recovery_revision",
        declining=True,
        question_ids=tuple(f"question-{number}" for number in range(1, 9)),
    )

    assert [step["kind"] for step in steps] == ["theory", "practice", "review"]
    assert sum(step["minutes"] for step in steps) == 60
    assert steps[1]["question_ids"] == [
        "question-1",
        "question-2",
        "question-3",
        "question-4",
        "question-5",
    ]
    assert steps[2]["question_ids"] == steps[1]["question_ids"]


def test_one_minute_slot_keeps_a_practice_step() -> None:
    steps = build_activity_steps(
        duration_minutes=1,
        mastery=0.2,
        studied=False,
        activity="theory",
        declining=True,
        question_ids=("question-1",),
    )

    assert steps == [
        {"kind": "practice", "minutes": 1, "question_ids": ["question-1"]},
    ]


def test_question_selection_prefers_wrong_then_unattempted_questions() -> None:
    questions = [
        SimpleNamespace(question_id="correct", topic_id="alkanes", sub_topic_id=None),
        SimpleNamespace(question_id="unattempted", topic_id="alkanes", sub_topic_id=None),
        SimpleNamespace(question_id="wrong", topic_id="alkanes", sub_topic_id=None),
    ]
    evidence = [
        SimpleNamespace(question_id="correct", score=5, max_score=5),
        SimpleNamespace(question_id="wrong", score=2, max_score=5),
    ]

    class FakeSession:
        def __init__(self) -> None:
            self.results = iter([questions, evidence])

        def scalars(self, _statement):
            values = next(self.results)
            return SimpleNamespace(all=lambda: values)

    assert _question_ids_for_topic(FakeSession(), "student-1", "alkanes") == (
        "wrong",
        "unattempted",
        "correct",
    )
