from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dashboard import DashboardMasteryHistoryPoint, WeakTopic
from app.schemas.plans import AvailabilityWindow, PlanInput, PlanResponse
from app.schemas.predictions import TopicPrediction
from app.schemas.tasks import (
    ScheduledTaskResponse,
    ScheduleResponse,
    TaskStatusResponse,
    WeeklyReplanResponse,
)


class DemoTopicMastery(BaseModel):
    topic_id: str
    topic_name: str | None
    parent_topic_id: str | None
    mastery: float
    trend: float
    weak_score: float


class DemoStudentSummary(BaseModel):
    student_id: str
    mastery_by_topic: list[DemoTopicMastery]
    mastery_history: list[DashboardMasteryHistoryPoint]
    top_weak_topics: list[WeakTopic]
    predicted_overall_score: float
    predicted_overall_grade: str
    prediction_source: str
    model_version: str
    per_topic_predictions: list[TopicPrediction]
    target_grade: str
    gap_to_target: float
    exam_countdown_days: int


class DemoPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exam_date: date
    target_grade: Annotated[str, Field(min_length=1, max_length=20)]
    weekly_availability: Annotated[list[AvailabilityWindow], Field(min_length=1, max_length=28)]
    max_session_minutes: Annotated[int, Field(ge=15, le=180)] = 60
    max_daily_minutes: Annotated[int, Field(ge=15, le=600)] = 180
    timezone: Annotated[str, Field(min_length=1, max_length=80)] = "Asia/Colombo"
    horizon_days: Annotated[int, Field(ge=1, le=56)] = 14

    @model_validator(mode="after")
    def validate_predicted_plan(self) -> "DemoPlanRequest":
        PlanInput(
            mode="predicted",
            exam_date=self.exam_date,
            target_grade=self.target_grade,
            availability_windows=self.weekly_availability,
            max_session_minutes=self.max_session_minutes,
            max_daily_minutes=self.max_daily_minutes,
            timezone=self.timezone,
        )
        return self


class DemoPlanResponse(BaseModel):
    plan: PlanResponse
    schedule: ScheduleResponse


class DemoTaskReplanResult(BaseModel):
    replanned: bool
    moved_tasks: list[ScheduledTaskResponse]
    reason: str


class DemoTaskStatusResponse(BaseModel):
    outcome: TaskStatusResponse
    replan_result: DemoTaskReplanResult


class DemoWeeklyReplanResponse(BaseModel):
    result: WeeklyReplanResponse
    moved_tasks: list[ScheduledTaskResponse]
    reason: str
