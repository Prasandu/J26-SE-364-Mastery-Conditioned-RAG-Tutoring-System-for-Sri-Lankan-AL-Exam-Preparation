"""Shapes for the teacher review queue and for comparing the markers."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import MarkingMethod, PointStatus
from app.schemas.attempts import GraphIn


class ReviewItemOut(BaseModel):
    """Everything a teacher needs to decide one marking point, without opening anything else."""

    id: int
    attempt_id: uuid.UUID
    student_ref: str
    submitted_at: datetime | None

    paper_title: str
    section: str
    question: str  # full label, e.g. "1(b)"
    question_text: str  # including the parent question's wording
    model_answer: str | None

    code: str  # marking point code, e.g. "P1"
    description: str
    marks: float

    student_text: str | None
    student_mcq_option: str | None
    student_graph: GraphIn | None

    status: PointStatus
    checker_awarded: bool | None
    ai_awarded: bool | None
    machine_evidence: str | None
    machine_reason: str | None
    confidence: float | None
    marker: str | None


class ReviewScriptOut(BaseModel):
    """One submitted script a teacher can mark, with how far they have got."""

    attempt_id: uuid.UUID
    student_ref: str
    paper_id: int
    paper_title: str
    submitted_at: datetime | None
    total_points: int
    reviewed_points: int
    machine_score: float | None
    max_score: float


class ReviewDecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    awarded: bool
    teacher_ref: str = Field(min_length=1, max_length=64, description="Who is marking (until login exists)")
    comment: str | None = Field(default=None, max_length=2000)
    saw_machine: bool = Field(
        default=False,
        description="True if the teacher read the machine's decision before deciding",
    )


class ReviewedPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: PointStatus
    awarded: float
    method: MarkingMethod | None
    teacher_awarded: bool | None
    teacher_comment: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    teacher_saw_machine: bool | None


class MarkerAgreement(BaseModel):
    """How one machine marker compares with the teacher on the points a teacher has decided."""

    judged: int  # points where both this marker and the teacher gave a decision
    agree: int
    disagree: int
    agreement_pct: float | None  # empty when nothing has been judged by both


class AgreementOut(BaseModel):
    reviewed_points: int
    checker_vs_teacher: MarkerAgreement
    ai_vs_teacher: MarkerAgreement
    checker_vs_ai: MarkerAgreement
    # The same figures over blind decisions only. This is the fair comparison, because
    # a teacher who had already read the machine's answer may just have agreed with it.
    blind_points: int
    blind_checker_vs_teacher: MarkerAgreement
    blind_ai_vs_teacher: MarkerAgreement
