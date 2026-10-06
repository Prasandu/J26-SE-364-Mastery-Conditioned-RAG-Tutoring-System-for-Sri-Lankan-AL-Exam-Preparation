"""Shapes for students answering papers and seeing their results."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import AttemptMode, AttemptStatus, MarkingMethod, PointStatus


class AttemptCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    paper_id: int
    student_ref: str = Field(
        min_length=1, max_length=64, description="Student id (until shared login exists)"
    )


class AnswerIn(BaseModel):
    """Send `mcq_option` for MCQ questions, `text` for structured and essay questions."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mcq_option: str | None = Field(default=None, min_length=1, max_length=20)
    text: str | None = Field(default=None, min_length=1, max_length=20_000)

    @model_validator(mode="after")
    def exactly_one(self) -> "AnswerIn":
        if (self.mcq_option is None) == (self.text is None):
            raise ValueError("Send either mcq_option or text")
        return self


class AnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: int
    mcq_option: str | None
    text: str | None
    updated_at: datetime


class PointResultOut(BaseModel):
    code: str
    description: str
    marks: float
    status: PointStatus
    awarded: float | None  # empty until the decision is final
    method: MarkingMethod | None
    marker: str | None
    evidence: str | None
    reason: str | None
    confidence: float | None


class QuestionResultOut(BaseModel):
    question_id: int
    section: str
    label: str
    max_marks: float | None
    answer: AnswerOut | None
    score: float | None  # empty while in progress or while points are pending
    points: list[PointResultOut]  # empty until submitted


class AttemptOut(BaseModel):
    id: uuid.UUID
    paper_id: int
    scheme_version: int
    student_ref: str
    mode: AttemptMode
    status: AttemptStatus
    score: float | None
    max_score: float
    started_at: datetime
    submitted_at: datetime | None
    marked_at: datetime | None
    questions: list[QuestionResultOut]
