from datetime import UTC, datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class StudentAttempt(Base):
    __tablename__ = "student_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    # String, not a foreign key: no users table exists yet. Will point at a
    # real authenticated user id once the shared auth system exists (see
    # CLAUDE.md: derive student identity from auth context, not client input).
    student_id: Mapped[str] = mapped_column(String(100))
    question_code: Mapped[str] = mapped_column(ForeignKey("verified_questions.question_code"), index=True)
    submitted_answer: Mapped[str] = mapped_column(String(200))
    correct: Mapped[bool] = mapped_column(Boolean)
    hints_used: Mapped[int] = mapped_column(Integer, default=0)
    time_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    independent_success: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
