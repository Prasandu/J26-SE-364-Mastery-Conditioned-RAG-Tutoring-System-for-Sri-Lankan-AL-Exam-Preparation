from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

TaskStatus = Literal["completed", "partial", "missed"]


class GenerateScheduleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    horizon_days: Annotated[int, Field(ge=1, le=56)] = 14


class TaskStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: TaskStatus
    actual_duration_min: Annotated[int, Field(ge=0, le=600)] | None = None
    score_before: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)] | None = None
    score_after: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)] | None = None

    @model_validator(mode="after")
    def validate_outcome_fields(self) -> "TaskStatusUpdate":
        if (self.score_before is None) != (self.score_after is None):
            raise ValueError("score_before and score_after must be provided together")
        if self.status == "partial" and not self.actual_duration_min:
            raise ValueError("partial tasks require actual_duration_min greater than zero")
        if self.status == "completed" and self.actual_duration_min == 0:
            raise ValueError("completed tasks require actual_duration_min greater than zero")
        if self.status == "missed" and self.actual_duration_min not in (None, 0):
            raise ValueError("missed tasks cannot have actual study minutes")
        return self


class ScheduledTaskResponse(BaseModel):
    id: UUID | None = None
    topic_id: str
    activity: str
    start_at: datetime
    duration_min: int
    status: str = "planned"
    reason: str
    priority: float = 0
    replanned_from: UUID | None = None


class ScheduleResponse(BaseModel):
    tasks: list[ScheduledTaskResponse]
    infeasible: bool
    shortfall_minutes: int
    unscheduled_minutes: dict[str, int]


class TaskStatusResponse(BaseModel):
    task: ScheduledTaskResponse
    score_change: float | None
    planned_minutes: int
    actual_minutes: int
    replanned: bool
    schedule: ScheduleResponse | None = None


class WeeklyReplanResponse(BaseModel):
    plan_id: UUID
    analyzed_from: datetime
    analyzed_until: datetime
    planned_minutes: int
    completed_minutes: int
    adherence: float | None
    average_score_change: float | None
    predictions_created: int
    schedule: ScheduleResponse
