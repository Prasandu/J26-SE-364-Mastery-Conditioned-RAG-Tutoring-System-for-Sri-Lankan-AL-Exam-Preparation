from datetime import UTC, datetime

import pytest

from app.services.priority import (
    LearningProfile,
    choose_activity,
    compute_priority,
    next_review,
)


def priority(**overrides):
    values = {
        "weakness": 0.7,
        "exam_importance": 0.8,
        "days_until_exam": 30,
        "days_since_revision": 20,
        "improvement_potential": 0.6,
        "prerequisite_boost": 0,
    }
    values.update(overrides)
    return compute_priority(**values)


def test_priority_is_monotonic_for_weakness_and_importance() -> None:
    base = priority()

    assert priority(weakness=0.9).score > base.score
    assert priority(exam_importance=1).score > base.score


def test_priority_increases_as_exam_approaches() -> None:
    assert priority(days_until_exam=1).score > priority(days_until_exam=60).score


def test_priority_increases_with_staleness_and_prerequisite_boost() -> None:
    recent = priority(days_since_revision=1)
    stale = priority(days_since_revision=100)
    boosted = priority(prerequisite_boost=1)

    assert stale.score > recent.score
    assert boosted.score > priority().score
    assert "prerequisite boost" in boosted.reason


def test_priority_increases_with_improvement_potential() -> None:
    assert priority(improvement_potential=0.9).score > priority(improvement_potential=0.2).score


def test_adaptive_priority_beats_lowest_mark_baseline_scenario() -> None:
    lowest_mark_topic = priority(
        weakness=0.9,
        exam_importance=0.2,
        days_until_exam=20,
        days_since_revision=10,
        improvement_potential=0.9,
    )
    adaptive_topic = priority(
        weakness=0.65,
        exam_importance=0.95,
        days_until_exam=2,
        days_since_revision=90,
        improvement_potential=0.75,
        prerequisite_boost=0.5,
    )

    assert adaptive_topic.score > lowest_mark_topic.score


def test_priority_accounts_for_exam_weight_same_mastery() -> None:
    # Same weakness (1 - mastery), same days until exam, same staleness
    low_weight_topic = priority(
        weakness=0.8,
        exam_importance=0.1,
        days_until_exam=30,
        days_since_revision=10,
        improvement_potential=0.8,
    )
    high_weight_topic = priority(
        weakness=0.8,
        exam_importance=0.9,
        days_until_exam=30,
        days_since_revision=10,
        improvement_potential=0.8,
    )
    assert high_weight_topic.score > low_weight_topic.score


def test_priority_handles_exam_tomorrow_and_no_prior_revision() -> None:
    result = priority(days_until_exam=1, days_since_revision=None)

    assert result.urgency > 0.9
    assert result.forgetting_risk == 1
    assert 0 < result.score <= 1
    assert result.reason


def test_priority_rejects_out_of_range_inputs() -> None:
    with pytest.raises(ValueError, match="weakness"):
        priority(weakness=1.1)


@pytest.mark.parametrize(
    ("profile", "expected"),
    [
        (LearningProfile(False, False, 0), "theory"),
        (LearningProfile(True, True, 0.9, review_due=True), "spaced_revision"),
        (LearningProfile(True, True, 0.5, repeated_errors=2, recorded_errors=2), "error_review"),
        (LearningProfile(True, True, 0.3), "guided_practice"),
        (LearningProfile(True, True, 0.6), "structured_questions"),
        (LearningProfile(True, True, 0.85), "past_paper"),
    ],
)
def test_choose_activity(profile: LearningProfile, expected: str) -> None:
    assert choose_activity(profile) == expected


def test_choose_activity_no_evidence_or_not_studied_gets_theory_and_guided_practice() -> None:
    no_evidence = LearningProfile(
        studied=False,
        theory_completed=False,
        mastery=0.3,
        has_evidence=False,
    )
    assert choose_activity(no_evidence) == "theory"

    never_studied = LearningProfile(
        studied=False,
        theory_completed=False,
        mastery=0.3,
        has_evidence=True,
    )
    assert choose_activity(never_studied) == "theory"

    studied_low_mastery = LearningProfile(
        studied=True,
        theory_completed=True,
        mastery=0.3,
        has_evidence=True,
    )
    assert choose_activity(studied_low_mastery) == "guided_practice"


def test_choose_activity_error_review_requires_at_least_two_recorded_errors() -> None:
    one_error = LearningProfile(
        studied=True,
        theory_completed=True,
        mastery=0.4,
        repeated_errors=2,
        recorded_errors=1,
    )
    assert choose_activity(one_error) != "error_review"
    assert choose_activity(one_error) == "guided_practice"

    two_errors = LearningProfile(
        studied=True,
        theory_completed=True,
        mastery=0.4,
        repeated_errors=2,
        recorded_errors=2,
    )
    assert choose_activity(two_errors) == "error_review"


def test_choose_activity_skips_error_review_when_topic_is_mostly_correct() -> None:
    old_mistakes = LearningProfile(True, True, 0.5, repeated_errors=1, recorded_errors=6)
    strong_topic = LearningProfile(True, True, 0.7, repeated_errors=3, recorded_errors=3)

    assert choose_activity(old_mistakes) == "structured_questions"
    assert choose_activity(strong_topic) == "structured_questions"


def test_sm2_review_intervals_and_failed_recall() -> None:
    reviewed_at = datetime(2026, 10, 12, 9, tzinfo=UTC)
    first = next_review(
        reviewed_at=reviewed_at,
        quality=4,
        repetitions=0,
        interval_days=0,
        ease=2.5,
    )
    second = next_review(
        reviewed_at=reviewed_at,
        quality=5,
        repetitions=1,
        interval_days=first.interval_days,
        ease=first.ease,
    )
    failed = next_review(
        reviewed_at=reviewed_at,
        quality=2,
        repetitions=4,
        interval_days=30,
        ease=1.3,
    )

    assert first.interval_days == 1
    assert second.interval_days == 6
    assert failed.interval_days == 1
    assert failed.repetitions == 0
    assert failed.ease >= 1.3
