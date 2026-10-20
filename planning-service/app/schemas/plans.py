from datetime import UTC, date, datetime, time
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, model_validator

TopicId = Annotated[str, Field(min_length=1, max_length=80)]


class AvailabilityWindow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weekday: Annotated[int, Field(ge=0, le=6)]
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def window_has_positive_duration(self) -> "AvailabilityWindow":
        if self.start_time >= self.end_time:
            raise ValueError("availability window start_time must precede end_time")
        return self


class FixedCommitment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: Annotated[str, Field(min_length=1, max_length=120)]
    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def commitment_is_timezone_aware_and_ordered(self) -> "FixedCommitment":
        if (
            self.start_at.tzinfo is None
            or self.start_at.utcoffset() is None
            or self.end_at.tzinfo is None
            or self.end_at.utcoffset() is None
        ):
            raise ValueError("fixed commitment timestamps must include a timezone")
        if self.start_at >= self.end_at:
            raise ValueError("fixed commitment start_at must precede end_at")
        return self


class TopicPriorityInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: TopicId
    priority: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)] = 0.5


class PlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["manual", "predicted"]
    exam_date: date
    target_grade: Annotated[str, Field(min_length=1, max_length=20)]
    topics: Annotated[list[TopicId], Field(max_length=100)] = Field(default_factory=list)
    availability_windows: Annotated[list[AvailabilityWindow], Field(min_length=1, max_length=28)]
    max_session_minutes: Annotated[int, Field(ge=15, le=180)]
    max_daily_minutes: Annotated[int, Field(ge=15, le=600)] = 180
    timezone: Annotated[str, Field(min_length=1, max_length=80)] = "Asia/Colombo"
    preferred_times: Annotated[list[time], Field(max_length=10)] = Field(default_factory=list)
    fixed_commitments: Annotated[list[FixedCommitment], Field(max_length=100)] = Field(default_factory=list)
    priorities: Annotated[list[TopicPriorityInput], Field(max_length=100)] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_plan(self) -> "PlanInput":
        try:
            ZoneInfo(self.timezone)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"unknown timezone: {self.timezone}") from exc
        if self.exam_date <= datetime.now(UTC).date():
            raise ValueError("exam_date must be in the future")
        if len(set(self.topics)) != len(self.topics):
            raise ValueError("topics must not contain duplicates")
        if self.max_daily_minutes < self.max_session_minutes:
            raise ValueError("max_daily_minutes cannot be shorter than max_session_minutes")
        priority_topic_ids = [item.topic_id for item in self.priorities]
        if len(set(priority_topic_ids)) != len(priority_topic_ids):
            raise ValueError("priorities must not contain duplicate topic IDs")
        if self.mode == "manual":
            if not self.topics:
                raise ValueError("manual mode requires at least one selected topic")
            if any(topic_id not in self.topics for topic_id in priority_topic_ids):
                raise ValueError("manual priorities must only refer to selected topics")

        by_weekday: dict[int, list[AvailabilityWindow]] = {}
        for window in self.availability_windows:
            by_weekday.setdefault(window.weekday, []).append(window)
        for weekday, windows in by_weekday.items():
            ordered = sorted(windows, key=lambda item: item.start_time)
            for previous, current in zip(ordered, ordered[1:], strict=False):
                if current.start_time < previous.end_time:
                    raise ValueError(f"availability windows overlap on weekday {weekday}")

        commitments = sorted(self.fixed_commitments, key=lambda item: item.start_at)
        for previous, current in zip(commitments, commitments[1:], strict=False):
            if current.start_at < previous.end_at:
                raise ValueError("fixed commitments must not overlap")
        return self


class AchievabilityRange(BaseModel):
    low: Annotated[float, Field(ge=0, le=1)]
    expected: Annotated[float, Field(ge=0, le=1)]
    high: Annotated[float, Field(ge=0, le=1)]


class AchievabilityReportResponse(BaseModel):
    status: Literal["on_track", "stretch", "out_of_reach"]
    best_range_grade: str
    hours_needed: Annotated[float, Field(ge=0)]
    hours_available: Annotated[float, Field(ge=0)]
    hours_gap: float
    projected_range: AchievabilityRange
    message: str


class CoachingFocusTopicResponse(BaseModel):
    topic: str
    reason: str


class CoachingMessageResponse(BaseModel):
    greeting: str
    headline: str
    body: str
    focus_topics: list[CoachingFocusTopicResponse]
    daily_suggestion: str
    tone: Literal["on_track", "stretch", "ambitious"]


class PlanResponse(BaseModel):
    id: str
    mode: Literal["manual", "predicted"]
    exam_date: date
    target_grade: str
    constraints: dict
    student_name: str = "there"
    coaching_message: CoachingMessageResponse
    achievability: AchievabilityReportResponse | None = None


class PlanListResponse(BaseModel):
    plans: list[PlanResponse]
