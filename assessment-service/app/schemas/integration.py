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


class FinalizedScoreOut(BaseModel):
    awarded: float
    maximum: float


class FinalizedEventOut(BaseModel):
    """assessment.criterion.finalized v1 (docs/engineering/INTEGRATION_CONTRACTS.md).

    One finalized official decision on one marking point. Consumers dedupe on
    event_id and, per source_entity_id, keep the highest source_version (a teacher
    correction is a new version of the same point)."""

    schema_version: str = "1.0.0"
    event_id: uuid.UUID
    event_type: str = "assessment.criterion.finalized"
    producer: str = "assessment-service"
    subject_user_id: str  # the student's Supabase user id - never a client-supplied value
    source_entity_id: str  # attempt/<attempt id>/point/<point code>
    source_version: int  # 0 = machine rule/checker; n = the n-th teacher decision
    source_topic_codes: list[str]  # assessment codes; mapped by the consumer's reviewed registry
    status: str = "final"
    evidence_class: str  # "deterministic" (rule/checker) | "teacher_verified"
    score: FinalizedScoreOut
    paper_id: int
    assessed_at: datetime  # when the student answered (submitted, else marked) - for recency
    occurred_at: datetime  # when this decision became final (marking or the latest teacher review)


class FinalizedEventsOut(BaseModel):
    """One page, oldest decision first. Pass next_cursor back as `after` for the next page;
    has_more says whether one exists. The cursor is opaque."""

    schema_version: str = "1.0.0"
    as_of: datetime
    events: list[FinalizedEventOut]
    next_cursor: str | None = None
    has_more: bool = False
