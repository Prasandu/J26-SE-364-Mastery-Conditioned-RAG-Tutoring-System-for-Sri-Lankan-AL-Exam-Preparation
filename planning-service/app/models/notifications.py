from datetime import datetime, time
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Time,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("type IN ('reminder', 'missed', 'info')", name="ck_notifications_type"),
        UniqueConstraint("student_id", "dedupe_key", name="uq_notifications_student_dedupe"),
        Index("ix_notifications_student_created", "student_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    student_id: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    task_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("planning.study_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    action: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NotificationPreferences(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (
        CheckConstraint(
            "reminder_lead_minutes >= 0 AND reminder_lead_minutes <= 120",
            name="ck_notification_preferences_lead",
        ),
    )

    student_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    reminder_lead_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    quiet_hours_start: Mapped[time] = mapped_column(Time, nullable=False, default=time(22, 0))
    quiet_hours_end: Mapped[time] = mapped_column(Time, nullable=False, default=time(6, 0))
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
