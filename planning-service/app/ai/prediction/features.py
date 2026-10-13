"""Build time-bounded topic features shared by training and inference."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import exp, isfinite
from typing import Any

FEATURE_NAMES = (
    "evidence_count",
    "last_score",
    "mean_score",
    "score_trend",
    "mean_difficulty",
    "days_since_evidence",
    "mastery",
    "weak_score",
    "task_adherence",
    "mean_session_effectiveness",
    "last_score_change",
)


@dataclass(frozen=True)
class TrainingSample:
    features: tuple[float, ...]
    target_score: float
    target_at: datetime
    last_score: float


def build_feature_vector(
    evidence: list[dict[str, Any]],
    tasks: list[dict[str, Any]],
    *,
    as_of: datetime,
    mastery: float | None = None,
    weak_score: float | None = None,
) -> tuple[float, ...]:
    """Summarize only observations available by `as_of` to prevent target leakage."""
    cutoff = _utc(as_of)
    prior = sorted(
        ((row, _utc(row["observed_at"])) for row in evidence if _utc(row["observed_at"]) <= cutoff),
        key=lambda pair: pair[1],
    )
    if not prior:
        raise ValueError("at least one evidence observation is required for prediction features")

    scores = [_score(row) for row, _ in prior]
    difficulties = [float(row.get("difficulty", 0.5)) for row, _ in prior]
    if any(not isfinite(value) or not 0 <= value <= 1 for value in difficulties):
        raise ValueError("evidence difficulties must be finite and between zero and one")
    _, latest_at = prior[-1]
    elapsed_days = max((cutoff - latest_at).total_seconds() / 86400, 0)
    relevant_tasks = [task for task in tasks if _task_available_at(task) <= cutoff]
    planned_minutes = sum(float(task["duration_min"]) for task in relevant_tasks)
    completed_minutes = sum(
        float(task.get("actual_duration_min") or 0)
        if task.get("status") != "completed"
        else float(task.get("actual_duration_min") or task["duration_min"])
        for task in relevant_tasks
    )
    effectiveness = [
        float(task["score_after"]) - float(task["score_before"])
        for task in relevant_tasks
        if task.get("score_before") is not None and task.get("score_after") is not None
    ]
    score_changes = [
        _score(row) - _score(previous) for (previous, _), (row, _) in zip(prior, prior[1:], strict=False)
    ]
    return (
        float(len(prior)),
        scores[-1],
        sum(scores) / len(scores),
        _linear_trend(scores),
        sum(difficulties) / len(difficulties),
        elapsed_days,
        _clamp(mastery if mastery is not None else sum(scores) / len(scores)),
        _clamp(weak_score if weak_score is not None else 1 - scores[-1]),
        completed_minutes / planned_minutes if planned_minutes else 0.0,
        sum(effectiveness) / len(effectiveness) if effectiveness else 0.0,
        score_changes[-1] if score_changes else 0.0,
    )


def build_training_samples(
    evidence_rows: list[dict[str, Any]],
    task_rows: list[dict[str, Any]] | None = None,
) -> list[TrainingSample]:
    """Create next-observation targets from chronological topic histories."""
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in evidence_rows:
        score = _score(row)
        if not 0 <= score <= 1:
            raise ValueError("normalized evidence scores must be between zero and one")
        grouped[(str(row["student_id"]), str(row["topic_id"]))].append(row)

    all_tasks = task_rows or []
    samples: list[TrainingSample] = []
    for (student_id, topic_id), rows in grouped.items():
        ordered = sorted(rows, key=lambda row: _utc(row["observed_at"]))
        topic_tasks = [
            task
            for task in all_tasks
            if str(task["student_id"]) == student_id and str(task["topic_id"]) == topic_id
        ]
        for target_index in range(1, len(ordered)):
            target = ordered[target_index]
            history = ordered[:target_index]
            target_at = _utc(target["observed_at"])
            vector = build_feature_vector(history, topic_tasks, as_of=target_at)
            samples.append(
                TrainingSample(
                    features=vector,
                    target_score=_score(target),
                    target_at=target_at,
                    last_score=vector[1],
                )
            )
    return sorted(samples, key=lambda sample: sample.target_at)


def rule_based_prediction(features: tuple[float, ...]) -> tuple[float, float]:
    """Return a deterministic next-score estimate and weak-topic probability."""
    values = dict(zip(FEATURE_NAMES, features, strict=True))
    prediction = _clamp(
        0.55 * values["last_score"]
        + 0.35 * values["mastery"]
        + 0.10 * values["mean_score"]
        + 0.08 * values["score_trend"]
        - 0.03 * values["weak_score"]
    )
    weak_probability = _clamp(
        0.55 * values["weak_score"] + 0.30 * (1 - prediction) + 0.15 * max(-values["score_trend"], 0)
    )
    return prediction, weak_probability


def confidence_for(features: tuple[float, ...]) -> float:
    """Reduce confidence for sparse or stale evidence without claiming calibration."""
    evidence_count, _, _, _, _, days_since, *_ = features
    coverage = min(evidence_count / 8, 1)
    recency = exp(-days_since / 180)
    return round(_clamp(0.15 + 0.8 * coverage * recency, 0, 0.95), 4)


def _task_available_at(task: dict[str, Any]) -> datetime:
    if task.get("outcome_at") is not None:
        return _utc(task["outcome_at"])
    start_at = _utc(task["start_at"])
    if task.get("status") in {"completed", "partial", "missed"}:
        return start_at + timedelta(minutes=float(task["duration_min"]))
    return start_at


def _score(row: dict[str, Any]) -> float:
    if "score" in row and "max_score" in row:
        maximum = float(row["max_score"])
        if maximum <= 0:
            raise ValueError("max_score must be positive")
        score = float(row["score"])
        if not isfinite(maximum) or maximum <= 0 or not isfinite(score) or not 0 <= score <= maximum:
            raise ValueError("evidence score must be finite and between zero and positive max_score")
        return score / maximum
    score = float(row["normalized_score"])
    if not isfinite(score) or not 0 <= score <= 1:
        raise ValueError("normalized_score must be finite and between zero and one")
    return score


def _linear_trend(scores: list[float]) -> float:
    if len(scores) < 2:
        return 0.0
    center = (len(scores) - 1) / 2
    mean = sum(scores) / len(scores)
    denominator = sum((index - center) ** 2 for index in range(len(scores)))
    slope = sum((index - center) * (score - mean) for index, score in enumerate(scores))
    return _clamp(slope / denominator if denominator else 0.0, -1, 1)


def _utc(value: datetime | str) -> datetime:
    parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("prediction timestamps must be timezone-aware")
    return parsed.astimezone(UTC)


def _clamp(value: float, minimum: float = 0, maximum: float = 1) -> float:
    return min(max(float(value), minimum), maximum)
