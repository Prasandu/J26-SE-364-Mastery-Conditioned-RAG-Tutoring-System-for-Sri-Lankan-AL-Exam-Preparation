"""Shapes for /integration - what the other 3 components of this group project
(J26-SE-364) read about a student's marks, topic performance and error
categories. See docs/integration-contract.md for the full contract.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models import AnswerMode, PointStatus, PointType


class TopicPerformanceOut(BaseModel):
    topic_code: str
    topic_name: str
    points_total: int
    points_awarded: float
    accuracy_pct: float
    last_attempt_at: datetime | None


class AnswerModeSummaryOut(BaseModel):
    answer_mode: AnswerMode
    attempts: int
    average_percent: float | None


class ErrorCategoryOut(BaseModel):
    """How often a point of this type was missed - the closest thing this system
    has today to a mistake taxonomy. Not a judgement of *why* it was missed."""

    point_type: PointType
    missed: int
    total: int


class StudentProfileOut(BaseModel):
    student_ref: str
    generated_at: datetime
    topic_performance: list[TopicPerformanceOut]
    by_answer_mode: list[AnswerModeSummaryOut]
    error_categories: list[ErrorCategoryOut]
    attempts_total: int
    attempts_marked: int
    attempts_needing_review: int


class MasteryEventOut(BaseModel):
    attempt_id: uuid.UUID
    paper_id: int
    paper_title: str
    section: str
    question_id: int
    question_label: str
    topic_codes: list[str]
    point_code: str
    point_type: PointType
    marks: float
    awarded: float
    status: PointStatus
    answer_mode: AnswerMode
    # The attempt's marked_at, not a per-point timestamp - PointResult does not
    # carry its own, so every point of an attempt arrives together, grouped by
    # when that attempt was marked as a whole.
    marked_at: datetime


class StudentEventsOut(BaseModel):
    student_ref: str
    as_of: datetime
    events: list[MasteryEventOut]
