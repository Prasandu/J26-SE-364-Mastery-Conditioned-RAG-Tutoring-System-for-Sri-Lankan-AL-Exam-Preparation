"""Shapes of the JSON the API returns."""

from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models import AnswerMode, ContentStatus, PaperKind, PointType, RuleType, SchemeSource


class _FromORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PaperSummary(_FromORM):
    id: int
    title: str
    subject: str
    kind: PaperKind
    year: int | None
    status: ContentStatus


class QuestionOut(BaseModel):
    id: int
    label: str
    text: str
    max_marks: float | None
    options: list[dict[str, str]] | None
    topics: list[str]
    sub_questions: list["QuestionOut"]


class SectionOut(BaseModel):
    id: int
    code: str
    title: str
    answer_mode: AnswerMode
    choose_count: int | None
    instructions: str | None
    questions: list[QuestionOut]


class PaperDetail(PaperSummary):
    sections: list[SectionOut]


class MarkingPointOut(_FromORM):
    id: int
    code: str
    description: str
    marks: float
    point_type: PointType
    expected: dict[str, Any] | None
    alternatives: list[str]


class MarkingRuleOut(_FromORM):
    id: int
    rule_type: RuleType
    params: dict[str, Any]


class QuestionSchemeOut(BaseModel):
    question_id: int
    section: str  # section code, e.g. "II-A"
    label: str  # full label, e.g. "1(b)"
    max_marks: float | None
    model_answer: str | None
    points: list[MarkingPointOut]
    rules: list[MarkingRuleOut]


class MarkingSchemeOut(BaseModel):
    id: int
    paper_id: int
    version: int
    source: SchemeSource
    status: ContentStatus
    notes: str | None
    questions: list[QuestionSchemeOut]
