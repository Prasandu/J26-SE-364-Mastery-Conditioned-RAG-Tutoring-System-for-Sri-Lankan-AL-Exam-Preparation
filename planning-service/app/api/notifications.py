from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.notifications import (
    NotificationListResponse,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
)
from app.security import get_student_id
from app.services.notifications import (
    get_preferences,
    list_notifications,
    mark_read,
    update_preferences,
)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])
DbSession = Annotated[Session, Depends(get_db)]
StudentId = Annotated[str, Depends(get_student_id)]


@router.get("", response_model=NotificationListResponse)
def get_student_notifications(session: DbSession, student_id: StudentId) -> NotificationListResponse:
    """Runs the reminder/missed sweep, then returns up to three unread alerts."""
    return list_notifications(session, student_id)


@router.get("/preferences", response_model=NotificationPreferencesResponse)
def get_notification_preferences(
    session: DbSession,
    student_id: StudentId,
) -> NotificationPreferencesResponse:
    return get_preferences(session, student_id)


@router.put("/preferences", response_model=NotificationPreferencesResponse)
def put_notification_preferences(
    data: NotificationPreferencesUpdate,
    session: DbSession,
    student_id: StudentId,
) -> NotificationPreferencesResponse:
    return update_preferences(session, student_id, data)


@router.post("/{notification_id}/read", response_model=NotificationResponse)
def read_notification(
    notification_id: UUID,
    session: DbSession,
    student_id: StudentId,
) -> NotificationResponse:
    return mark_read(session, student_id, notification_id)
