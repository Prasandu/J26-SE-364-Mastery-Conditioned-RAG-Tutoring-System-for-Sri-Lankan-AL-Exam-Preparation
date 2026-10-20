"""Create per-topic and overall predictions with an explicit rule fallback."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.ai.prediction.features import (
    FEATURE_NAMES,
    build_feature_vector,
    confidence_for,
    rule_based_prediction,
)
from app.ai.prediction.hybrid import build_hybrid_prediction
from app.ai.prediction.model import predict as predict_with_model
from app.ai.prediction.registry import load_latest
from app.config import settings
from app.errors import ConstraintViolation, NotFound
from app.models import LearnerTopicState, Prediction, StudyTask, Topic, TopicEvidence
from app.schemas.predictions import (
    PredictionFactor,
    StudentPredictionResponse,
    TopicPrediction,
)
from app.services.weights import PREDICTION_RUNS_TO_KEEP

LOGGER = logging.getLogger(__name__)
_MODEL_VERSION = "rule-based-fallback-v1"
_GRADE_BANDS = ((0.75, "A"), (0.65, "B"), (0.50, "C"), (0.35, "S"), (0.0, "F"))
MINIMUM_ASSESSED_TOPICS = 1


def predict_student(
    session: Session,
    authenticated_student_id: str,
    requested_student_id: str,
    *,
    model_dir: Path | None = None,
    as_of: datetime | None = None,
    commit: bool = True,
) -> StudentPredictionResponse:
    """Predict only for the authenticated learner and optionally join a caller transaction."""
    if requested_student_id != authenticated_student_id:
        raise NotFound("Student predictions not found.")

    current = (as_of or datetime.now(UTC)).astimezone(UTC)
    evidence_rows = session.scalars(
        select(TopicEvidence).where(TopicEvidence.student_id == authenticated_student_id)
    ).all()
    evidence_by_topic: dict[str, list[dict]] = defaultdict(list)
    for row in evidence_rows:
        evidence_by_topic[row.topic_id].append(
            {
                "score": row.score,
                "max_score": row.max_score,
                "difficulty": row.difficulty,
                "observed_at": row.observed_at,
            }
        )
    if len(evidence_by_topic) < MINIMUM_ASSESSED_TOPICS:
        raise ConstraintViolation(
            f"At least {MINIMUM_ASSESSED_TOPICS} assessed topic is required before prediction."
        )

    tasks = session.scalars(select(StudyTask).where(StudyTask.student_id == authenticated_student_id)).all()
    tasks_by_topic: dict[str, list[dict]] = defaultdict(list)
    for task in tasks:
        tasks_by_topic[task.topic_id].append(
            {
                "start_at": task.start_at,
                "duration_min": task.duration_min,
                "actual_duration_min": task.actual_duration_min,
                "status": task.status,
                "score_before": task.score_before,
                "score_after": task.score_after,
            }
        )

    states = {
        state.topic_id: state
        for state in session.scalars(
            select(LearnerTopicState).where(LearnerTopicState.student_id == authenticated_student_id)
        ).all()
    }
    topics = {
        topic.id: topic
        for topic in session.scalars(select(Topic).where(Topic.id.in_(evidence_by_topic))).all()
    }
    model_dir = model_dir or settings.model_dir
    model_pair = _load_models_with_fallback(model_dir)
    model_version = model_pair[2] if model_pair else _MODEL_VERSION
    source = "xgboost" if model_pair else "rule-based"
    topic_features: list[tuple[str, tuple[float, ...]]] = []
    for topic_id, evidence in sorted(evidence_by_topic.items()):
        state = states.get(topic_id)
        features = build_feature_vector(
            evidence,
            tasks_by_topic.get(topic_id, []),
            as_of=current,
            mastery=state.mastery if state else None,
            weak_score=state.weak_score if state else None,
        )
        topic_features.append((topic_id, features))

    model_outputs = None
    hybrid_active = bool(settings.hybrid_model_enabled and model_pair is not None)
    if model_pair:
        try:
            model_outputs = [
                predict_with_model(model_pair[0], model_pair[1], features) for _, features in topic_features
            ]
        except _model_errors():
            LOGGER.exception("XGBoost inference failed; using rule-based predictions for all topics")
            model_pair = None
            model_version = _MODEL_VERSION
            source = "rule-based-fallback"
            hybrid_active = False
    if hybrid_active:
        source = "hybrid"
        model_version = f"{model_version}-hybrid"

    responses: list[TopicPrediction] = []
    prediction_rows: list[Prediction] = []
    weighted_scores: list[tuple[float, float]] = []
    for index, (topic_id, features) in enumerate(topic_features):
        if model_outputs is None:
            score, weak_probability = rule_based_prediction(features)
            factors = _fallback_factors(features)
        else:
            score, weak_probability, factors = model_outputs[index]
            if hybrid_active:
                history = [
                    (
                        float(row["score"]) / float(row["max_score"])
                        if row.get("max_score")
                        else float(row["score"])
                    )
                    for row in sorted(
                        evidence_by_topic.get(topic_id, []),
                        key=lambda item: item["observed_at"],
                    )
                ]
                if history:
                    score = build_hybrid_prediction(
                        score,
                        history,
                        enabled=True,
                        weight=settings.hybrid_model_stacking_weight,
                    )

        confidence = confidence_for(features)
        response = TopicPrediction(
            topic_id=topic_id,
            predicted_score=score,
            weak_probability=weak_probability,
            confidence=confidence,
            contributing_factors=[PredictionFactor(**factor) for factor in factors],
        )
        responses.append(response)
        topic = topics.get(topic_id)
        weight = float(topic.exam_weight or 0) if topic is not None else 0
        weighted_scores.append((score, weight))
        prediction_rows.append(
            Prediction(
                student_id=authenticated_student_id,
                topic_id=topic_id,
                predicted_score=score,
                confidence=confidence,
                contributing_factors={
                    "weak_probability": weak_probability,
                    "features": factors,
                    "source": source,
                },
                model_version=model_version,
            )
        )

    total_weight = sum(weight for _, weight in weighted_scores)
    overall = (
        sum(score * weight for score, weight in weighted_scores) / total_weight
        if total_weight
        else sum(score for score, _ in weighted_scores) / len(weighted_scores)
    )
    overall_confidence = sum(item.confidence for item in responses) / len(responses)
    prediction_rows.append(
        Prediction(
            student_id=authenticated_student_id,
            topic_id=None,
            predicted_score=overall,
            confidence=overall_confidence,
            contributing_factors={
                "grade": _grade_for(overall),
                "topic_count": len(responses),
                "source": source,
            },
            model_version=model_version,
        )
    )
    _prune_old_predictions(session, authenticated_student_id)
    session.add_all(prediction_rows)
    if commit:
        session.commit()
    return StudentPredictionResponse(
        student_id=authenticated_student_id,
        model_version=model_version,
        prediction_source=source,
        overall_predicted_score=overall,
        overall_predicted_grade=_grade_for(overall),
        confidence=overall_confidence,
        topics=responses,
    )


def _load_models_with_fallback(model_dir: Path) -> tuple[object, object, str] | None:
    try:
        regressor, classifier, metadata = load_latest(model_dir)
        return regressor, classifier, str(metadata["version"])
    except _model_errors() as exc:
        LOGGER.warning(
            "Prediction model unavailable at %s; using rule-based fallback: %s",
            model_dir,
            exc,
        )
        return None


def _model_errors() -> tuple[type[BaseException], ...]:
    try:
        from xgboost.core import XGBoostError
    except ImportError:
        return (ImportError, OSError, ValueError, KeyError, RuntimeError, TypeError)
    return (ImportError, OSError, ValueError, KeyError, RuntimeError, TypeError, XGBoostError)


def _fallback_factors(features: tuple[float, ...]) -> list[dict[str, float | str]]:
    factors = [
        {
            "feature": name,
            "value": value,
            "contribution": value * (1 if name in {"last_score", "mastery", "score_trend"} else -1),
        }
        for name, value in zip(FEATURE_NAMES, features, strict=True)
    ]
    factors.sort(key=lambda item: abs(float(item["contribution"])), reverse=True)
    return factors[:5]


def _grade_for(score: float) -> str:
    return next(grade for threshold, grade in _GRADE_BANDS if score >= threshold)


def _prune_old_predictions(session: Session, student_id: str) -> None:
    """Keep only the newest prediction runs so the table cannot grow without limit.

    All rows of one run share a transaction timestamp, so runs are identified
    by the overall prediction's ``created_at``.
    """
    cutoff = (
        select(Prediction.created_at)
        .where(Prediction.student_id == student_id, Prediction.topic_id.is_(None))
        .order_by(Prediction.created_at.desc())
        .offset(PREDICTION_RUNS_TO_KEEP - 1)
        .limit(1)
        .scalar_subquery()
    )
    session.execute(
        delete(Prediction).where(Prediction.student_id == student_id, Prediction.created_at < cutoff)
    )
