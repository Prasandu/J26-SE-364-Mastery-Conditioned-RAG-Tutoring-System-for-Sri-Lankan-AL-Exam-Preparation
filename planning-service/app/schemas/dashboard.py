from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.plans import AchievabilityReportResponse


class DeclineAttemptResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: float
    max_score: float
    attempted_at: datetime
    paper_id: str | None = None
    question_id: str | None = None


class DeclineAlertResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: str
    baseline: float
    recent: float
    drop: float
    attempts: list[DeclineAttemptResponse]
    latest_attempt_at: datetime
    message: str


class DashboardTopicTrend(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: str
    topic_name: str | None = None
    parent_topic_id: str | None = None
    mastery: float = 0.0
    trend: float = 0.0


class DashboardMasteryHistoryPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    week_start: str
    topic_id: str
    topic_name: str | None = None
    mastery: float


class WeakTopic(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: str
    topic_name: str | None = None
    mastery: float = 0.0
    weakness_score: float = 0.0
    reason: str = ""


class DashboardResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    minimum_assessed_topics: int
    exam_countdown_days: int
    has_exam_plan: bool
    adherence: float
    adherence_pct: float
    has_adherence_data: bool
    mastery_trend: list[DashboardTopicTrend]
    mastery_history: list[DashboardMasteryHistoryPoint]
    has_mastery_data: bool
    weak_topics: list[WeakTopic]
    alerts: list[DeclineAlertResponse] = Field(default_factory=list)
    predicted_grade: str
    target_grade: str
    gap_to_target: float
    grade_gap_to_target: float
    predicted_score: float
    readiness_score: float
    current_prediction: float
    has_prediction: bool
    achievability: AchievabilityReportResponse | None = None


class WhatIfInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    extra_hours_per_week: Annotated[float | None, Field(ge=0)] = None
    mastery_gain: Annotated[float | None, Field(ge=0, le=1)] = None
    hours_per_week: Annotated[float | None, Field(ge=0)] = None

    @model_validator(mode="after")
    def validate_input(self) -> WhatIfInput:
        extra = self.extra_hours_per_week
        mastery = self.mastery_gain
        hours = self.hours_per_week
        if extra is None and mastery is None and hours is None:
            raise ValueError("provide at least one what-if input")
        if hours is not None and extra is None:
            object.__setattr__(self, "extra_hours_per_week", hours)
        return self


class WhatIfResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_prediction: float
    current_grade: str
    projected_prediction: float
    projected_grade: str
    gain: float
    change: float
    estimate: bool = True
    target_grade: str | None = None
    gap_to_target: float | None = None
