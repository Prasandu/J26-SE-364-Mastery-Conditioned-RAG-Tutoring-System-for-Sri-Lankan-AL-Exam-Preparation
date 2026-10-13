"""Hybrid sequence modelling and stacked inference for planning predictions."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import fmean

try:  # pragma: no cover - optional dependency on the execution environment.
    import torch
    from torch import nn
except Exception:  # pragma: no cover - gracefully degrade when PyTorch is absent.
    torch = None
    nn = None


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return min(max(float(value), minimum), maximum)


def _sequence_score(scores: Sequence[float]) -> float:
    bounded = [_clamp(float(score)) for score in scores if 0.0 <= float(score) <= 1.0]
    if not bounded:
        return 0.5
    if len(bounded) == 1:
        return bounded[0]
    recent = bounded[-min(5, len(bounded)) :]
    mean_recent = fmean(recent)
    trend = bounded[-1] - bounded[0]
    return _clamp(0.7 * mean_recent + 0.3 * trend + 0.15 * bounded[-1])


@dataclass(frozen=True)
class HybridComparison:
    baseline: dict[str, float]
    xgboost: dict[str, float]
    bi_lstm: dict[str, float]
    hybrid: dict[str, float]


class BiLSTMSequencePredictor:
    """Predict the next score from a short topic history using a Bi-LSTM shape.

    The model is intentionally lightweight and optional: when PyTorch is unavailable,
    a deterministic heuristic is used instead so the service keeps predicting.
    """

    def __init__(self, *, hidden_size: int = 16, max_length: int = 24) -> None:
        self.hidden_size = hidden_size
        self.max_length = max_length
        self.model = None
        if torch is not None and nn is not None:
            self.model = _BiLSTMNet(hidden_size)
            self.model.eval()

    def predict(self, scores: Sequence[float]) -> float:
        bounded = [float(score) for score in scores[-self.max_length :]]
        if not bounded:
            return 0.5
        if self.model is None or torch is None:
            return _sequence_score(bounded)
        sequence = torch.tensor([bounded], dtype=torch.float32)
        with torch.no_grad():
            output = self.model(sequence)
        return _clamp(float(output.item()))


if nn is not None and torch is not None:  # pragma: no cover - exercised only when PyTorch is installed.

    class _BiLSTMNet(nn.Module):
        def __init__(self, hidden_size: int) -> None:
            super().__init__()
            self.lstm = nn.LSTM(input_size=1, hidden_size=hidden_size, batch_first=True, bidirectional=True)
            self.head = nn.Sequential(
                nn.Linear(hidden_size * 2, hidden_size),
                nn.ReLU(),
                nn.Linear(hidden_size, 1),
            )

        def forward(self, sequence: torch.Tensor) -> torch.Tensor:
            outputs, _ = self.lstm(sequence.unsqueeze(-1))
            last = outputs[:, -1, :]
            return torch.sigmoid(self.head(last)).squeeze(-1)


def build_hybrid_prediction(
    xgboost_score: float,
    score_history: Sequence[float],
    *,
    enabled: bool = False,
    weight: float = 0.35,
) -> float:
    """Stack the XGBoost and sequence model outputs if the hybrid path is enabled."""
    score = _clamp(float(xgboost_score))
    if not enabled:
        return score
    if not score_history:
        return score
    predictor = BiLSTMSequencePredictor()
    sequence_prediction = predictor.predict(score_history)
    blended_weight = min(max(float(weight), 0.0), 1.0)
    blended = (1.0 - blended_weight) * score + blended_weight * sequence_prediction
    return _clamp(blended)


def metrics_for(actuals: Sequence[float], predictions: Sequence[float]) -> dict[str, float]:
    if not actuals or len(actuals) != len(predictions):
        raise ValueError("actuals and predictions must have matching non-empty lengths")
    errors = [
        float(actual) - float(predicted)
        for actual, predicted in zip(actuals, predictions, strict=True)
    ]
    return {
        "mae": sum(abs(error) for error in errors) / len(errors),
        "rmse": (sum(error**2 for error in errors) / len(errors)) ** 0.5,
    }


def build_comparison_table(
    actuals: Sequence[float],
    baseline_predictions: Sequence[float],
    xgboost_predictions: Sequence[float],
    bilstm_predictions: Sequence[float] | None = None,
    hybrid_predictions: Sequence[float] | None = None,
) -> HybridComparison:
    """Return a comparison table for baseline, XGBoost, Bi-LSTM and hybrid outputs."""
    bilstm = bilstm_predictions if bilstm_predictions is not None else baseline_predictions
    hybrid = hybrid_predictions if hybrid_predictions is not None else xgboost_predictions
    return HybridComparison(
        baseline=metrics_for(actuals, baseline_predictions),
        xgboost=metrics_for(actuals, xgboost_predictions),
        bi_lstm=metrics_for(actuals, bilstm),
        hybrid=metrics_for(actuals, hybrid),
    )


__all__ = [
    "BiLSTMSequencePredictor",
    "HybridComparison",
    "build_comparison_table",
    "build_hybrid_prediction",
]
