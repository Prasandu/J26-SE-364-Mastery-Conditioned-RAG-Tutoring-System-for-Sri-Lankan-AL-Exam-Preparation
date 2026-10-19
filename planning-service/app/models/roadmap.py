from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RoadmapWeek(Base):
    """One week in the rolling-horizon roadmap forecast for a study plan.

    Each row stores the ordered list of topics and their expected study hours
    for one ISO-week bucket.  The ``label`` column is either ``"forecast"``
    (auto-generated from the allocation algorithm) or ``"committed"`` (the
    window of detailed tasks that have already been generated).  Rows are
    regenerated whenever a checkpoint fires (end-of-window or new evidence).
    """

    __tablename__ = "roadmap_weeks"
    __table_args__ = (
        CheckConstraint(
            "label IN ('forecast', 'committed')",
            name="ck_roadmap_weeks_label",
        ),
        Index("ix_roadmap_weeks_plan_week_start", "plan_id", "week_start"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("planning.study_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[str] = mapped_column(String(120), nullable=False)
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    label: Mapped[str] = mapped_column(String(20), nullable=False, default="forecast")
    topics: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    total_hours: Mapped[float] = mapped_column(nullable=False, default=0.0)
    weeks_to_exam: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    compressed: Mapped[bool] = mapped_column(nullable=False, default=False)
    compression_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
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
