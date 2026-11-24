import pytest

from app.ai.prediction.hybrid import BiLSTMSequencePredictor, build_comparison_table, build_hybrid_prediction


def test_hybrid_prediction_reuses_xgboost_when_disabled() -> None:
    value = build_hybrid_prediction(0.72, [0.55, 0.60, 0.64], enabled=False, weight=0.35)

    assert value == pytest.approx(0.72)


def test_hybrid_sequence_predictor_returns_bounded_value() -> None:
    predictor = BiLSTMSequencePredictor()

    value = predictor.predict([0.3, 0.5, 0.7, 0.8])

    assert 0.0 <= value <= 1.0


def test_hybrid_comparison_table_includes_all_model_types() -> None:
    comparison = build_comparison_table(
        actuals=[0.8, 0.7, 0.9],
        baseline_predictions=[0.75, 0.75, 0.75],
        xgboost_predictions=[0.82, 0.68, 0.88],
        bilstm_predictions=[0.81, 0.72, 0.87],
        hybrid_predictions=[0.80, 0.70, 0.88],
    )

    assert set(comparison.__dict__) == {"baseline", "xgboost", "bi_lstm", "hybrid"}
    assert set(comparison.xgboost) == {"mae", "rmse"}
    assert set(comparison.hybrid) == {"mae", "rmse"}
