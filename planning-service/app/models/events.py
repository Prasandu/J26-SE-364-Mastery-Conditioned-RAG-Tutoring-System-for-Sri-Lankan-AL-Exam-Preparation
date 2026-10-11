from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RawEvent(Base):
    __tablename__ = "raw_events"
    __table_args__ = (Index("ix_raw_events_student_received", "student_id", "received_at"),)

    event_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(120), nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class TopicEvidence(Base):
    __tablename__ = "topic_evidence"
    __table_args__ = (
        CheckConstraint("score >= 0", name="ck_topic_evidence_score_nonnegative"),
        CheckConstraint("max_score > 0", name="ck_topic_evidence_max_score_positive"),
        CheckConstraint("score <= max_score", name="ck_topic_evidence_score_within_max"),
        CheckConstraint("difficulty >= 0 AND difficulty <= 1", name="ck_topic_evidence_difficulty"),
        UniqueConstraint("event_id", "topic_id", name="uq_topic_evidence_event_topic"),
        Index("ix_topic_evidence_student_observed", "student_id", "observed_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    student_id: Mapped[str] = mapped_column(String(120), nullable=False)
    topic_id: Mapped[str] = mapped_column(
        ForeignKey("planning.topics.id", ondelete="RESTRICT"),
        nullable=False,
    )
    event_id: Mapped[str] = mapped_column(
        ForeignKey("planning.raw_events.event_id", ondelete="CASCADE"),
        nullable=False,
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    max_score: Mapped[float] = mapped_column(Float, nullable=False)
    difficulty: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LearnerTopicState(Base):
    __tablename__ = "learner_topic_state"
    __table_args__ = (
        CheckConstraint("mastery >= 0 AND mastery <= 1", name="ck_learner_state_mastery"),
        CheckConstraint("error_rate >= 0 AND error_rate <= 1", name="ck_learner_state_error_rate"),
        CheckConstraint("weak_score >= 0 AND weak_score <= 1", name="ck_learner_state_weak_score"),
        CheckConstraint("ease >= 1.3", name="ck_learner_state_ease"),
        CheckConstraint("interval_days >= 0", name="ck_learner_state_interval_days"),
        Index("ix_learner_state_student_review", "student_id", "next_review_at"),
    )

    student_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    topic_id: Mapped[str] = mapped_column(
        ForeignKey("planning.topics.id", ondelete="CASCADE"),
        primary_key=True,
    )
    mastery: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    trend: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    error_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    weak_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    last_revised: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ease: Mapped[float] = mapped_column(Float, nullable=False, default=2.5)
    interval_days: Mapped[int] = mapped_column(nullable=False, default=0)
