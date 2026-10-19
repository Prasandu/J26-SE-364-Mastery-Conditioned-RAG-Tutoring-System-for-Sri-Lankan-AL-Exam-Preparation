from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import exp, isfinite
from typing import Literal

from app.services.weights import ERROR_REVIEW_MAX_MASTERY, ERROR_REVIEW_MIN_ERRORS


@dataclass(frozen=True)
class PriorityResult:
    score: float
    weakness: float
    exam_importance: float
    urgency: float
    forgetting_risk: float
    improvement_potential: float
    prerequisite_multiplier: float
    reason: str


@dataclass(frozen=True)
class LearningProfile:
    studied: bool
    theory_completed: bool
    mastery: float
    repeated_errors: int = 0  # wrong answers among the most recent attempts
    review_due: bool = False
    has_evidence: bool = True
    recorded_errors: int = 0  # wrong answers across all attempts


@dataclass(frozen=True)
class ReviewSchedule:
    next_review_at: datetime
    interval_days: int
    ease: float
    repetitions: int


Activity = Literal[
    "theory",
    "guided_practice",
    "structured_questions",
    "past_paper",
    "error_review",
    "spaced_revision",
]


def compute_priority(
    *,
    weakness: float,
    exam_importance: float,
    days_until_exam: int,
    days_since_revision: float | None,
    improvement_potential: float,
    prerequisite_boost: float = 0,
) -> PriorityResult:
    """Rank a topic using normalized learner, curriculum, and time signals."""
    _validate_unit_interval("weakness", weakness)
    _validate_unit_interval("exam_importance", exam_importance)
    _validate_unit_interval("improvement_potential", improvement_potential)
    _validate_unit_interval("prerequisite_boost", prerequisite_boost)
    if days_until_exam < 0:
        raise ValueError("days_until_exam cannot be negative.")
    if days_since_revision is not None:
        if not isfinite(days_since_revision) or days_since_revision < 0:
            raise ValueError("days_since_revision must be a finite non-negative number.")

    urgency = 1 / (1 + days_until_exam / 14)
    forgetting_risk = 1.0 if days_since_revision is None else 1 - exp(-days_since_revision / 30)
    prerequisite_multiplier = 1 + 0.25 * prerequisite_boost
    score = min(
        weakness
        * exam_importance
        * urgency
        * forgetting_risk
        * improvement_potential
        * prerequisite_multiplier,
        1.0,
    )

    factors = {
        "weakness": weakness,
        "exam importance": exam_importance,
        "urgency": urgency,
        "forgetting risk": forgetting_risk,
        "improvement potential": improvement_potential,
    }
    leading_factor = max(factors, key=factors.__getitem__)
    reason = (
        f"Priority {score:.2f}: {leading_factor} is the strongest factor; "
        f"{'a prerequisite boost applies.' if prerequisite_boost else 'no prerequisite boost applies.'}"
    )
    return PriorityResult(
        score=score,
        weakness=weakness,
        exam_importance=exam_importance,
        urgency=urgency,
        forgetting_risk=forgetting_risk,
        improvement_potential=improvement_potential,
        prerequisite_multiplier=prerequisite_multiplier,
        reason=reason,
    )


def choose_activity(profile: LearningProfile) -> Activity:
    """Choose a study activity from a learner's current topic state."""
    if not 0 <= profile.mastery <= 1:
        raise ValueError("mastery must be between zero and one.")
    if profile.repeated_errors < 0:
        raise ValueError("repeated_errors cannot be negative.")
    if profile.recorded_errors < 0:
        raise ValueError("recorded_errors cannot be negative.")
    if not profile.has_evidence or not profile.studied:
        return "theory"
    if profile.mastery >= 0.85 and profile.review_due:
        return "spaced_revision"
    if (
        profile.repeated_errors >= ERROR_REVIEW_MIN_ERRORS
        and profile.recorded_errors >= ERROR_REVIEW_MIN_ERRORS
        and profile.mastery < ERROR_REVIEW_MAX_MASTERY
    ):
        return "error_review"
    if not profile.theory_completed and profile.mastery < 0.7:
        return "theory"
    if profile.mastery >= 0.75:
        return "past_paper"
    if profile.mastery >= 0.45:
        return "structured_questions"
    return "guided_practice"


def next_review(
    *,
    reviewed_at: datetime,
    quality: int,
    repetitions: int,
    interval_days: int,
    ease: float,
) -> ReviewSchedule:
    """Calculate the next SM-2-style review date and updated scheduling state."""
    if reviewed_at.tzinfo is None or reviewed_at.utcoffset() is None:
        raise ValueError("reviewed_at must be timezone-aware.")
    if not 0 <= quality <= 5:
        raise ValueError("quality must be between zero and five.")
    if repetitions < 0 or interval_days < 0:
        raise ValueError("repetitions and interval_days cannot be negative.")
    if ease < 1.3:
        raise ValueError("ease must be at least 1.3.")

    updated_ease = max(
        1.3,
        ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
    )
    if quality < 3:
        updated_repetitions = 0
        updated_interval = 1
    else:
        updated_repetitions = repetitions + 1
        if updated_repetitions == 1:
            updated_interval = 1
        elif updated_repetitions == 2:
            updated_interval = 6
        else:
            updated_interval = max(1, round(interval_days * updated_ease))

    reviewed_at = reviewed_at.astimezone(UTC)
    return ReviewSchedule(
        next_review_at=reviewed_at + timedelta(days=updated_interval),
        interval_days=updated_interval,
        ease=updated_ease,
        repetitions=updated_repetitions,
    )


def _validate_unit_interval(name: str, value: float) -> None:
    if not 0 <= value <= 1:
        raise ValueError(f"{name} must be between zero and one.")
