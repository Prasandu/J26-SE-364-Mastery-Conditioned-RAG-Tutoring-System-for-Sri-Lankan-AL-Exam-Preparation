from datetime import UTC, datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class InterventionEvent(Base):
    """A record that an intervention suggestion was actually shown to a
    student, for the "intervention history" required by Support Analytics.
    """

    __tablename__ = "intervention_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[str] = mapped_column(String(100), index=True)
    rule: Mapped[str] = mapped_column(String(50))
    message: Mapped[str] = mapped_column(String(500))
    question_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
