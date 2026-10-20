"""Shapes of the JSON the API returns."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models import (
    AnswerMode,
    ContentStatus,
    PaperKind,
    PointType,
    RuleType,
    SchemeSource,
    SchemeStatus,
)


class _FromORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TopicOut(_FromORM):
    id: int
    code: str
    name: str
    parent_id: int | None


class PaperSummary(_FromORM):
    id: int
    title: str
    subject: str
    kind: PaperKind
    year: int | None
    status: ContentStatus


class SchemeSummary(_FromORM):
    id: int
    version: int
    source: SchemeSource
    status: SchemeStatus
    created_at: datetime
    published_at: datetime | None
    # The rest of the scheme's history - when it was checked, which validators ran,
    # who approved it. Admin-only, so safe to always include here.
    validated_at: datetime | None
    checked_by: str | None
    approved_by: str | None
    approved_at: datetime | None


class AdminPaperSummary(PaperSummary):
    created_at: datetime
    published_at: datetime | None
    created_by: str | None
    marking_schemes: list[SchemeSummary]


class PapersPageOut(BaseModel):
    """One page of the admin papers list."""

    items: list[AdminPaperSummary]
    total: int
    page: int
    page_size: int


class TableOut(BaseModel):
    headers: list[str]
    rows: list[list[str]]


class QuestionOut(BaseModel):
    id: int
    label: str
    text: str
    max_marks: float | None
    options: list[dict[str, str]] | None
    table: TableOut | None
    topics: list[str]
    sub_questions: list["QuestionOut"]
    # Which page of the paper's PDF this question starts on (past papers shown as a
    # PDF instead of this text) - empty for model papers and older past papers.
    start_page: int | None = None


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
    # Whether GET /papers/{id}/file has a PDF to serve, and how many pages it has -
    # empty for model papers and past papers imported before this existed.
    has_pdf: bool
    page_count: int | None


class AdminPaperDetail(PaperDetail):
    """The same tree of questions, plus what only an admin needs: who made it, when,
    and every marking scheme version with its full validation and approval history."""

    created_at: datetime
    published_at: datetime | None
    created_by: str | None
    grounded_in: list[dict[str, Any]]
    marking_schemes: list[SchemeSummary]


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


class MarkingSchemeOut(SchemeSummary):
    paper_id: int
    notes: str | None
    questions: list[QuestionSchemeOut]
