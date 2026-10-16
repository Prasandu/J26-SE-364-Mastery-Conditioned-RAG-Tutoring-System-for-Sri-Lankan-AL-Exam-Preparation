from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TopicId = Annotated[str, Field(min_length=1, max_length=80)]


class Component2Result(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: TopicId
    marks_awarded: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    marks_total: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    difficulty: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
    error_type: Literal[
        "none",
        "conceptual",
        "calculation",
        "unit_conversion",
        "careless",
        "time_management",
    ]
    time_spent_sec: Annotated[int, Field(ge=0)]

    @model_validator(mode="after")
    def marks_within_total(self) -> "Component2Result":
        if self.marks_awarded > self.marks_total:
            raise ValueError("marks_awarded cannot exceed marks_total")
        return self


class Component2AssessmentEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    student_id: str
    paper_id: str
    source: Annotated[str, Field(min_length=1)]
    submitted_at: datetime
    results: Annotated[list[Component2Result], Field(min_length=1)]

    @field_validator("submitted_at")
    @classmethod
    def submitted_at_is_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("submitted_at must include a timezone")
        return value


class Component1CompletionEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: TopicId
    status: Literal["completed"]
    completed_at: datetime
    practical_done: bool
    post_lab_score: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)] | None

    @field_validator("completed_at")
    @classmethod
    def completed_at_is_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("completed_at must include a timezone")
        return value

    @model_validator(mode="after")
    def lab_score_requires_practical(self) -> "Component1CompletionEvent":
        if not self.practical_done and self.post_lab_score is not None:
            raise ValueError("post_lab_score requires practical_done")
        return self
