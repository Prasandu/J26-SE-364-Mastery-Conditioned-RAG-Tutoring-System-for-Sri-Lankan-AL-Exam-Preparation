"""Train and explain XGBoost next-score and weak-topic models."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any

from app.ai.prediction.features import FEATURE_NAMES, TrainingSample

WEAK_SCORE_THRESHOLD = 0.5


@dataclass(frozen=True)
class TrainingReport:
    version: str
    samples: int
    train_samples: int
    validation_samples: int
    test_samples: int
    regression: dict[str, dict[str, float]]
    weak_topic: dict[str, float | None]
    split_dates: dict[str, str]


def train_models(
    samples: list[TrainingSample],
    *,
    version: str,
    seed: int = 364,
) -> tuple[Any, Any, TrainingReport]:
    """Fit models on the past and evaluate only on later chronological samples."""
    if len(samples) < 10:
        raise ValueError("at least 10 chronological topic observations are required to train")
    dates = sorted({sample.target_at for sample in samples})
    if len(dates) < 3:
        raise ValueError("training data must span at least three distinct target timestamps")
    train_cut = max(1, int(len(dates) * 0.6))
    validation_cut = max(train_cut + 1, int(len(dates) * 0.8))
    if validation_cut >= len(dates):
        raise ValueError("training data must contain distinct train, validation, and test periods")
    train_end = dates[train_cut - 1]
    validation_end = dates[validation_cut - 1]
    train_rows = [sample for sample in samples if sample.target_at <= train_end]
    validation_rows = [sample for sample in samples if train_end < sample.target_at <= validation_end]
    test_rows = [sample for sample in samples if sample.target_at > validation_end]
    if not _has_two_classes(train_rows):
        raise ValueError("training period must contain both weak and non-weak topic labels")

    from xgboost import XGBClassifier, XGBRegressor

    regressor = XGBRegressor(
        objective="reg:squarederror",
        n_estimators=200,
        max_depth=4,
        learning_rate=0.04,
        subsample=0.9,
        colsample_bytree=0.9,
        tree_method="hist",
        random_state=seed,
        n_jobs=1,
    )
    classifier = XGBClassifier(
        objective="binary:logistic",
        eval_metric="logloss",
        n_estimators=200,
        max_depth=4,
        learning_rate=0.04,
        subsample=0.9,
        colsample_bytree=0.9,
        tree_method="hist",
        random_state=seed,
        n_jobs=1,
    )
    train_x = [sample.features for sample in train_rows]
    train_y = [sample.target_score for sample in train_rows]
    weak_y = [int(score < WEAK_SCORE_THRESHOLD) for score in train_y]
    regressor.fit(
        train_x,
        train_y,
        eval_set=[
            (
                [sample.features for sample in validation_rows],
                [sample.target_score for sample in validation_rows],
            )
        ],
        verbose=False,
    )
    classifier.fit(train_x, weak_y, verbose=False)

    test_x = [sample.features for sample in test_rows]
    predictions = [_clamp(float(value)) for value in regressor.predict(test_x)]
    probability_rows = classifier.predict_proba(test_x)
    weak_probabilities = [float(row[1]) for row in probability_rows]
    actuals = [sample.target_score for sample in test_rows]
    last_scores = [sample.last_score for sample in test_rows]
    global_mean = sum(train_y) / len(train_y)
    regression = {
        "xgboost": _regression_metrics(actuals, predictions),
        "global_mean_baseline": _regression_metrics(actuals, [global_mean] * len(actuals)),
        "last_score_baseline": _regression_metrics(actuals, last_scores),
    }
    weak_actuals = [int(score < WEAK_SCORE_THRESHOLD) for score in actuals]
    report = TrainingReport(
        version=version,
        samples=len(samples),
        train_samples=len(train_rows),
        validation_samples=len(validation_rows),
        test_samples=len(test_rows),
        regression=regression,
        weak_topic=_classification_metrics(weak_actuals, weak_probabilities),
        split_dates={
            "train_end": train_end.isoformat(),
            "validation_end": validation_end.isoformat(),
            "test_start": test_rows[0].target_at.isoformat(),
        },
    )
    return regressor, classifier, report


def predict(
    regressor: Any,
    classifier: Any,
    features: tuple[float, ...],
) -> tuple[float, float, list[dict[str, float | str]]]:
    """Return bounded model outputs with per-sample SHAP factors."""
    from xgboost import DMatrix

    matrix = DMatrix([features])
    raw_score = float(regressor.get_booster().predict(matrix)[0])
    raw_probability = float(classifier.predict_proba([features])[0][1])
    if not isfinite(raw_score) or not isfinite(raw_probability):
        raise ValueError("registered model returned a non-finite prediction")
    score = _clamp(raw_score)
    weak_probability = _clamp(raw_probability)
    contributions = regressor.get_booster().predict(matrix, pred_contribs=True)[0]
    factors = [
        {"feature": name, "value": float(value), "contribution": float(contribution)}
        for name, value, contribution in zip(
            FEATURE_NAMES,
            features,
            contributions[:-1],
            strict=True,
        )
    ]
    factors.sort(key=lambda factor: abs(float(factor["contribution"])), reverse=True)
    return score, weak_probability, factors[:5]


def _regression_metrics(actuals: list[float], predictions: list[float]) -> dict[str, float]:
    errors = [actual - predicted for actual, predicted in zip(actuals, predictions, strict=True)]
    return {
        "mae": sum(abs(error) for error in errors) / len(errors),
        "rmse": (sum(error**2 for error in errors) / len(errors)) ** 0.5,
    }


def _classification_metrics(
    actuals: list[int],
    probabilities: list[float],
) -> dict[str, float | None]:
    predicted = [int(probability >= 0.5) for probability in probabilities]
    true_positive = sum(actual == 1 and guess == 1 for actual, guess in zip(actuals, predicted, strict=True))
    false_positive = sum(actual == 0 and guess == 1 for actual, guess in zip(actuals, predicted, strict=True))
    false_negative = sum(actual == 1 and guess == 0 for actual, guess in zip(actuals, predicted, strict=True))
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
    positives = [probability for label, probability in zip(actuals, probabilities, strict=True) if label == 1]
    negatives = [probability for label, probability in zip(actuals, probabilities, strict=True) if label == 0]
    auc = (
        sum(
            1.0 if positive > negative else 0.5 if positive == negative else 0.0
            for positive in positives
            for negative in negatives
        )
        / (len(positives) * len(negatives))
        if positives and negatives
        else None
    )
    return {"f1": f1, "auc": auc}


def _has_two_classes(samples: list[TrainingSample]) -> bool:
    return len({sample.target_score < WEAK_SCORE_THRESHOLD for sample in samples}) == 2


def _clamp(value: float) -> float:
    return min(max(value, 0.0), 1.0)
