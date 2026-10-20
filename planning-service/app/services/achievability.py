"""Pure estimates of expected learning gains and target achievability."""

from __future__ import annotations

import re
from dataclasses import dataclass
from math import floor, isfinite
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
    ACHIEVABILITY_MIN_UNCERTAINTY,
    ACHIEVABILITY_PREREQUISITE_MASTERY_THRESHOLD,
    ACHIEVABILITY_REQUIRED_HOURS_SEARCH_ITERATIONS,
    ACHIEVABILITY_STRETCH_MULTIPLIER,
    ACHIEVABILITY_UNCERTAINTY_EVIDENCE_DECAY,
    ACHIEVABILITY_UNMET_PREREQUISITE_PENALTY,
    COACHING_MAX_FOCUS_CHARS,
    COACHING_MAX_FOCUS_WORDS,
    NEUTRAL_EXAM_WEIGHT,
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


@dataclass(frozen=True)
class CoachingFocusTopic:
    topic: str
    reason: str


@dataclass(frozen=True)
class CoachingMessage:
    greeting: str
    headline: str
    body: str
    focus_topics: tuple[CoachingFocusTopic, ...]
    daily_suggestion: str
    tone: Literal["on_track", "stretch", "ambitious"]


def build_coaching_message(
    student_name: str,
    days_left: int,
    best_range: str,
    target_grade: str,
    status: str,
    focus_topics: list[dict[str, str]],
    suggested_hours_per_day: float,
    study_days_per_week: int | None = None,
) -> CoachingMessage:
    """Build a warm, concise study message using the student's current plan.

    With ``study_days_per_week``, ``suggested_hours_per_day`` means hours on
    each study day, so a Mon/Wed/Sat student is told "2 hours on each of your
    3 study days" rather than an average over all seven days.
    """
    if days_left < 0:
        raise ValueError("days_left cannot be negative.")
    _validate_nonnegative_finite("suggested_hours_per_day", suggested_hours_per_day)

    tone: Literal["on_track", "stretch", "ambitious"]
    if status == "on_track":
        tone = "on_track"
        headline = "You're on track, keep your pace."
        body = (
            f"With {days_left} days left, keep your steady rhythm. "
            f"Estimated best range: {best_range}; you're building toward {target_grade}."
        )
    elif status == "out_of_reach":
        tone = "ambitious"
        headline = f"Your {target_grade} target is very ambitious."
        body = (
            f"With {days_left} days left, effort now still raises your result. "
            f"Aim for the estimated best range, {best_range}, as a realistic goal."
        )
    else:
        tone = "stretch"
        headline = "A focused push can build momentum."
        body = (
            f"With {days_left} days left, estimated best range: {best_range}. "
            f"Consistent practice can move you closer to {target_grade}."
        )

    focus = tuple(
        CoachingFocusTopic(
            topic=_shorten(item["topic"], COACHING_MAX_FOCUS_CHARS),
            reason=_shorten(item["reason"], COACHING_MAX_FOCUS_CHARS),
        )
        for item in focus_topics[:3]
    )
    daily_suggestion = _daily_suggestion(
        suggested_hours_per_day=suggested_hours_per_day,
        study_days_per_week=study_days_per_week,
    )
    return CoachingMessage(
        greeting=f"Dear {(student_name.strip() or 'there').split()[0]},",
        headline=_whole_sentences(headline, 8),
        body=_whole_sentences(body, 22),
        focus_topics=focus,
        daily_suggestion=daily_suggestion,
        tone=tone,
    )


def _daily_suggestion(*, suggested_hours_per_day: float, study_days_per_week: int | None = None) -> str:
    if suggested_hours_per_day <= 0:
        return "Use the study time available in your plan for short, focused sessions."
    daily_minutes = floor(suggested_hours_per_day * 60 / 5) * 5
    if daily_minutes < 5:
        return "Try a short, focused study session whenever time is available."
    hours, minutes = divmod(daily_minutes, 60)
    if hours and minutes:
        amount = f"{hours} hour{'s' if hours != 1 else ''} {minutes} minutes"
    elif hours:
        amount = f"{hours} hour{'s' if hours != 1 else ''}"
    else:
        amount = f"{minutes} minutes"
    if study_days_per_week is not None and 0 < study_days_per_week < 7:
        days = "study day" if study_days_per_week == 1 else f"{study_days_per_week} study days"
        each = "on your" if study_days_per_week == 1 else "on each of your"
        return f"Aim for about {amount} {each} {days}, using the time available in your plan."
    return f"Aim for about {amount} a day, using the time available in your plan."


def _whole_sentences(value: str, maximum_words: int) -> str:
    """Keep whole sentences within ``maximum_words``; never cut mid-sentence.

    If even the first sentence is longer, it is kept complete.
    """
    if len(value.split()) <= maximum_words:
        return value
    sentences = re.split(r"(?<=[.!?])\s+", value.strip())
    kept: list[str] = []
    for sentence in sentences:
        if kept and len(" ".join([*kept, sentence]).split()) > maximum_words:
            break
        kept.append(sentence)
    return " ".join(kept)


def _shorten(value: str, maximum_chars: int, maximum_words: int = COACHING_MAX_FOCUS_WORDS) -> str:
    """Shorten long labels at a word boundary, marking the cut with an ellipsis."""
    words = value.split()
    text = " ".join(words)
    if len(text) <= maximum_chars and len(words) <= maximum_words:
        return text
    cut = " ".join(words[:maximum_words])
    if len(cut) > maximum_chars - 1:
        cut = cut[: maximum_chars - 1].rsplit(" ", 1)[0]
    return f"{cut.rstrip(',;:')}…"


def effective_exam_weight(value: float | None) -> float:
    """Exam weight for planning; unset weights (``None`` or 0) count as neutral.

    Without this, a curriculum with no weights gives every topic zero gain and
    the allocator would put all hours on one arbitrary topic.
    """
    weight = float(value or 0)
    return weight if weight > 0 else NEUTRAL_EXAM_WEIGHT


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
    """Project a bounded score interval, widening uncertainty for sparse evidence.

    ``evidence_count`` is the number of separate assessments (papers or
    quizzes), not individual answers. The interval never narrows below
    ``ACHIEVABILITY_MIN_UNCERTAINTY``: study behaviour and exam papers vary,
    so a range like "64-64%" would claim precision the model does not have.
    """
    _validate_unit_interval("current", current)
    _validate_nonnegative_finite("gains", gains)
    if evidence_count < 0:
        raise ValueError("evidence_count cannot be negative.")
    expected = min(1.0, current + gains)
    uncertainty = max(
        ACHIEVABILITY_MIN_UNCERTAINTY,
        ACHIEVABILITY_DEFAULT_UNCERTAINTY / (1 + evidence_count * ACHIEVABILITY_UNCERTAINTY_EVIDENCE_DECAY),
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
        # Label the range by its expected score, not its optimistic top end:
        # "B (62-80%)" rather than "A (62-80%)" when the likely result is ~71%.
        best_range_grade=_grade_for(score_range.expected),
        hours_needed=round(required.hours_per_week, 2),
        hours_available=round(hours_available, 2),
        hours_gap=round(required.gap_hours_per_week, 2),
        projected_range=score_range,
        message=message,
    )


def _expected_total_gain(topics: list[TopicInput], allocation: dict[str, float]) -> float:
    """Expected gain in overall exam score (0-1) from the allocated hours.

    Topic gains are weighted by exam_weight, so they are divided by the total
    weight, exactly like the current score (a weight-normalised mean of
    mastery). Without this, 122 topics whose weights sum to ~43 produced
    gains of over +200% and every estimate capped at 100%.
    """
    gains = 0.0
    total_weight = 0.0
    for index, topic in enumerate(topics):
        topic_id = topic.get("topic_id", str(index))
        hours = allocation.get(topic_id, 0.0)
        mastery = float(topic.get("mastery", 0.0))
        weight = float(topic.get("exam_weight", 0.0))
        total_weight += weight
        gain_per_hour = expected_gain_per_hour(topic)
        saturation = _integrated_hour_factor(0, hours)
        max_gain = weight * (1 - mastery)
        gains += min(max_gain, gain_per_hour * hours * saturation)
    return gains / total_weight if total_weight > 0 else 0.0


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


def grade_for(score: float) -> str:
    """Return the grade band for a normalized score."""
    return _grade_for(score)


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
