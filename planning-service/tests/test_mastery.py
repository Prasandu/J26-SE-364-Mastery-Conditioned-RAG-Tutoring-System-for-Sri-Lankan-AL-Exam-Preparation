from datetime import UTC, datetime, timedelta

import pytest

from app.services.mastery import (
    EvidenceObservation,
    compute_error_rate,
    compute_mastery,
    compute_trend,
    compute_weak_score,
)
from app.services.weights import (
    MASTERY_COMPONENT_WEIGHTS,
    WEAK_SCORE_WEIGHTS,
    weights_sum_to_one,
)

AS_OF = datetime(2026, 10, 12, tzinfo=UTC)


def observation(
    score: float,
    *,
    difficulty: float = 0.5,
    days_ago: int = 0,
    confidence: float | None = 0.7,
) -> EvidenceObservation:
    return EvidenceObservation(
        score=score,
        max_score=100,
        difficulty=difficulty,
        observed_at=AS_OF - timedelta(days=days_ago),
        confidence=confidence,
    )


def test_harder_question_marks_indicate_less_weakness_than_easy_marks() -> None:
    hard_evidence = [observation(40, difficulty=0.9)] * 5
    easy_evidence = [observation(40, difficulty=0.1)] * 5
    hard_mastery = compute_mastery(hard_evidence, as_of=AS_OF)
    easy_mastery = compute_mastery(easy_evidence, as_of=AS_OF)

    assert hard_mastery > easy_mastery
    hard_weakness = compute_weak_score(
        mastery=hard_mastery,
        trend=0,
        error_rate=compute_error_rate(hard_evidence, as_of=AS_OF),
        days_since_revision=0,
        difficulty=0.9,
        exam_weight=0.5,
        confidence=0.7,
    )
    easy_weakness = compute_weak_score(
        mastery=easy_mastery,
        trend=0,
        error_rate=compute_error_rate(easy_evidence, as_of=AS_OF),
        days_since_revision=0,
        difficulty=0.1,
        exam_weight=0.5,
        confidence=0.7,
    )
    assert hard_weakness < easy_weakness


def test_same_marks_with_declining_trend_rank_weaker() -> None:
    declining = [observation(score) for score in (80, 65, 50, 40)]
    steady = [observation(60) for _ in range(4)]

    assert compute_trend(declining) < compute_trend(steady)
    declining_weakness = compute_weak_score(
        mastery=0.6,
        trend=compute_trend(declining),
        error_rate=0.4,
        days_since_revision=2,
        difficulty=0.5,
        exam_weight=0.5,
        confidence=0.7,
    )
    steady_weakness = compute_weak_score(
        mastery=0.6,
        trend=compute_trend(steady),
        error_rate=0.4,
        days_since_revision=2,
        difficulty=0.5,
        exam_weight=0.5,
        confidence=0.7,
    )

    assert declining_weakness > steady_weakness


def test_stale_topic_ranks_weaker_than_recently_revised_topic() -> None:
    shared = {
        "mastery": 0.7,
        "trend": 0.1,
        "error_rate": 0.3,
        "difficulty": 0.5,
        "exam_weight": 0.5,
        "confidence": 0.7,
    }

    recent = compute_weak_score(**shared, days_since_revision=1)
    stale = compute_weak_score(**shared, days_since_revision=120)

    assert stale > recent


def test_higher_confidence_reduces_weakness() -> None:
    shared = {
        "mastery": 0.7,
        "trend": 0.1,
        "error_rate": 0.3,
        "days_since_revision": 1,
        "difficulty": 0.5,
        "exam_weight": 0.5,
    }

    assert compute_weak_score(**shared, confidence=0.9) < compute_weak_score(
        **shared,
        confidence=0.2,
    )


def test_exam_importance_increases_weak_topic_priority_score() -> None:
    shared = {
        "mastery": 0.7,
        "trend": 0.1,
        "error_rate": 0.3,
        "days_since_revision": 1,
        "difficulty": 0.5,
        "confidence": 0.7,
    }

    assert compute_weak_score(**shared, exam_weight=0.9) > compute_weak_score(
        **shared,
        exam_weight=0.1,
    )


def test_component_weights_sum_to_one() -> None:
    assert weights_sum_to_one(MASTERY_COMPONENT_WEIGHTS)
    assert weights_sum_to_one(WEAK_SCORE_WEIGHTS)


def test_no_evidence_has_no_mastery_trend_or_error_rate() -> None:
    assert compute_mastery([], as_of=AS_OF) == 0
    assert compute_trend([]) == 0
    assert compute_error_rate([]) == 0


def test_mastery_rewards_coverage_and_consistent_performance() -> None:
    sparse = [observation(80)]
    covered_consistent = [observation(80) for _ in range(5)]
    covered_inconsistent = [observation(score) for score in (10, 95, 15, 90, 80)]

    assert compute_mastery(covered_consistent, as_of=AS_OF) > compute_mastery(
        sparse,
        as_of=AS_OF,
    )
    assert compute_mastery(covered_consistent, as_of=AS_OF) > compute_mastery(
        covered_inconsistent,
        as_of=AS_OF,
    )


def test_mastery_gives_more_weight_to_recent_evidence() -> None:
    improving = [observation(20, days_ago=90), observation(80)]
    declining = [observation(80, days_ago=90), observation(20)]

    assert compute_mastery(improving, as_of=AS_OF) > compute_mastery(
        declining,
        as_of=AS_OF,
    )


@pytest.mark.parametrize(
    ("score", "max_score"),
    [(-1, 10), (11, 10), (1, 0)],
)
def test_invalid_evidence_is_rejected(score: float, max_score: float) -> None:
    with pytest.raises(ValueError):
        compute_mastery(
            [EvidenceObservation(score=score, max_score=max_score)],
            as_of=AS_OF,
        )
