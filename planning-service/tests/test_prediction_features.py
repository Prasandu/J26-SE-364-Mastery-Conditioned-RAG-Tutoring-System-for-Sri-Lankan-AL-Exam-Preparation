from datetime import UTC, datetime, timedelta

import pytest

from app.ai.prediction.features import (
    FEATURE_NAMES,
    build_feature_vector,
    build_training_samples,
    confidence_for,
    rule_based_prediction,
)


def test_features_ignore_evidence_after_as_of() -> None:
    evidence = [
        {
            "student_id": "student-1",
            "topic_id": "chem-1",
            "score": 4,
            "max_score": 10,
            "difficulty": 0.4,
            "observed_at": datetime(2026, 1, 1, tzinfo=UTC),
        },
        {
            "student_id": "student-1",
            "topic_id": "chem-1",
            "score": 10,
            "max_score": 10,
            "difficulty": 0.9,
            "observed_at": datetime(2026, 1, 3, tzinfo=UTC),
        },
    ]

    features = build_feature_vector(
        evidence,
        [],
        as_of=datetime(2026, 1, 2, tzinfo=UTC),
    )

    assert len(features) == len(FEATURE_NAMES)
    assert features[0] == 1
    assert features[1] == 0.4


def test_training_samples_predict_next_observation_from_past_only() -> None:
    rows = [
        {
            "student_id": "student-1",
            "topic_id": "chem-1",
            "score": score,
            "max_score": 10,
            "difficulty": 0.5,
            "observed_at": datetime(2026, 1, day, tzinfo=UTC),
        }
        for day, score in ((1, 4), (8, 7), (15, 9))
    ]

    samples = build_training_samples(rows)

    assert len(samples) == 2
    assert samples[0].target_score == 0.7
    assert samples[0].last_score == 0.4
    assert samples[1].target_score == 0.9
    assert samples[1].last_score == 0.7


def test_feature_builder_rejects_futureless_and_invalid_evidence() -> None:
    with pytest.raises(ValueError, match="at least one evidence"):
        build_feature_vector([], [], as_of=datetime.now(UTC))

    with pytest.raises(ValueError, match="between zero and positive max_score"):
        build_training_samples(
            [
                {
                    "student_id": "student-1",
                    "topic_id": "chem-1",
                    "score": 11,
                    "max_score": 10,
                    "observed_at": datetime(2026, 1, 1, tzinfo=UTC),
                }
            ]
        )


def test_rule_fallback_and_confidence_are_bounded() -> None:
    features = (1, 0.35, 0.35, -0.2, 0.7, 90, 0.3, 0.8, 0.2, -0.1, -0.25)

    score, weak_probability = rule_based_prediction(features)

    assert 0 <= score <= 1
    assert 0 <= weak_probability <= 1
    assert 0 <= confidence_for(features) <= 0.95


def test_task_history_contributes_adherence_and_session_effectiveness() -> None:
    as_of = datetime(2026, 1, 10, tzinfo=UTC)
    evidence = [
        {
            "score": 6,
            "max_score": 10,
            "difficulty": 0.5,
            "observed_at": as_of - timedelta(days=1),
        }
    ]
    tasks = [
        {
            "start_at": as_of - timedelta(days=2),
            "duration_min": 60,
            "actual_duration_min": 30,
            "status": "partial",
            "score_before": 0.4,
            "score_after": 0.55,
        },
        {
            "start_at": as_of + timedelta(days=1),
            "duration_min": 60,
            "actual_duration_min": None,
            "status": "planned",
            "score_before": None,
            "score_after": None,
        },
    ]

    features = build_feature_vector(evidence, tasks, as_of=as_of)

    assert features[8] == 0.5
    assert features[9] == pytest.approx(0.15)
