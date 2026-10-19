from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class StudyTask(Base):
    __tablename__ = "study_tasks"
    __table_args__ = (
        CheckConstraint("duration_min > 0", name="ck_study_tasks_duration_positive"),
        CheckConstraint(
            "actual_duration_min IS NULL OR "
            "(actual_duration_min >= 0 AND actual_duration_min <= duration_min)",
            name="ck_study_tasks_actual_duration",
        ),
        CheckConstraint(
            "(score_before IS NULL AND score_after IS NULL) OR "
            "(score_before IS NOT NULL AND score_after IS NOT NULL AND "
            "score_before >= 0 AND score_before <= 1 AND score_after >= 0 AND score_after <= 1)",
            name="ck_study_tasks_score_range",
        ),
        CheckConstraint(
            "status IN ('planned', 'completed', 'partial', 'missed')",
            name="ck_study_tasks_status",
        ),
        CheckConstraint(
            "timer_state IN ('idle', 'running', 'paused', 'finished')",
            name="ck_study_tasks_timer_state",
        ),
        CheckConstraint("paused_total_sec >= 0", name="ck_study_tasks_paused_total"),
        Index("ix_study_tasks_student_start", "student_id", "start_at"),
        Index("ix_study_tasks_plan_start", "plan_id", "start_at"),
        Index(
            "ix_study_tasks_student_timer_running",
            "student_id",
            unique=True,
            postgresql_where=text("timer_state = 'running'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("planning.study_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[str] = mapped_column(String(120), nullable=False)
    topic_id: Mapped[str] = mapped_column(
        ForeignKey("planning.topics.id", ondelete="RESTRICT"),
        nullable=False,
    )
    activity: Mapped[str] = mapped_column(String(80), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned")
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    reason_details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    steps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    replanned_from: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("planning.study_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    actual_duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_before: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Server-backed study timer. Elapsed time is always derived from these
    # server timestamps, never from client-reported values.
    timer_state: Mapped[str] = mapped_column(String(20), nullable=False, default="idle")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_resumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_total_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ReplanLog(Base):
    __tablename__ = "replan_log"
    __table_args__ = (Index("ix_replan_log_student_created", "student_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    student_id: Mapped[str] = mapped_column(String(120), nullable=False)
    plan_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("planning.study_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    task_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("planning.study_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    changes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
