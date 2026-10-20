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

NEUTRAL_PRIOR_MASTERY = 0.30
NEUTRAL_EXAM_WEIGHT = 0.50  # used when a topic has no exam weight set (stored as 0)

ACHIEVABILITY_LEARNING_RATE_BASE = 0.12
ACHIEVABILITY_DIMINISHING_RETURNS = 0.75
ACHIEVABILITY_UNMET_PREREQUISITE_PENALTY = 0.35
ACHIEVABILITY_PREREQUISITE_MASTERY_THRESHOLD = 0.6
ACHIEVABILITY_MIN_HOURS_PER_TOPIC = 0.5
ACHIEVABILITY_MAX_HOURS_PER_TOPIC = 10.0
ACHIEVABILITY_ALLOCATION_STEP_HOURS = 0.25
ACHIEVABILITY_DEFAULT_UNCERTAINTY = 0.2
ACHIEVABILITY_MIN_UNCERTAINTY = 0.05  # projected range is always at least +/-5 percentage points
ACHIEVABILITY_UNCERTAINTY_EVIDENCE_DECAY = 0.08
ACHIEVABILITY_STRETCH_MULTIPLIER = 1.5
ACHIEVABILITY_MAX_TOTAL_HOURS = 140.0
ACHIEVABILITY_MIN_DAYS_FOR_WEEKLY_RATE = 1
ACHIEVABILITY_HOURS_RATIO_EPSILON = 0.01
ACHIEVABILITY_REQUIRED_HOURS_SEARCH_ITERATIONS = 32
ACHIEVABILITY_MIDPOINT_DIVISOR = 2
ACHIEVABILITY_GRADE_THRESHOLDS = {
    "A": 0.75,
    "B": 0.65,
    "C": 0.50,
    "S": 0.35,
    "F": 0.0,
}

DECLINE_THRESHOLD = 0.20
DECLINE_RECENT_ATTEMPTS = 3
DECLINE_BASELINE_ATTEMPTS = 2
DECLINE_PRIORITY_BOOST = 0.20

# Error review is chosen only for recent, repeated mistakes on a still-weak topic
ERROR_SCORE_THRESHOLD = 0.5  # an attempt scoring below this fraction counts as a wrong answer
ERROR_REVIEW_RECENT_ATTEMPTS = 5  # look for repeated mistakes among the latest N attempts
ERROR_REVIEW_MIN_ERRORS = 2
ERROR_REVIEW_MAX_MASTERY = 0.6

# Rolling-horizon planning
WINDOW_DAYS = 14  # detailed committed task window (7 when fewer than 21 days remain)
SHORT_HORIZON_THRESHOLD_DAYS = 21  # switch to 7-day window below this
SHORT_HORIZON_DAYS = 7
ADHERENCE_FLOOR = 0.60  # weekly adherence below this triggers plan compression
FINAL_WEEK_DAYS = 7  # last N days use revision/past-paper only; no new theory
COMPRESSION_MIN_LOAD = 0.40  # compressed plans keep at least this share of the original load
COMPRESSION_HEADROOM = 0.15  # compressed load = measured adherence + headroom (room for good days)
COMPRESSION_MIN_TOPIC_HOURS = 1.0  # kept topics need at least this many hours a week to be useful
COMPRESSED_SESSION_FACTOR = 0.75  # compressed plans shorten sessions by this factor
MIN_COMPRESSED_SESSION_MINUTES = 25
RANGE_CHANGE_EPSILON = 0.01  # projected-score change treated as "moved" at a checkpoint

# Study timer
TIMER_CONFIRM_MULTIPLIER = 3  # sessions longer than this x planned duration need confirmation


def weights_sum_to_one(weights: dict[str, float]) -> bool:
    return abs(sum(weights.values()) - 1.0) < 1e-9


# Notifications (NFR8: relevant alerts, notification restraint)
MAX_VISIBLE_ALERTS = 3  # at most this many unread alerts are shown, newest first
MISSED_ALERT_MAX_AGE_HOURS = 24  # older overdue tasks are marked missed without an alert

# Daily motivation category selection
MOTIVATION_EXAM_WEEK_DAYS = 7  # exam_week messages when this many days or fewer remain
MOTIVATION_RECOVERY_LOOKBACK_DAYS = 3  # a missed session in this window means recovery
MOTIVATION_DECLINE_RECENT_DAYS = 14  # a decline alert this recent means recovery
MOTIVATION_CELEBRATION_ADHERENCE = 0.8  # last-7-day adherence for celebration
MOTIVATION_CELEBRATION_MIN_MINUTES = 60  # ...over at least this many planned minutes
MOTIVATION_CONSISTENCY_MIN_DAYS = 3  # study days in the last week for consistency (else effort)

# Predictions
PREDICTION_RUNS_TO_KEEP = 5  # older prediction runs per student are deleted

# Outcome undo
UNDO_WINDOW_HOURS = 24  # a recorded outcome can be undone for this long

# Coaching message
COACHING_MAX_FOCUS_CHARS = 60  # focus topic names/reasons are shortened (with "…") only beyond this
COACHING_MAX_FOCUS_WORDS = 5  # ...or beyond this many words

# Sessions
MIN_SESSION_MINUTES = 30  # no study session shorter than this (unless only a short remainder is left)
