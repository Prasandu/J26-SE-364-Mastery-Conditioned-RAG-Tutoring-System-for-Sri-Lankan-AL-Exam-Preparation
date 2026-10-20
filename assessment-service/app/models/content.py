"""The content library: Paper -> Section -> Question (a tree of sub-questions)."""

from collections.abc import Iterator
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import (
    CASCADE_ALL,
    JSON_DOC,
    PAPER_FK,
    QUESTION_FK,
    text_enum,
    utcnow,
)

if TYPE_CHECKING:
    from app.models.scheme import MarkingScheme


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
    # What the syllabus says this topic covers, one bullet per line. Used to keep a
    # generated question inside the syllabus instead of wherever the model wanders.
    content: Mapped[str | None] = mapped_column(Text)


class Paper(Base):
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(50), default="chemistry")
    kind: Mapped[PaperKind] = mapped_column(text_enum(PaperKind))
    year: Mapped[int | None] = mapped_column(Integer)  # empty for model papers
    status: Mapped[ContentStatus] = mapped_column(text_enum(ContentStatus), default=ContentStatus.DRAFT)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Who made it. Empty means it belongs to everyone: a past paper, or one an admin
    # published. A student's practice paper carries their own ref, so it stays theirs.
    created_by: Mapped[str | None] = mapped_column(String(64), index=True)
    # Which resource passages were retrieved and shown to the model while writing this
    # paper, [{"resource_code", "version", "page", "chunk_id"}, ...]. This is the
    # system's own record of what it looked up - never the model's say-so about what
    # it used, which is not something an AI reply can be trusted to report honestly.
    grounded_in: Mapped[list[dict]] = mapped_column(JSON_DOC, default=list)
    # The original PDF, for past papers shown to students as-is instead of OCR'd text
    # (see app/services/storage.py). Empty for model papers, and for past papers
    # imported before this existed.
    file_key: Mapped[str | None] = mapped_column(String(300))
    page_count: Mapped[int | None] = mapped_column(Integer)

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
    paper_id: Mapped[int] = mapped_column(ForeignKey(PAPER_FK, ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(20))  # e.g. "I", "II-A", "II-B"
    title: Mapped[str] = mapped_column(String(200))
    answer_mode: Mapped[AnswerMode] = mapped_column(text_enum(AnswerMode))
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
    # {"headers": [...], "rows": [[...], ...]} - tabulated data the question refers to
    # (e.g. experimental readings). The only way to show tabular data at all: a
    # question can describe a graph's axes in words, but cannot show a graph or a
    # diagram, so those still have to be asked about without one (see
    # app/ai/author.py's SYSTEM_PROMPT).
    table: Mapped[dict | None] = mapped_column(JSON_DOC)
    order_no: Mapped[int] = mapped_column(Integer, default=0)
    # Which page of the paper's stored PDF this question starts on (past papers shown
    # as a PDF instead of OCR'd text). Empty for model papers and plain-text questions.
    start_page: Mapped[int | None] = mapped_column(Integer)

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
