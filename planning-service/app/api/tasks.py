from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.tasks import TaskStatusResponse, TaskStatusUpdate
from app.security import get_student_id
from app.services.task_outcomes import update_task_status

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
