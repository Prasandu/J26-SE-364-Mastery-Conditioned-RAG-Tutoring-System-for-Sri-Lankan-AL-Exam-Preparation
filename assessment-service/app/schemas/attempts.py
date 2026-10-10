"""Shapes for students answering papers and seeing their results."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import AttemptMode, AttemptStatus, MarkingMethod, PointStatus


class AttemptCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    paper_id: int
    student_ref: str = Field(
        min_length=1, max_length=64, description="Student id (until shared login exists)"
    )


class GraphIn(BaseModel):
    """A plotted graph as data, not a picture, so it can be marked exactly."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    points: list[tuple[float, float]] = Field(default_factory=list, max_length=200)
    x_label: str | None = Field(default=None, max_length=100)
    x_unit: str | None = Field(default=None, max_length=50)
    y_label: str | None = Field(default=None, max_length=100)
    y_unit: str | None = Field(default=None, max_length=50)
    gradient: float | None = None  # what the student read off their line
    intercept: float | None = None


class AnswerIn(BaseModel):
    """`mcq_option` for MCQ questions; `text` and/or `graph` for structured and essay questions."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mcq_option: str | None = Field(default=None, min_length=1, max_length=20)
    text: str | None = Field(default=None, min_length=1, max_length=20_000)
    graph: GraphIn | None = None

    @model_validator(mode="after")
    def one_kind_of_answer(self) -> "AnswerIn":
        written = self.text is not None or self.graph is not None
        if self.mcq_option is not None and written:
            raise ValueError("Send mcq_option on its own, without text or graph")
        if self.mcq_option is None and not written:
            raise ValueError("Send mcq_option, text or graph")
        return self


class AnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    question_id: int
    mcq_option: str | None
    text: str | None
    graph: GraphIn | None = Field(default=None, validation_alias="data")
    # Paper mode: what was read, by which model, and whether the student changed it.
    extracted_text: str | None = None
    reader: str | None = None
    reading_confidence: float | None = None
    corrected_by_student: bool = False
    image_count: int = Field(default=0, validation_alias="images")
    updated_at: datetime

    @field_validator("image_count", mode="before")
    @classmethod
    def count_images(cls, value: object) -> object:
        return len(value) if isinstance(value, list) else value


class PointResultOut(BaseModel):
    code: str
    description: str
    marks: float
    status: PointStatus
    awarded: float | None  # empty until the decision is final
    method: MarkingMethod | None
    marker: str | None
    # What each marker decided on its own (empty when that marker did not judge this point)
    checker_awarded: bool | None
    ai_awarded: bool | None
    teacher_comment: str | None
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
