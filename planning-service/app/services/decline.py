from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from app.services.weights import (
    DECLINE_BASELINE_ATTEMPTS,
    DECLINE_RECENT_ATTEMPTS,
    DECLINE_THRESHOLD,
)


@dataclass(frozen=True)
class DeclineAttempt:
    score: float
    max_score: float
    attempted_at: datetime
    paper_id: str | None = None
    question_id: str | None = None

    @property
    def percentage(self) -> float:
        return self.score / self.max_score


@dataclass(frozen=True)
class DeclineAlert:
    topic_id: str
    baseline: float
    recent: float
    drop: float
    attempts: tuple[DeclineAttempt, ...]
    latest_attempt_at: datetime
    message: str


def detect_decline(
    topic_id: str,
    attempts: Sequence[DeclineAttempt | Mapping],
    *,
    topic_name: str | None = None,
    threshold: float = DECLINE_THRESHOLD,
) -> DeclineAlert | None:
    """Compare the latest three attempts with the strongest earlier baseline."""
    if not topic_id:
        raise ValueError("topic_id must be non-empty.")
    if not 0 <= threshold <= 1:
        raise ValueError("threshold must be between zero and one.")
    normalized = sorted((_coerce_attempt(item) for item in attempts), key=lambda item: item.attempted_at)
    if len(normalized) < DECLINE_RECENT_ATTEMPTS:
        return None

    recent_attempts = normalized[-DECLINE_RECENT_ATTEMPTS:]
    baseline_attempts = normalized[:-DECLINE_RECENT_ATTEMPTS]
    if not baseline_attempts and len(normalized) == DECLINE_RECENT_ATTEMPTS:
        baseline_attempts = normalized[:-1]
    if not baseline_attempts:
        return None

    baseline_sample = sorted(
        baseline_attempts,
        key=lambda item: item.percentage,
        reverse=True,
    )[:DECLINE_BASELINE_ATTEMPTS]
    baseline = sum(item.percentage for item in baseline_sample) / len(baseline_sample)
    recent = sum(item.percentage for item in recent_attempts) / len(recent_attempts)
    drop = baseline - recent
    if drop < threshold:
        return None

    involved = tuple(sorted((*baseline_sample, *recent_attempts), key=lambda item: item.attempted_at))
    label = topic_name or topic_id
    baseline_mark = _format_marks(baseline_sample[0])
    recent_marks = ", ".join(_format_marks(item) for item in recent_attempts)
    return DeclineAlert(
        topic_id=topic_id,
        baseline=baseline,
        recent=recent,
        drop=drop,
        attempts=involved,
        latest_attempt_at=recent_attempts[-1].attempted_at,
        message=(
            f"You scored {baseline_mark} earlier in {label}, but your last "
            f"{len(recent_attempts)} attempts are {recent_marks}. Give it attention."
        ),
    )


def detect_declines(
    attempts_by_topic: Mapping[str, Sequence[DeclineAttempt | Mapping]],
    *,
    topic_names: Mapping[str, str] | None = None,
    threshold: float = DECLINE_THRESHOLD,
) -> list[DeclineAlert]:
    alerts = [
        alert
        for topic_id, attempts in attempts_by_topic.items()
        if (
            alert := detect_decline(
                topic_id,
                attempts,
                topic_name=(topic_names or {}).get(topic_id),
                threshold=threshold,
            )
        )
        is not None
    ]
    return sorted(alerts, key=lambda alert: alert.latest_attempt_at, reverse=True)


def _coerce_attempt(item: DeclineAttempt | Mapping) -> DeclineAttempt:
    if isinstance(item, DeclineAttempt):
        attempt = item
    else:
        attempt = DeclineAttempt(
            score=float(item["score"]),
            max_score=float(item["max_score"]),
            attempted_at=item.get("attempted_at", item.get("observed_at")),
            paper_id=item.get("paper_id"),
            question_id=item.get("question_id"),
        )
    if attempt.max_score <= 0 or not 0 <= attempt.score <= attempt.max_score:
        raise ValueError("attempt scores must be between zero and a positive max_score.")
    if not isinstance(attempt.attempted_at, datetime):
        raise ValueError("each attempt requires a datetime attempted_at.")
    return attempt


def _format_marks(attempt: DeclineAttempt) -> str:
    return f"{_format_number(attempt.score)}/{_format_number(attempt.max_score)}"


def _format_number(value: float) -> str:
    return str(int(value)) if value.is_integer() else f"{value:g}"
