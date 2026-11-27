"""DAT-010 consumer state: the ledger of finalized marks received from assessment, the
events refused outright, and the pull position."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

DECISION_STATUSES = ("applied", "superseded", "stale", "quarantined", "legacy_unverified")


class AssessmentDecision(Base):
    """One received version of one assessment marking-point decision.

    applied - its marks are TopicEvidence now; superseded - a newer version replaced it
    (its evidence was removed, the row stays for audit); stale - it arrived after a newer
    version and was never applied; quarantined - a topic code has no reviewed mapping yet;
    legacy_unverified - not an official non-generative mark, never applied.
    At most one version per source_entity_id is applied at any time.
    """

    __tablename__ = "assessment_decisions"
    __table_args__ = (
        UniqueConstraint("source_entity_id", "source_version", name="uq_assessment_decisions_entity_version"),
        CheckConstraint(
            "status IN ('applied', 'superseded', 'stale', 'quarantined', 'legacy_unverified')",
            name="ck_assessment_decisions_status",
        ),
        CheckConstraint("source_version >= 0", name="ck_assessment_decisions_version"),
        CheckConstraint(
            "score_awarded >= 0 AND score_maximum > 0 AND score_awarded <= score_maximum",
            name="ck_assessment_decisions_score",
        ),
        Index("ix_assessment_decisions_subject", "subject_user_id"),
        Index("ix_assessment_decisions_status", "status"),
        Index(
            "uq_assessment_decisions_one_applied",
            "source_entity_id",
            unique=True,
            postgresql_where=text("status = 'applied'"),
        ),
    )

    event_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    source_entity_id: Mapped[str] = mapped_column(String(200), nullable=False)
    source_version: Mapped[int] = mapped_column(Integer, nullable=False)
    subject_user_id: Mapped[str] = mapped_column(String(120), nullable=False)
    evidence_class: Mapped[str] = mapped_column(String(40), nullable=False)
    source_topic_codes: Mapped[list] = mapped_column(JSONB, nullable=False)
    topic_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    score_awarded: Mapped[float] = mapped_column(Float, nullable=False)
    score_maximum: Mapped[float] = mapped_column(Float, nullable=False)
    source_paper_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    assessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    superseded_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class IntegrationRejection(Base):
    """An event refused outright: malformed, a reused id with different content, a point
    that already belongs to another student, or an id another source already used."""

    __tablename__ = "integration_rejections"
    __table_args__ = (
        UniqueConstraint("fingerprint", name="uq_integration_rejections_fingerprint"),
        Index("ix_integration_rejections_source_received", "source", "received_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    event_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reason: Mapped[str] = mapped_column(String(300), nullable=False)
    # sha256 of source + reason + the event as received, so a re-read does not pile up copies.
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class IntegrationCursor(Base):
    """How far the planner has read a source's feed."""

    __tablename__ = "integration_cursors"

    source: Mapped[str] = mapped_column(String(80), primary_key=True)
    # Latest final-decision time applied; the next pull re-reads a short overlap before it.
    high_water: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
