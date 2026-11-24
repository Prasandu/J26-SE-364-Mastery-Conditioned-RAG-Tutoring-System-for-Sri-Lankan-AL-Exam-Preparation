from datetime import datetime, time
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationAction(BaseModel):
    kind: Literal["open_plan", "reschedule"]
    label: str
    plan_id: UUID | None = None


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: Literal["reminder", "missed", "info"]
    title: str
    message: str
    task_id: UUID | None = None
    action: NotificationAction | None = None
    created_at: datetime
    read_at: datetime | None = None


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    unread_count: int
    quiet_hours_active: bool


class NotificationPreferencesResponse(BaseModel):
    reminder_lead_minutes: int
    quiet_hours_start: time
    quiet_hours_end: time
    enabled: bool


class NotificationPreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reminder_lead_minutes: Annotated[int, Field(ge=0, le=120)] = 10
    quiet_hours_start: time = time(22, 0)
    quiet_hours_end: time = time(6, 0)
    enabled: bool = True
