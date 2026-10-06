"""Database tables for the past-paper / model-paper library and marking schemes.

Paper -> Section -> Question (tree of sub-questions)
MarkingScheme (versioned, per paper) -> MarkingPoint / MarkingRule / ModelAnswer (per question)
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

QUESTION_FK = "questions.id"
SCHEME_FK = "marking_schemes.id"
CASCADE_ALL = "all, delete-orphan"

# JSONB on Postgres (indexable, faster); plain JSON on SQLite (tests).
JSON_DOC = JSON().with_variant(JSONB(), "postgresql")


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _enum(enum_cls: type[StrEnum]) -> Enum:
    # Stored as plain text so the same tables work on SQLite and Postgres.
    return Enum(
        enum_cls,
        native_enum=False,
        length=20,
        values_callable=lambda members: [m.value for m in members],
    )


class PaperKind(StrEnum):
    PAST = "past"
    MODEL = "model"


class ContentStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


class AnswerMode(StrEnum):
    MCQ = "mcq"
    STRUCTURED = "structured"
    ESSAY = "essay"


class SchemeSource(StrEnum):
    OFFICIAL = "official"
    TEACHER = "teacher"
    GENERATED = "generated"


class PointType(StrEnum):
    MCQ_KEY = "mcq_key"
    CONCEPT = "concept"
    EQUATION = "equation"
    FORMULA = "formula"
    CALCULATION = "calculation"
    UNIT = "unit"
    DIAGRAM = "diagram"
    GRAPH = "graph"


class RuleType(StrEnum):
    MAX_MARKS = "max_marks"  # params: {"max": 4}
    ANY_N_OF = "any_n_of"  # params: {"n": 2, "points": ["P1", "P2", "P3"]}
    ERROR_CARRIED_FORWARD = "ecf"  # params: {"point": "P3", "depends_on": ["P1"]}


question_topics = Table(
    "question_topics",
    Base.metadata,
    Column("question_id", ForeignKey(QUESTION_FK, ondelete="CASCADE"), primary_key=True),
    Column("topic_id", ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("topics.id"), index=True)


class Paper(Base):
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(50), default="chemistry")
    kind: Mapped[PaperKind] = mapped_column(_enum(PaperKind))
    year: Mapped[int | None] = mapped_column(Integer)  # empty for model papers
    status: Mapped[ContentStatus] = mapped_column(_enum(ContentStatus), default=ContentStatus.DRAFT)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    sections: Mapped[list["Section"]] = relationship(
        back_populates="paper", order_by="Section.order_no", cascade=CASCADE_ALL
    )
    marking_schemes: Mapped[list["MarkingScheme"]] = relationship(
        back_populates="paper", order_by="MarkingScheme.version", cascade=CASCADE_ALL
    )


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(20))  # e.g. "I", "II-A", "II-B"
    title: Mapped[str] = mapped_column(String(200))
    answer_mode: Mapped[AnswerMode] = mapped_column(_enum(AnswerMode))
    choose_count: Mapped[int | None] = mapped_column(Integer)  # "answer any N"; empty = answer all
    instructions: Mapped[str | None] = mapped_column(Text)
    order_no: Mapped[int] = mapped_column(Integer, default=0)

    paper: Mapped[Paper] = relationship(back_populates="sections")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="section", order_by="Question.order_no", cascade=CASCADE_ALL
    )


class Question(Base):
    """A question or a sub-question. Sub-questions point to their parent."""

    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey(QUESTION_FK, ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(20))  # "1", "(a)", "(i)"
    text: Mapped[str] = mapped_column(Text, default="")
    max_marks: Mapped[float | None] = mapped_column(Float)
    options: Mapped[list[dict[str, str]] | None] = mapped_column(JSON_DOC)  # MCQ only
    order_no: Mapped[int] = mapped_column(Integer, default=0)

    section: Mapped[Section] = relationship(back_populates="questions")
    parent: Mapped["Question | None"] = relationship(back_populates="sub_questions", remote_side=[id])
    sub_questions: Mapped[list["Question"]] = relationship(
        back_populates="parent", order_by="Question.order_no"
    )
    topics: Mapped[list[Topic]] = relationship(secondary=question_topics)

    @property
    def full_label(self) -> str:
        """Label including parents, e.g. "1(b)(i)"."""
        return (self.parent.full_label if self.parent else "") + self.label


class MarkingScheme(Base):
    __tablename__ = "marking_schemes"
    __table_args__ = (UniqueConstraint("paper_id", "version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    source: Mapped[SchemeSource] = mapped_column(_enum(SchemeSource))
    status: Mapped[ContentStatus] = mapped_column(_enum(ContentStatus), default=ContentStatus.DRAFT)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    paper: Mapped[Paper] = relationship(back_populates="marking_schemes")
    points: Mapped[list["MarkingPoint"]] = relationship(
        back_populates="scheme", order_by="MarkingPoint.order_no", cascade=CASCADE_ALL
    )
    rules: Mapped[list["MarkingRule"]] = relationship(back_populates="scheme", cascade=CASCADE_ALL)
    model_answers: Mapped[list["ModelAnswer"]] = relationship(back_populates="scheme", cascade=CASCADE_ALL)


class MarkingPoint(Base):
    """One thing that earns marks, e.g. "correct moles of HCl = 2.00 x 10^-3 mol" (1 mark)."""

    __tablename__ = "marking_points"
    __table_args__ = (UniqueConstraint("scheme_id", "question_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    scheme_id: Mapped[int] = mapped_column(ForeignKey(SCHEME_FK, ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey(QUESTION_FK, ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(20))  # "P1", "P2"...
    description: Mapped[str] = mapped_column(Text)
    marks: Mapped[float] = mapped_column(Float)
    point_type: Mapped[PointType] = mapped_column(_enum(PointType))
    # Machine-checkable answer, depends on point_type. Examples:
    #   mcq_key:     {"option": "4"}
    #   equation:    {"equation": "\\ce{NaOH(aq) + HCl(aq) -> NaCl(aq) + H2O(l)}"}
    #   calculation: {"value": 0.08, "unit": "mol dm-3", "tolerance_pct": 1}
    expected: Mapped[dict[str, Any] | None] = mapped_column(JSON_DOC)
    alternatives: Mapped[list[str]] = mapped_column(JSON_DOC, default=list)  # other accepted answers
    order_no: Mapped[int] = mapped_column(Integer, default=0)

    scheme: Mapped[MarkingScheme] = relationship(back_populates="points")
    question: Mapped[Question] = relationship()


class MarkingRule(Base):
    __tablename__ = "marking_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    scheme_id: Mapped[int] = mapped_column(ForeignKey(SCHEME_FK, ondelete="CASCADE"), index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey(QUESTION_FK, ondelete="CASCADE"), index=True)
    rule_type: Mapped[RuleType] = mapped_column(_enum(RuleType))
    params: Mapped[dict[str, Any]] = mapped_column(JSON_DOC, default=dict)

    scheme: Mapped[MarkingScheme] = relationship(back_populates="rules")
    question: Mapped[Question] = relationship()


class ModelAnswer(Base):
    __tablename__ = "model_answers"
    __table_args__ = (UniqueConstraint("scheme_id", "question_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    scheme_id: Mapped[int] = mapped_column(ForeignKey(SCHEME_FK, ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey(QUESTION_FK, ondelete="CASCADE"), index=True)
    answer_text: Mapped[str] = mapped_column(Text)

    scheme: Mapped[MarkingScheme] = relationship(back_populates="model_answers")
    question: Mapped[Question] = relationship()
