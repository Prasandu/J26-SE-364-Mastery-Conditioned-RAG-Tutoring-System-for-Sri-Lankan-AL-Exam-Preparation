"""Shapes for planning and generating a model paper."""

from pydantic import BaseModel, ConfigDict, Field

from app.models import AnswerMode, SchemeStatus
from app.schemas.admin import Title


class CountsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mcq: int = Field(default=0, ge=0, le=60)
    structured: int = Field(default=0, ge=0, le=60)
    essay: int = Field(default=0, ge=0, le=60)

    def as_modes(self) -> dict[AnswerMode, int]:
        return {
            AnswerMode.MCQ: self.mcq,
            AnswerMode.STRUCTURED: self.structured,
            AnswerMode.ESSAY: self.essay,
        }


class GenerateIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Title
    topic_codes: list[str] = Field(min_length=1, max_length=30)
    counts: CountsIn


class PracticeIn(BaseModel):
    """A student asking for a practice paper of their own."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Title
    student_ref: str = Field(min_length=1, max_length=64)
    topic_codes: list[str] = Field(min_length=1, max_length=30)
    counts: CountsIn


class PracticeLimitsOut(BaseModel):
    """What a student may ask for, so the screen can say so before they try."""

    per_day: int
    made_today: int
    questions_at_once: int


class SectionShapeOut(BaseModel):
    code: str
    title: str
    answer_mode: AnswerMode
    count: int
    marks: float
    minutes: float


class ShapeOut(BaseModel):
    """What the paper will be, worked out without calling the model."""

    title: str
    sections: list[SectionShapeOut]
    questions: int
    marks: float
    minutes: int
    duration: str
    problems: list[str]


class RatesOut(BaseModel):
    """How long each kind of question takes, so a screen can show the time as it is typed."""

    minutes_per_question: dict[str, float]
    marks_per_question: dict[str, float]
    round_to_minutes: int
    max_per_section: int


class GeneratedOut(BaseModel):
    paper_id: int
    scheme_version: int
    title: str
    written_by: str
    kept: int
    dropped: list[str]  # questions the checks rejected, with the reason
    attempts: int = 1  # how many times the model had to be asked
    checked_by: list[str] = []  # which validators ran
    # Findings no check could settle. The paper is usable; these need a person.
    needs_teacher: list[str] = []
    # Resource passages that were retrieved and shown to the model while writing this
    # paper. The system's own record, not anything the model reported about itself.
    sources: list[dict] = []
    shape: ShapeOut


class SchemeValidationOut(BaseModel):
    """What a validation pass found, and where it left the scheme."""

    version: int
    status: SchemeStatus
    checked_by: list[str]  # validators that ran
    not_checked: list[str]  # validators that could not run, so proved nothing
    errors: list[str]  # proved wrong: the scheme is validation_failed
    needs_teacher: list[str]  # nothing could be proved either way
    notes: list[str]
    summary: str
