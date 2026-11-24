"""Shape for GET /papers/practice/mastery - a student's own per-topic accuracy."""

from datetime import datetime

from pydantic import BaseModel


class TopicMasteryOut(BaseModel):
    topic_code: str
    topic_name: str
    points_total: int
    points_awarded: float
    accuracy_pct: float | None  # null = never attempted, not a 0%
    last_attempt_at: datetime | None
