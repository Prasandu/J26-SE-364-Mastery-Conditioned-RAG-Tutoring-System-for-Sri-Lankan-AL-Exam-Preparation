"""Shapes for batch topic classification. Admin only."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import SuggestionStatus


class ClassifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # None = every leaf question with no topic at all, up to the service's own limit.
    question_ids: list[int] | None = None


class TopicSuggestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_id: int
    suggested_codes: list[str]
    confidence: float | None
    reason: str | None
    model: str
    question_text: str
    status: SuggestionStatus
    approved_codes: list[str] | None
    decided_by: str | None
    decided_at: datetime | None
    created_at: datetime


class DecideSuggestionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decided_by: str = Field(min_length=1, max_length=64)
    # Approve only: a subset of suggested_codes to keep. None = accept all of them.
    codes: list[str] | None = None
