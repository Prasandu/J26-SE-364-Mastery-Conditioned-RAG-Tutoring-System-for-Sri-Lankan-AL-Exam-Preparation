from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

TaskStatus = Literal["completed", "partial", "missed"]


class GenerateScheduleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # None uses the rolling committed window (14 days, or 7 near the exam).
    horizon_days: Annotated[int, Field(ge=1, le=56)] | None = None


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


class DeclineAlertDetails(BaseModel):
    baseline: float
    recent: float
    drop: float
    message: str


class TaskReason(BaseModel):
    topic: str
    sub_topic: str | None = None
    mastery: float
    has_evidence: bool = True
    reason: str = ""
    trend: float
    decline_alert: DeclineAlertDetails | None = None
    exam_weight: float
    days_to_exam: int
    main_factors: dict[str, float]
    activity_recommendation: str
    final_week: bool = False


class TaskStep(BaseModel):
    kind: Literal["theory", "practice", "review"]
    minutes: Annotated[int, Field(gt=0)]
    question_ids: list[str] = Field(default_factory=list)


class ScheduledTaskResponse(BaseModel):
    id: UUID | None = None
    topic_id: str
    activity: str
    start_at: datetime
    duration_min: int
    status: str = "planned"
    reason: str
    reason_details: TaskReason | None = None
    steps: list[TaskStep] = Field(default_factory=list)
    priority: float = 0
    replanned_from: UUID | None = None
    timer_state: Literal["idle", "running", "paused", "finished"] = "idle"
    timer_started_at: datetime | None = None
    # Seconds of active study measured by the server when this response was built.
    timer_elapsed_sec: int = 0


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
    compressed: bool = False
    deferred_topics: list[str] = Field(default_factory=list)
    restored_topics: list[str] = Field(default_factory=list)
    explanation: str | None = None


class TimerFinishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Required only when the server asks for confirmation of an unusual session.
    confirmed_minutes: Annotated[int, Field(ge=0, le=600)] | None = None


class TimerResponse(BaseModel):
    task: ScheduledTaskResponse
    paused_task: ScheduledTaskResponse | None = None
    message: str | None = None
    measured_minutes: int | None = None
    suggested_actual_minutes: int | None = None
    requires_confirmation: bool = False
    confirmation_reason: str | None = None
