from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from math import exp, isfinite, sqrt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LearnerTopicState, Topic, TopicEvidence
from app.services.weights import (
    COVERAGE_TARGET_EVIDENCE,
    DIFFICULTY_ADJUSTMENT,
    DIFFICULTY_WEIGHT_BASE,
    MASTERY_COMPONENT_WEIGHTS,
    RECENCY_HALF_LIFE_DAYS,
    STALE_HALF_LIFE_DAYS,
    WEAK_SCORE_WEIGHTS,
)


@dataclass(frozen=True)
class EvidenceObservation:
    score: float
    max_score: float
    difficulty: float = 0.5
    observed_at: datetime | None = None
    confidence: float | None = None


def compute_mastery(
    evidence: Sequence[EvidenceObservation],
    *,
    as_of: datetime | None = None,
) -> float:
    """Estimate mastery, giving recent, harder evidence more influence.

    Partial credit is modestly adjusted by question difficulty; evidence
    coverage and score consistency reduce overconfidence from sparse or erratic data.
    """
    if not evidence:
        return 0.0

    now = _as_utc(as_of or datetime.now(UTC))
    normalized_scores: list[float] = []
    evidence_weights: list[float] = []
    for observation in evidence:
        _validate_observation(observation)
        raw_score = observation.score / observation.max_score
        difficulty = _clamp(observation.difficulty)
        adjusted_score = _clamp(raw_score + DIFFICULTY_ADJUSTMENT * (difficulty - 0.5))
        recency = _recency_weight(observation.observed_at, now)
        difficulty_weight = DIFFICULTY_WEIGHT_BASE + difficulty
        normalized_scores.append(adjusted_score)
        evidence_weights.append(recency * difficulty_weight)

    total_weight = sum(evidence_weights)
    if total_weight == 0:
        return 0.0
    performance = (
        sum(score * weight for score, weight in zip(normalized_scores, evidence_weights, strict=True))
        / total_weight
    )
    variance = (
        sum(
            weight * (score - performance) ** 2
            for score, weight in zip(normalized_scores, evidence_weights, strict=True)
        )
        / total_weight
    )
    consistency = _clamp(1 - 2 * sqrt(variance))
    coverage = min(len(evidence) / COVERAGE_TARGET_EVIDENCE, 1.0)

    return _clamp(
        MASTERY_COMPONENT_WEIGHTS["performance"] * performance
        + MASTERY_COMPONENT_WEIGHTS["consistency"] * consistency
        + MASTERY_COMPONENT_WEIGHTS["coverage"] * coverage
    )


def compute_trend(evidence: Sequence[EvidenceObservation]) -> float:
    """Return the per-observation linear score trend, normalized to [-1, 1]."""
    if not evidence:
        return 0.0
    ordered = sorted(evidence, key=lambda item: _as_utc(item.observed_at))
    scores = []
    for item in ordered:
        _validate_observation(item)
        scores.append(_clamp(item.score / item.max_score))
    if len(scores) == 1:
        return 0.0

    mean_x = (len(scores) - 1) / 2
    mean_y = sum(scores) / len(scores)
    denominator = sum((index - mean_x) ** 2 for index in range(len(scores)))
    slope = sum((index - mean_x) * (score - mean_y) for index, score in enumerate(scores))
    return _clamp(slope / denominator if denominator else 0.0, -1.0, 1.0)


def compute_error_rate(
    evidence: Sequence[EvidenceObservation],
    *,
    as_of: datetime | None = None,
) -> float:
    """Return the average proportion of marks missed across observations."""
    if not evidence:
        return 0.0
    total_weight = 0.0
    total_error = 0.0
    now = _as_utc(as_of or datetime.now(UTC))
    for item in evidence:
        _validate_observation(item)
        difficulty_weight = DIFFICULTY_WEIGHT_BASE + _clamp(item.difficulty)
        weight = difficulty_weight * _recency_weight(item.observed_at, now)
        total_weight += weight
        total_error += (1 - item.score / item.max_score) * weight
    return _clamp(total_error / total_weight) if total_weight else 0.0


def compute_weak_score(
    *,
    mastery: float,
    trend: float,
    error_rate: float,
    days_since_revision: float,
    difficulty: float,
    exam_weight: float,
    confidence: float | None,
) -> float:
    """Combine learner and curriculum signals into a normalized weakness score."""
    staleness = 1 - exp(-max(days_since_revision, 0) / STALE_HALF_LIFE_DAYS)
    confidence_weakness = 1 - _clamp(confidence) if confidence is not None else 0.5
    normalized_trend = (1 - _clamp(trend, -1, 1)) / 2
    return _clamp(
        WEAK_SCORE_WEIGHTS["mastery"] * (1 - _clamp(mastery))
        + WEAK_SCORE_WEIGHTS["trend"] * normalized_trend
        + WEAK_SCORE_WEIGHTS["error_rate"] * _clamp(error_rate)
        + WEAK_SCORE_WEIGHTS["staleness"] * staleness
        + WEAK_SCORE_WEIGHTS["difficulty"] * _clamp(difficulty)
        + WEAK_SCORE_WEIGHTS["exam_importance"] * _clamp(exam_weight)
        + WEAK_SCORE_WEIGHTS["confidence"] * confidence_weakness
    )


def recompute_for(
    session: Session,
    student_id: str,
    topic_ids: Sequence[str],
    *,
    as_of: datetime | None = None,
) -> None:
    """Refresh persisted mastery summaries for selected topics after ingestion."""
    now = _as_utc(as_of or datetime.now(UTC))
    for topic_id in set(topic_ids):
        evidence_rows = session.scalars(
            select(TopicEvidence).where(
                TopicEvidence.student_id == student_id,
                TopicEvidence.topic_id == topic_id,
            )
        ).all()
        if not evidence_rows:
            continue

        observations = [
            EvidenceObservation(
                score=row.score,
                max_score=row.max_score,
                difficulty=row.difficulty,
                observed_at=row.observed_at,
                confidence=row.confidence,
            )
            for row in evidence_rows
        ]
        mastery = compute_mastery(observations, as_of=now)
        trend = compute_trend(observations)
        error_rate = compute_error_rate(observations, as_of=now)
        latest_revision = max(_as_utc(item.observed_at) for item in observations)
        days_since_revision = max((now - latest_revision).total_seconds() / 86400, 0)
        confidence_values = [item.confidence for item in observations if item.confidence is not None]
        average_confidence = sum(confidence_values) / len(confidence_values) if confidence_values else None
        average_difficulty = sum(item.difficulty for item in observations) / len(observations)
        topic = session.get(Topic, topic_id)
        exam_weight = float(getattr(topic, "exam_weight", 0) or 0)
        weak_score = compute_weak_score(
            mastery=mastery,
            trend=trend,
            error_rate=error_rate,
            days_since_revision=days_since_revision,
            difficulty=average_difficulty,
            exam_weight=exam_weight,
            confidence=average_confidence,
        )

        state = session.get(LearnerTopicState, (student_id, topic_id))
        if state is None:
            state = LearnerTopicState(
                student_id=student_id,
                topic_id=topic_id,
                mastery=mastery,
                trend=trend,
                error_rate=error_rate,
                weak_score=weak_score,
                last_revised=latest_revision,
            )
            session.add(state)
        else:
            state.mastery = mastery
            state.trend = trend
            state.error_rate = error_rate
            state.weak_score = weak_score
            state.last_revised = latest_revision


def _validate_observation(observation: EvidenceObservation) -> None:
    values = (
        observation.score,
        observation.max_score,
        observation.difficulty,
    )
    if any(not isfinite(value) for value in values):
        raise ValueError("Evidence values must be finite numbers.")
    if observation.max_score <= 0:
        raise ValueError("max_score must be greater than zero.")
    if observation.score < 0 or observation.score > observation.max_score:
        raise ValueError("score must be between zero and max_score.")
    if not 0 <= observation.difficulty <= 1:
        raise ValueError("difficulty must be between zero and one.")
    if observation.confidence is not None and (
        not isfinite(observation.confidence) or not 0 <= observation.confidence <= 1
    ):
        raise ValueError("confidence must be between zero and one.")


def _recency_weight(observed_at: datetime | None, as_of: datetime) -> float:
    if observed_at is None:
        return 1.0
    age_days = max((as_of - _as_utc(observed_at)).total_seconds() / 86400, 0)
    return exp(-age_days / RECENCY_HALF_LIFE_DAYS)


def _as_utc(value: datetime | None) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=UTC)
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Evidence timestamps must be timezone-aware.")
    return value.astimezone(UTC)


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return min(max(value, minimum), maximum)
