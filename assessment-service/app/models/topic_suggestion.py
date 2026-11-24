"""AI-suggested topic tags for a question, waiting for a person to decide.

A suggestion is never applied to Question.topics by itself. It sits here, pending,
until an admin approves it - at which point the question's actual topic codes are
set - or rejects it, which leaves the question untouched. This is the record of
"AI-suggested" kept apart from "approved", which the prompt this was built for
is explicit about: AI-generated tags are never ground truth on their own.
"""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import JSON_DOC, QUESTION_FK, text_enum, utcnow
from app.models.content import Question


class SuggestionStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class TopicSuggestion(Base):
    """One classifier run's opinion on one question's topics.

    A question keeps at most one *pending* suggestion at a time - the classify
    service checks for one before creating another, which is what makes a batch run
    resumable and safe to repeat without piling up duplicates. Once a suggestion is
    approved or rejected, a later run may classify the same question again (the
    syllabus or the question text may have changed), so this is enforced in the
    service, not as a table-wide uniqueness rule that would block that.
    """

    __tablename__ = "topic_suggestions"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey(QUESTION_FK, ondelete="CASCADE"), index=True)
    # What the model suggested, kept exactly as it answered - never edited in place.
    suggested_codes: Mapped[list[str]] = mapped_column(JSON_DOC, default=list)
    confidence: Mapped[float | None] = mapped_column()
    reason: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(100))
    # The question's own text at the moment it was classified, so a reviewer can tell
    # whether the question was edited since - the suggestion may now be stale.
    question_text: Mapped[str] = mapped_column(Text)

    status: Mapped[SuggestionStatus] = mapped_column(
        text_enum(SuggestionStatus), default=SuggestionStatus.PENDING
    )
    # What was actually applied on approval. Usually suggested_codes, but a reviewer
    # may accept only some of them - kept separate so "what the AI said" is never
    # silently rewritten into "what was approved".
    approved_codes: Mapped[list[str] | None] = mapped_column(JSON_DOC)
    decided_by: Mapped[str | None] = mapped_column(String(64))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    question: Mapped[Question] = relationship()
