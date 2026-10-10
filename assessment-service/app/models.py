"""Database tables.

Content library:
  Paper -> Section -> Question (tree of sub-questions)
  MarkingScheme (versioned, per paper) -> MarkingPoint / MarkingRule / ModelAnswer (per question)

Student work:
  Attempt (one student answering one paper, fixed to one scheme version)
    -> Answer (per answered question) -> PointResult (per marking point)
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
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
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

QUESTION_FK = "questions.id"
SCHEME_FK = "marking_schemes.id"
ATTEMPT_FK = "attempts.id"
CASCADE_ALL = "all, delete-orphan"

# JSONB on Postgres (indexable, faster); plain JSON on SQLite (tests).
JSON_DOC = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sections: Mapped[list["Section"]] = relationship(
        back_populates="paper", order_by="Section.order_no", cascade=CASCADE_ALL
    )
    marking_schemes: Mapped[list["MarkingScheme"]] = relationship(
        back_populates="paper", order_by="MarkingScheme.version", cascade=CASCADE_ALL
    )

    def iter_questions(self) -> Iterator["Question"]:
        """Every question and sub-question, in paper order: 1, 1(a), 1(b), 2, ..."""
        for section in self.sections:
            for question in section.questions:
                if question.parent is None:
                    yield from question.walk()


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

    def walk(self) -> Iterator["Question"]:
        """This question, then all its sub-questions (depth first)."""
        yield self
        for sub in self.sub_questions:
            yield from sub.walk()


class MarkingScheme(Base):
    __tablename__ = "marking_schemes"
    __table_args__ = (UniqueConstraint("paper_id", "version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    source: Mapped[SchemeSource] = mapped_column(_enum(SchemeSource))
    status: Mapped[ContentStatus] = mapped_column(_enum(ContentStatus), default=ContentStatus.DRAFT)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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


# =============================================================
# Student work
# =============================================================


class AttemptMode(StrEnum):
    DIGITAL = "digital"  # typed / clicked on screen
    PAPER = "paper"  # written on paper and uploaded (later step)


class AttemptStatus(StrEnum):
    IN_PROGRESS = "in_progress"  # answers can still change
    SUBMITTED = "submitted"  # locked; some points still waiting to be marked
    MARKED = "marked"  # every point decided, total available


class PointStatus(StrEnum):
    AWARDED = "awarded"
    NOT_AWARDED = "not_awarded"
    PENDING = "pending"  # not decided yet (waiting for a marker)
    NEEDS_REVIEW = "needs_review"  # a marker decided, but the decision is not trusted -> teacher


class MarkingMethod(StrEnum):
    RULE = "rule"  # exact rule, e.g. MCQ key
    CHECKER = "checker"  # chemistry checker (later step)
    LLM = "llm"  # AI judge (later step)
    TEACHER = "teacher"  # teacher review (later step)


class Attempt(Base):
    __tablename__ = "attempts"

    # Random id, so nobody can guess another student's attempt URL.
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id"), index=True)
    # The scheme version is fixed when the attempt starts, so later versions never change old marks.
    scheme_id: Mapped[int] = mapped_column(ForeignKey(SCHEME_FK), index=True)
    student_ref: Mapped[str] = mapped_column(String(64), index=True)  # becomes a user id with shared login
    mode: Mapped[AttemptMode] = mapped_column(_enum(AttemptMode))
    status: Mapped[AttemptStatus] = mapped_column(_enum(AttemptStatus), default=AttemptStatus.IN_PROGRESS)
    score: Mapped[float | None] = mapped_column(Float)  # empty until every point is marked
    max_score: Mapped[float] = mapped_column(Float)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    marked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    paper: Mapped[Paper] = relationship()
    scheme: Mapped[MarkingScheme] = relationship()
    answers: Mapped[list["Answer"]] = relationship(back_populates="attempt", cascade=CASCADE_ALL)


class Answer(Base):
    """The student's answer to one question, in the same shape for every input mode."""

    __tablename__ = "answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(ATTEMPT_FK, ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey(QUESTION_FK), index=True)
    mcq_option: Mapped[str | None] = mapped_column(String(20))
    text: Mapped[str | None] = mapped_column(Text)
    # Structured answers the student built with a tool rather than typed, e.g. a plotted graph.
    data: Mapped[dict[str, Any] | None] = mapped_column(JSON_DOC)
    score: Mapped[float | None] = mapped_column(Float)  # empty until every point is marked
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    attempt: Mapped[Attempt] = relationship(back_populates="answers")
    question: Mapped[Question] = relationship()
    point_results: Mapped[list["PointResult"]] = relationship(
        back_populates="answer", order_by="PointResult.id", cascade=CASCADE_ALL
    )


class PointResult(Base):
    """Decision for one marking point of one answer, with the evidence behind it (traceability)."""

    __tablename__ = "point_results"
    __table_args__ = (UniqueConstraint("answer_id", "point_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    answer_id: Mapped[int] = mapped_column(ForeignKey("answers.id", ondelete="CASCADE"))
    point_id: Mapped[int] = mapped_column(ForeignKey("marking_points.id"), index=True)
    status: Mapped[PointStatus] = mapped_column(_enum(PointStatus), index=True)
    awarded: Mapped[float] = mapped_column(Float, default=0.0)
    method: Mapped[MarkingMethod | None] = mapped_column(_enum(MarkingMethod))
    # What each marker decided on its own, kept even when they disagree. Two independent
    # markers agreeing is the main evidence behind the confidence score.
    checker_awarded: Mapped[bool | None] = mapped_column(Boolean)
    ai_awarded: Mapped[bool | None] = mapped_column(Boolean)
    teacher_awarded: Mapped[bool | None] = mapped_column(Boolean)
    evidence: Mapped[str | None] = mapped_column(Text)  # the student's own words, or the rule applied
    reason: Mapped[str | None] = mapped_column(Text)  # short explanation shown as feedback
    marker: Mapped[str | None] = mapped_column(String(100))  # e.g. "mcq-key" or the AI model name
    confidence: Mapped[float | None] = mapped_column(Float)  # 0..1
    teacher_comment: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[str | None] = mapped_column(String(64))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    answer: Mapped[Answer] = relationship(back_populates="point_results")
    point: Mapped[MarkingPoint] = relationship()
