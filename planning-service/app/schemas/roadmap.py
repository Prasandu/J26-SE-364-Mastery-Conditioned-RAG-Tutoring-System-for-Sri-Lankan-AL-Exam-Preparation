from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.tasks import ScheduleResponse


class RoadmapTopic(BaseModel):
    topic_id: str
    topic_name: str
    hours: float
    focus: str
    projected_mastery: float


class RoadmapWeekResponse(BaseModel):
    week_start: date
    week_end: date
    label: Literal["forecast", "committed"]
    phase: Literal["learning", "final_revision"]
    topics: list[RoadmapTopic]
    total_hours: float
    weeks_to_exam: int
    compressed: bool
    compression_note: str | None = None


class DeferredTopic(BaseModel):
    topic_id: str
    topic_name: str


class TargetOption(BaseModel):
    grade: str
    hours_per_day: float
    label: str


class TargetChoice(BaseModel):
    target_grade: str
    keep_target: TargetOption
    adjust_goal: TargetOption


class RoadmapResponse(BaseModel):
    plan_id: UUID
    exam_date: date
    days_to_exam: int
    window_days: int
    window_start: date | None
    window_end: date | None
    next_checkpoint: date | None
    final_week_start: date
    final_week: bool
    checkpoint_due: bool
    checkpoint_reason: Literal["window_end", "new_evidence"] | None = None
    deferred_topics: list[DeferredTopic]
    compression_note: str | None = None
    target_choice: TargetChoice | None = None
    weeks: list[RoadmapWeekResponse]


class CheckpointRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    force: bool = False


class TargetChoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    choice: Literal["keep_target", "adjust_goal"]


class RangeChange(BaseModel):
    direction: Literal["up", "down", "same"]
    previous: float | None
    current: float
    message: str


class RollingUpdateResponse(BaseModel):
    plan_id: UUID
    ran: bool
    trigger: Literal["window_end", "new_evidence", "manual", "target_choice"] | None = None
    adherence: float | None = None
    compressed: bool = False
    deferred_topics: list[str] = []
    restored_topics: list[str] = []
    explanation: str | None = None
    target_grade: str
    range_change: RangeChange | None = None
    roadmap: RoadmapResponse
    schedule: ScheduleResponse | None = None
