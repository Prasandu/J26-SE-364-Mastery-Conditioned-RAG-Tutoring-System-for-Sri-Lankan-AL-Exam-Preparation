from datetime import UTC, datetime

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class VerifiedQuestion(Base):
    __tablename__ = "verified_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_code: Mapped[str] = mapped_column(String(50), unique=True)
    topic_id: Mapped[str] = mapped_column(String(50))
    unit: Mapped[str] = mapped_column(String(20))
    question_text: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(String(20))  # easy / medium / hard
    verified_answer: Mapped[str] = mapped_column(String(100))
    answer_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Five-level hint ladder. Fixed, teacher-written text (not LLM-generated)
    # so correctness is guaranteed without an extra verification step.
    hint_text: Mapped[str] = mapped_column(Text)
    concept_text: Mapped[str] = mapped_column(Text)
    guided_question_text: Mapped[str] = mapped_column(Text)
    worked_steps_text: Mapped[str] = mapped_column(Text)
    full_solution_text: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
