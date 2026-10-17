from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TopicId = Annotated[str, Field(min_length=1, max_length=80)]
EventId = Annotated[str, Field(min_length=1, max_length=120)]
StudentId = Annotated[str, Field(min_length=1, max_length=120)]


class EvidenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: TopicId
    question_id: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    score: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    max_score: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    difficulty: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)] = 0.5
    confidence: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)] | None = None

    @model_validator(mode="after")
    def score_does_not_exceed_maximum(self) -> "EvidenceItem":
        if self.score > self.max_score:
            raise ValueError("score must not exceed max_score")
        return self


class AssessmentEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: EventId
    student_id: StudentId
    paper_id: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    occurred_at: datetime
    evidence: Annotated[list[EvidenceItem], Field(min_length=1, max_length=200)]

    @field_validator("occurred_at")
    @classmethod
    def timestamp_must_be_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("occurred_at must include a timezone")
        return value


class ModuleCompletionEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: EventId
    student_id: StudentId
    topic_id: TopicId
    completed_at: datetime
    score: Annotated[float, Field(ge=0, allow_inf_nan=False)] = 1
    max_score: Annotated[float, Field(gt=0, allow_inf_nan=False)] = 1
    difficulty: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)] = 0.5
    confidence: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)] | None = None

    @field_validator("completed_at")
    @classmethod
    def timestamp_must_be_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("completed_at must include a timezone")
        return value

    @model_validator(mode="after")
    def score_does_not_exceed_maximum(self) -> "ModuleCompletionEvent":
        if self.score > self.max_score:
            raise ValueError("score must not exceed max_score")
        return self


class IngestionResult(BaseModel):
    event_id: str
    accepted: bool
    duplicate: bool
    evidence_count: int
    unknown_question_ids: list[str] = Field(default_factory=list)
