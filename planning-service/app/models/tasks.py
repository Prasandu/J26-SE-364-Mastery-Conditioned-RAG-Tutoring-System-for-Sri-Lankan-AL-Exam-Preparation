from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class StudyTask(Base):
    __tablename__ = "study_tasks"
    __table_args__ = (
        CheckConstraint("duration_min > 0", name="ck_study_tasks_duration_positive"),
        CheckConstraint(
            "status IN ('planned', 'completed', 'partial', 'missed')",
            name="ck_study_tasks_status",
        ),
        Index("ix_study_tasks_student_start", "student_id", "start_at"),
        Index("ix_study_tasks_plan_start", "plan_id", "start_at"),
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
    replanned_from: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("planning.study_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )


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
