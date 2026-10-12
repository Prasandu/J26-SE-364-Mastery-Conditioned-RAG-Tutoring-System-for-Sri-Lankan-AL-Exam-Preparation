"""Tunable, normalized weights used by mastery and weakness calculations."""

MASTERY_COMPONENT_WEIGHTS = {
    "performance": 0.75,
    "consistency": 0.15,
    "coverage": 0.10,
}

WEAK_SCORE_WEIGHTS = {
    "mastery": 0.30,
    "trend": 0.12,
    "error_rate": 0.14,
    "staleness": 0.12,
    "difficulty": 0.10,
    "exam_importance": 0.12,
    "confidence": 0.10,
}

DIFFICULTY_ADJUSTMENT = 0.5
DIFFICULTY_WEIGHT_BASE = 0.75
RECENCY_HALF_LIFE_DAYS = 45.0
COVERAGE_TARGET_EVIDENCE = 5
STALE_HALF_LIFE_DAYS = 30.0


def weights_sum_to_one(weights: dict[str, float]) -> bool:
    return abs(sum(weights.values()) - 1.0) < 1e-9
