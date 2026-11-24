"""Shapes of the JSON admins send to create or replace content.

Only field-level checks live here. Checks that need the whole paper or the
database (duplicate labels, unknown topics, marks adding up) are in
app/services/validation.py.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import AnswerMode, EdgeKind, EdgeStatus, PaperKind, PointType, SchemeSource

Code = Annotated[str, Field(min_length=1, max_length=20)]
Title = Annotated[str, Field(min_length=1, max_length=200)]


class _Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# Topics


class TopicIn(_Input):
    code: str = Field(pattern=r"^[A-Z0-9_]{1,30}$", examples=["STOICH"])
    name: Title
    parent_code: str | None = None
    contents: list[str] = []  # what the syllabus says this topic covers


# Papers


class OptionIn(_Input):
    label: Code
    text: str = Field(min_length=1)


class TableIn(_Input):
    """Tabulated data a question refers to, e.g. a set of experimental readings -
    the only way to show tabular data at all (see QuestionIn.table)."""

    headers: list[str] = Field(min_length=1)
    rows: list[list[str]] = Field(min_length=1)


class QuestionIn(_Input):
    label: Code = Field(examples=["1", "(a)", "(i)"])
    text: str = ""
    max_marks: float | None = Field(default=None, gt=0)
    options: list[OptionIn] | None = None  # MCQ sections only
    table: TableIn | None = None
    topics: list[str] = []  # topic codes
    sub_questions: list["QuestionIn"] = []
    # Which page of the paper's PDF this question starts on - past papers shown as a
    # PDF instead of `text` (see PaperIn.file_key).
    start_page: int | None = Field(default=None, gt=0)


class SectionIn(_Input):
    code: Code = Field(examples=["I", "II-A"])
    title: Title
    answer_mode: AnswerMode
    choose_count: int | None = Field(default=None, gt=0)
    instructions: str | None = None
    questions: list[QuestionIn] = Field(min_length=1)


class AppendQuestionsIn(_Input):
    """More questions for an existing draft section - see
    app.services.papers.append_questions."""

    questions: list[QuestionIn] = Field(min_length=1)


class PastPaperShellIn(_Input):
    """A past paper's own details and PDF, with no questions yet - see
    app.services.papers.create_past_paper_shell. Add its questions afterward, one
    at a time, with AppendQuestionsIn, once the real paper's layout is known."""

    title: Title
    year: int = Field(ge=1950, le=2100)
    subject: str = Field(default="chemistry", min_length=1, max_length=50)
    answer_mode: AnswerMode


class PaperIn(_Input):
    title: Title
    kind: PaperKind
    year: int | None = Field(default=None, ge=1950, le=2100)
    subject: str = Field(default="chemistry", min_length=1, max_length=50)
    sections: list[SectionIn] = Field(min_length=1)

    @model_validator(mode="after")
    def past_paper_needs_year(self) -> "PaperIn":
        if self.kind == PaperKind.PAST and self.year is None:
            raise ValueError("A past paper needs a year")
        return self


# Marking schemes


class PointIn(_Input):
    code: Code = Field(examples=["P1"])
    description: str = Field(min_length=1)
    marks: float = Field(gt=0)
    point_type: PointType
    expected: dict[str, Any] | None = None
    alternatives: list[str] = []


class _RuleIn(_Input):
    @property
    def params(self) -> dict[str, Any]:
        """Rule settings as stored in the database (everything except rule_type)."""
        return self.model_dump(exclude={"rule_type"})


class MaxMarksRuleIn(_RuleIn):
    """The question total can never go above `max`."""

    rule_type: Literal["max_marks"]
    max: float = Field(gt=0)


class AnyNOfRuleIn(_RuleIn):
    """Only the best `n` of these points count."""

    rule_type: Literal["any_n_of"]
    n: int = Field(gt=0)
    points: list[str] = Field(min_length=2)


class EcfRuleIn(_RuleIn):
    """Error carried forward: `point` can be awarded using the student's own (wrong) earlier values."""

    rule_type: Literal["ecf"]
    point: str
    depends_on: list[str] = Field(min_length=1)


RuleIn = Annotated[MaxMarksRuleIn | AnyNOfRuleIn | EcfRuleIn, Field(discriminator="rule_type")]


class QuestionSchemeIn(_Input):
    section: Code = Field(examples=["II-A"])
    question: str = Field(min_length=1, examples=["1(b)"], description="Full label, e.g. 1(b)(i)")
    model_answer: str | None = None
    points: list[PointIn] = []
    rules: list[RuleIn] = []


class MarkingSchemeIn(_Input):
    source: SchemeSource
    notes: str | None = None
    questions: list[QuestionSchemeIn] = Field(min_length=1)


class AppendSchemeQuestionsIn(_Input):
    """More question entries for an existing editable scheme version - see
    app.services.schemes.append_to_scheme."""

    questions: list[QuestionSchemeIn] = Field(min_length=1)


class QuestionTopicsIn(_Input):
    """Retag one question. Metadata only - allowed on a question of any paper status,
    published included, since it never touches marks or a marking scheme."""

    topics: list[str] = []


class TopicEdgeOut(BaseModel):
    """One relationship between two topics, for review."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    from_code: str
    to_code: str
    kind: EdgeKind
    status: EdgeStatus
    weight: float
    source: str
    evidence: str | None
    decided_by: str | None


class DecideEdgeIn(BaseModel):
    decided_by: str = Field(min_length=1, max_length=120)


class TopicEdgeIn(BaseModel):
    """An edge a teacher writes themselves."""

    from_code: str = Field(min_length=1, max_length=30)
    to_code: str = Field(min_length=1, max_length=30)
    kind: EdgeKind = EdgeKind.REQUIRES


class DerivedEdgesOut(BaseModel):
    proposed: int
    already_known: int


class DecideEdgesIn(BaseModel):
    """Several edges decided together, named by id."""

    edge_ids: list[int] = Field(min_length=1, max_length=500)
    approved: bool
    decided_by: str = Field(min_length=1, max_length=120)


class DecidedEdgesOut(BaseModel):
    decided: int
