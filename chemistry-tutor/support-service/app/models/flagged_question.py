from datetime import UTC, datetime

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class FlaggedQuestion(Base):
    """A question a student got wrong, reported by another component (e.g.
    the model-paper/past-paper processing component owned by another team
    member). This is the inbox other components POST into via
    POST /api/v1/practice/flagged-questions; until that integration exists,
    scripts/seed_flagged_questions.py creates mock records through the same
    service function so the Practice "Review Mistakes" flow is testable.
    """

    __tablename__ = "flagged_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[str] = mapped_column(String(100), index=True)
    # Which upstream component/paper this came from, e.g. "model_paper".
    source: Mapped[str] = mapped_column(String(50))
    question_text: Mapped[str] = mapped_column(Text)
    topic: Mapped[str] = mapped_column(String(200))
    sub_topic: Mapped[str | None] = mapped_column(String(200), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Optional link into the GraphRAG concept graph (app.models.Concept),
    # not a foreign key since the upstream component won't know our
    # internal concept_id convention — set manually/later if useful.
    concept_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    submitted_answer: Mapped[str] = mapped_column(Text)
    correct_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "pending" until the student has been walked through an explanation.
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
