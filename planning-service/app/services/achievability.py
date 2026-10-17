"""Pure estimates of expected learning gains and target achievability."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Literal, TypedDict

from app.services.weights import (
    ACHIEVABILITY_ALLOCATION_STEP_HOURS,
    ACHIEVABILITY_DEFAULT_UNCERTAINTY,
    ACHIEVABILITY_DIMINISHING_RETURNS,
    ACHIEVABILITY_GRADE_THRESHOLDS,
    ACHIEVABILITY_HOURS_RATIO_EPSILON,
    ACHIEVABILITY_LEARNING_RATE_BASE,
    ACHIEVABILITY_MAX_HOURS_PER_TOPIC,
    ACHIEVABILITY_MAX_TOTAL_HOURS,
    ACHIEVABILITY_MIDPOINT_DIVISOR,
    ACHIEVABILITY_MIN_DAYS_FOR_WEEKLY_RATE,
    ACHIEVABILITY_MIN_HOURS_PER_TOPIC,
    ACHIEVABILITY_PREREQUISITE_MASTERY_THRESHOLD,
    ACHIEVABILITY_REQUIRED_HOURS_SEARCH_ITERATIONS,
    ACHIEVABILITY_STRETCH_MULTIPLIER,
    ACHIEVABILITY_UNCERTAINTY_EVIDENCE_DECAY,
    ACHIEVABILITY_UNMET_PREREQUISITE_PENALTY,
)


class TopicInput(TypedDict, total=False):
    topic_id: str
    exam_weight: float
    mastery: float
    prerequisites: list[str]
    prerequisite_mastery: dict[str, float]
    evidence_count: int


@dataclass(frozen=True)
class ScoreRange:
    low: float
    expected: float
    high: float


@dataclass(frozen=True)
class RequiredHours:
    hours_per_week: float
    gap_hours_per_week: float


@dataclass(frozen=True)
class AchievabilityReport:
    status: Literal["on_track", "stretch", "out_of_reach"]
    best_range_grade: str
    hours_needed: float
    hours_available: float
    hours_gap: float
    projected_range: ScoreRange
    message: str


def learning_rate(mastery: float) -> float:
    """Return a positive rate that declines with mastery."""
    _validate_unit_interval("mastery", mastery)
    return ACHIEVABILITY_LEARNING_RATE_BASE * (
        1 - ACHIEVABILITY_DIMINISHING_RETURNS * mastery
    )


def expected_gain_per_hour(
    topic: TopicInput,
    *,
    mastery: float | None = None,
    unmet_prerequisites: int | None = None,
) -> float:
    """Estimate normalized exam-score gain per study hour for a topic."""
    topic_mastery = float(topic.get("mastery", 0.0) if mastery is None else mastery)
    exam_weight = float(topic.get("exam_weight", 0.0))
    _validate_unit_interval("mastery", topic_mastery)
    _validate_unit_interval("exam_weight", exam_weight)
    prerequisites = topic.get("prerequisites", [])
    unmet_count = (
        sum(
            float(topic.get("prerequisite_mastery", {}).get(item, 0.0))
            < ACHIEVABILITY_PREREQUISITE_MASTERY_THRESHOLD
            for item in prerequisites
        )
        if unmet_prerequisites is None
        else unmet_prerequisites
    )
    if unmet_count < 0:
        raise ValueError("unmet_prerequisites cannot be negative.")
    penalty = max(0.0, 1 - ACHIEVABILITY_UNMET_PREREQUISITE_PENALTY * unmet_count)
    return exam_weight * (1 - topic_mastery) * learning_rate(topic_mastery) * penalty


def allocate_hours(topics: list[TopicInput], total_hours: float) -> dict[str, float]:
    """Greedily allocate available hours to the largest marginal score gains."""
    _validate_nonnegative_finite("total_hours", total_hours)
    topic_by_id = {topic.get("topic_id", str(index)): topic for index, topic in enumerate(topics)}
    if len(topic_by_id) != len(topics):
        raise ValueError("topic IDs must be unique.")
    allocated = {topic_id: 0.0 for topic_id in topic_by_id}
    remaining = total_hours
    step = ACHIEVABILITY_ALLOCATION_STEP_HOURS

    while remaining >= step and topic_by_id:
        candidates = []
        for topic_id, topic in topic_by_id.items():
            current_hours = allocated[topic_id]
            if current_hours >= ACHIEVABILITY_MAX_HOURS_PER_TOPIC:
                continue
            if not _prerequisites_ready(topic, topic_by_id, allocated):
                continue
            increment = (
                ACHIEVABILITY_MIN_HOURS_PER_TOPIC
                if current_hours == 0
                else min(step, remaining)
            )
            if current_hours == 0 and remaining < increment:
                continue
            gain = expected_gain_per_hour(topic) * _diminishing_hour_factor(current_hours)
            if gain > 0:
                candidates.append((gain, topic_id, increment))
        if not candidates:
            break
        _, selected_id, increment = max(candidates, key=lambda item: (item[0], item[1]))
        increment = min(increment, ACHIEVABILITY_MAX_HOURS_PER_TOPIC - allocated[selected_id])
        allocated[selected_id] += increment
        remaining -= increment

    if remaining > 0:
        candidates = [
            (expected_gain_per_hour(topic) * _diminishing_hour_factor(allocated[topic_id]), topic_id)
            for topic_id, topic in topic_by_id.items()
            if allocated[topic_id] < ACHIEVABILITY_MAX_HOURS_PER_TOPIC
            and _prerequisites_ready(topic, topic_by_id, allocated)
            and (allocated[topic_id] > 0 or remaining >= ACHIEVABILITY_MIN_HOURS_PER_TOPIC)
        ]
        if candidates:
            _, selected_id = max(candidates, key=lambda item: (item[0], item[1]))
            allocated[selected_id] += min(
                remaining,
                ACHIEVABILITY_MAX_HOURS_PER_TOPIC - allocated[selected_id],
            )
    return allocated


def projected_score_range(
    current: float,
    gains: float,
    *,
    evidence_count: int = 0,
) -> ScoreRange:
    """Project a bounded score interval, widening uncertainty for sparse evidence."""
    _validate_unit_interval("current", current)
    _validate_nonnegative_finite("gains", gains)
    if evidence_count < 0:
        raise ValueError("evidence_count cannot be negative.")
    expected = min(1.0, current + gains)
    uncertainty = ACHIEVABILITY_DEFAULT_UNCERTAINTY / (
        1 + evidence_count * ACHIEVABILITY_UNCERTAINTY_EVIDENCE_DECAY
    )
    return ScoreRange(
        low=max(0.0, expected - uncertainty),
        expected=expected,
        high=min(1.0, expected + uncertainty),
    )


def required_hours_for_target(
    target_grade: str,
    *,
    current: float,
    topics: list[TopicInput],
    days_remaining: int,
    hours_available: float,
) -> RequiredHours:
    """Estimate weekly hours needed to reach a grade target and available-hours gap."""
    _validate_unit_interval("current", current)
    _validate_nonnegative_finite("hours_available", hours_available)
    if days_remaining < 0:
        raise ValueError("days_remaining cannot be negative.")
    target_score = _grade_threshold(target_grade)
    if current >= target_score:
        return RequiredHours(0.0, -hours_available)
    weeks = max(days_remaining / 7, ACHIEVABILITY_MIN_DAYS_FOR_WEEKLY_RATE / 7)
    target_gain = target_score - current
    low, high = 0.0, ACHIEVABILITY_MAX_TOTAL_HOURS
    if _expected_total_gain(topics, allocate_hours(topics, high)) < target_gain:
        total_hours = high
    else:
        for _ in range(ACHIEVABILITY_REQUIRED_HOURS_SEARCH_ITERATIONS):
            middle = (low + high) / 2
            if _expected_total_gain(topics, allocate_hours(topics, middle)) >= target_gain:
                high = middle
            else:
                low = middle
        total_hours = high
    needed_per_week = total_hours / weeks
    return RequiredHours(
        hours_per_week=needed_per_week,
        gap_hours_per_week=needed_per_week - hours_available,
    )


def build_achievability_report(
    *,
    current: float,
    target_grade: str,
    topics: list[TopicInput],
    days_remaining: int,
    hours_available: float,
    evidence_count: int = 0,
) -> AchievabilityReport:
    """Build a friendly, explicitly estimated plan-achievability summary."""
    required = required_hours_for_target(
        target_grade,
        current=current,
        topics=topics,
        days_remaining=days_remaining,
        hours_available=hours_available,
    )
    total_available = hours_available * days_remaining / 7
    allocation = allocate_hours(topics, total_available)
    gains = _expected_total_gain(topics, allocation)
    score_range = projected_score_range(current, gains, evidence_count=evidence_count)
    threshold = _grade_threshold(target_grade)
    ratio = required.hours_per_week / max(
        hours_available,
        ACHIEVABILITY_HOURS_RATIO_EPSILON,
    )
    if score_range.expected >= threshold and ratio <= 1:
        status: Literal["on_track", "stretch", "out_of_reach"] = "on_track"
        message = "Estimate: you are on track for your target with your current study time."
    elif ratio <= ACHIEVABILITY_STRETCH_MULTIPLIER:
        status = "stretch"
        message = "Estimate: your target is a stretch, but focused study can move you closer."
    else:
        status = "out_of_reach"
        message = "Estimate: the target is beyond the current time available; steady progress still counts."
    return AchievabilityReport(
        status=status,
        best_range_grade=_grade_for(score_range.high),
        hours_needed=round(required.hours_per_week, 2),
        hours_available=round(hours_available, 2),
        hours_gap=round(required.gap_hours_per_week, 2),
        projected_range=score_range,
        message=message,
    )


def _expected_total_gain(topics: list[TopicInput], allocation: dict[str, float]) -> float:
    gains = 0.0
    for index, topic in enumerate(topics):
        topic_id = topic.get("topic_id", str(index))
        hours = allocation.get(topic_id, 0.0)
        mastery = float(topic.get("mastery", 0.0))
        gain_per_hour = expected_gain_per_hour(topic)
        saturation = _integrated_hour_factor(0, hours)
        max_gain = float(topic.get("exam_weight", 0.0)) * (1 - mastery)
        gains += min(max_gain, gain_per_hour * hours * saturation)
    return gains


def _integrated_hour_factor(start_hours: float, hours: float) -> float:
    scaled_hours = min(
        (start_hours + hours / ACHIEVABILITY_MIDPOINT_DIVISOR)
        / ACHIEVABILITY_MAX_HOURS_PER_TOPIC,
        1,
    )
    return max(0.0, 1 - ACHIEVABILITY_DIMINISHING_RETURNS * scaled_hours)


def _diminishing_hour_factor(hours: float) -> float:
    return max(0.1, 1 - ACHIEVABILITY_DIMINISHING_RETURNS * min(hours / ACHIEVABILITY_MAX_HOURS_PER_TOPIC, 1))


def _prerequisites_ready(
    topic: TopicInput,
    topics: dict[str, TopicInput],
    allocation: dict[str, float],
) -> bool:
    for prerequisite in topic.get("prerequisites", []):
        prerequisite_mastery = float(
            topic.get("prerequisite_mastery", {}).get(prerequisite, 0.0)
        )
        if prerequisite_mastery >= ACHIEVABILITY_PREREQUISITE_MASTERY_THRESHOLD:
            continue
        prerequisite_topic = topics.get(prerequisite)
        if prerequisite_topic is None:
            return False
        learned = prerequisite_mastery + (
            learning_rate(prerequisite_mastery) * allocation.get(prerequisite, 0.0)
        )
        if learned < ACHIEVABILITY_PREREQUISITE_MASTERY_THRESHOLD:
            return False
    return True


def _grade_threshold(grade: str) -> float:
    try:
        return ACHIEVABILITY_GRADE_THRESHOLDS[grade.upper()]
    except KeyError as exc:
        raise ValueError(f"Unknown target grade {grade!r}.") from exc


def _grade_for(score: float) -> str:
    return next(
        grade
        for grade, threshold in ACHIEVABILITY_GRADE_THRESHOLDS.items()
        if score >= threshold
    )


def _validate_unit_interval(name: str, value: float) -> None:
    _validate_nonnegative_finite(name, value)
    if value > 1:
        raise ValueError(f"{name} must be between zero and one.")


def _validate_nonnegative_finite(name: str, value: float) -> None:
    if not isfinite(value) or value < 0:
        raise ValueError(f"{name} must be finite and non-negative.")
