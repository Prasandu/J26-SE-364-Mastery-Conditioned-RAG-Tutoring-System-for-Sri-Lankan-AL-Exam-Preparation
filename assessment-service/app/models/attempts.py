"""Student work.

Attempt (one student answering one paper, fixed to one scheme version)
  -> Answer (per answered question) -> PointResult (per marking point)
"""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import (
    ANSWER_FK,
    ATTEMPT_FK,
    CASCADE_ALL,
    JSON_DOC,
    PAPER_FK,
    QUESTION_FK,
    SCHEME_FK,
    text_enum,
    utcnow,
)
from app.models.content import Paper, Question
from app.models.scheme import MarkingPoint, MarkingScheme


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
    paper_id: Mapped[int] = mapped_column(ForeignKey(PAPER_FK), index=True)
    # The scheme version is fixed when the attempt starts, so later versions never change old marks.
    scheme_id: Mapped[int] = mapped_column(ForeignKey(SCHEME_FK), index=True)
    student_ref: Mapped[str] = mapped_column(String(64), index=True)  # becomes a user id with shared login
    mode: Mapped[AttemptMode] = mapped_column(text_enum(AttemptMode))
    status: Mapped[AttemptStatus] = mapped_column(text_enum(AttemptStatus), default=AttemptStatus.IN_PROGRESS)
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
    # Paper mode: what the model read, kept beside the version the student confirmed in `text`.
    extracted_text: Mapped[str | None] = mapped_column(Text)
    reader: Mapped[str | None] = mapped_column(String(100))  # the vision model that read it
    reading_confidence: Mapped[float | None] = mapped_column(Float)
    corrected_by_student: Mapped[bool] = mapped_column(Boolean, default=False)
    score: Mapped[float | None] = mapped_column(Float)  # empty until every point is marked
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    attempt: Mapped[Attempt] = relationship(back_populates="answers")
    question: Mapped[Question] = relationship()
    point_results: Mapped[list["PointResult"]] = relationship(
        back_populates="answer", order_by="PointResult.id", cascade=CASCADE_ALL
    )
    images: Mapped[list["AnswerImage"]] = relationship(
        back_populates="answer", order_by="AnswerImage.order_no", cascade=CASCADE_ALL
    )


class PointResult(Base):
    """Decision for one marking point of one answer, with the evidence behind it (traceability)."""

    __tablename__ = "point_results"
    __table_args__ = (UniqueConstraint("answer_id", "point_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    answer_id: Mapped[int] = mapped_column(ForeignKey(ANSWER_FK, ondelete="CASCADE"))
    point_id: Mapped[int] = mapped_column(ForeignKey("marking_points.id"), index=True)
    status: Mapped[PointStatus] = mapped_column(text_enum(PointStatus), index=True)
    awarded: Mapped[float] = mapped_column(Float, default=0.0)
    method: Mapped[MarkingMethod | None] = mapped_column(text_enum(MarkingMethod))
    # What each marker decided on its own, kept even when they disagree.
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


class AnswerImage(Base):
    """A photo of one handwritten answer. Several pages may belong to one answer."""

    __tablename__ = "answer_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    answer_id: Mapped[int] = mapped_column(ForeignKey(ANSWER_FK, ondelete="CASCADE"), index=True)
    storage_key: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[str] = mapped_column(String(100))
    order_no: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    answer: Mapped[Answer] = relationship(back_populates="images")
