from datetime import date, datetime, time
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class StudyPlan(Base):
    __tablename__ = "study_plans"
    __table_args__ = (
        CheckConstraint("mode IN ('manual', 'predicted')", name="ck_study_plans_mode"),
        Index("ix_study_plans_student_updated", "student_id", "updated_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    student_id: Mapped[str] = mapped_column(String(120), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    exam_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_grade: Mapped[str] = mapped_column(String(20), nullable=False)
    constraints: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AvailabilitySlot(Base):
    __tablename__ = "availability_slots"
    __table_args__ = (
        CheckConstraint("weekday >= 0 AND weekday <= 6", name="ck_availability_weekday"),
        CheckConstraint("start_time < end_time", name="ck_availability_time_order"),
        Index("ix_availability_plan_weekday", "plan_id", "weekday"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("planning.study_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    weekday: Mapped[int] = mapped_column(nullable=False)
    start_time: Mapped[time] = mapped_column(nullable=False)
    end_time: Mapped[time] = mapped_column(nullable=False)
