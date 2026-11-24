from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.tasks import (
    TaskStatusResponse,
    TaskStatusUpdate,
    TimerFinishRequest,
    TimerResponse,
    UndoOutcomeResponse,
)
from app.security import get_student_id
from app.services.task_outcomes import undo_task_outcome, update_task_status
from app.services.timer import finish_timer, pause_timer, resume_timer, start_timer

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])
DbSession = Annotated[Session, Depends(get_db)]
StudentId = Annotated[str, Depends(get_student_id)]


@router.post("/{task_id}/status", response_model=TaskStatusResponse)
def set_task_status(
    task_id: UUID,
    data: TaskStatusUpdate,
    session: DbSession,
    student_id: StudentId,
) -> TaskStatusResponse:
    return update_task_status(session, student_id, task_id, data)


@router.post("/{task_id}/timer/start", response_model=TimerResponse)
def start_task_timer(task_id: UUID, session: DbSession, student_id: StudentId) -> TimerResponse:
    return start_timer(session, student_id, task_id)


@router.post("/{task_id}/timer/pause", response_model=TimerResponse)
def pause_task_timer(task_id: UUID, session: DbSession, student_id: StudentId) -> TimerResponse:
    return pause_timer(session, student_id, task_id)


@router.post("/{task_id}/timer/resume", response_model=TimerResponse)
def resume_task_timer(task_id: UUID, session: DbSession, student_id: StudentId) -> TimerResponse:
    return resume_timer(session, student_id, task_id)


@router.post("/{task_id}/timer/finish", response_model=TimerResponse)
def finish_task_timer(
    task_id: UUID,
    session: DbSession,
    student_id: StudentId,
    data: TimerFinishRequest | None = None,
) -> TimerResponse:
    return finish_timer(
        session,
        student_id,
        task_id,
        confirmed_minutes=data.confirmed_minutes if data is not None else None,
    )


@router.post("/{task_id}/undo", response_model=UndoOutcomeResponse)
def undo_task(task_id: UUID, session: DbSession, student_id: StudentId) -> UndoOutcomeResponse:
    """Undo a done/partial/missed outcome recorded in the last 24 hours."""
    return undo_task_outcome(session, student_id, task_id)
