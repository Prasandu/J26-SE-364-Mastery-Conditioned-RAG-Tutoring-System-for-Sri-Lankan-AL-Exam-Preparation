from datetime import date, datetime

from sqlalchemy import Date, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class MotivationState(Base):
    """Per-student shuffle bag for daily motivation messages."""

    __tablename__ = "motivation_state"

    student_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    shown_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    last_shown_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_message_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_category: Mapped[str | None] = mapped_column(String(40), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
