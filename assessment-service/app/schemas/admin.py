"""Shapes of the JSON admins send to create or replace content.

Only field-level checks live here. Checks that need the whole paper or the
database (duplicate labels, unknown topics, marks adding up) are in
app/services/validation.py.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import AnswerMode, PaperKind, PointType, SchemeSource

Code = Annotated[str, Field(min_length=1, max_length=20)]
Title = Annotated[str, Field(min_length=1, max_length=200)]


class _Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---------- Topics ----------


class TopicIn(_Input):
    code: str = Field(pattern=r"^[A-Z0-9_]{1,30}$", examples=["STOICH"])
    name: Title
    parent_code: str | None = None


# ---------- Papers ----------


class OptionIn(_Input):
    label: Code
    text: str = Field(min_length=1)


class QuestionIn(_Input):
    label: Code = Field(examples=["1", "(a)", "(i)"])
    text: str = ""
    max_marks: float | None = Field(default=None, gt=0)
    options: list[OptionIn] | None = None  # MCQ sections only
    topics: list[str] = []  # topic codes
    sub_questions: list["QuestionIn"] = []


class SectionIn(_Input):
    code: Code = Field(examples=["I", "II-A"])
    title: Title
    answer_mode: AnswerMode
    choose_count: int | None = Field(default=None, gt=0)
    instructions: str | None = None
    questions: list[QuestionIn] = Field(min_length=1)


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


# ---------- Marking schemes ----------


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
