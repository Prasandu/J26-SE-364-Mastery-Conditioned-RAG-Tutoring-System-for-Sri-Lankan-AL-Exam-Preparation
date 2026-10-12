from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.plans import PlanInput, PlanListResponse, PlanResponse
from app.schemas.tasks import GenerateScheduleRequest, ScheduleResponse, WeeklyReplanResponse
from app.security import get_student_id
from app.services.plans import create_plan, get_plan, list_plans, update_plan
from app.services.scheduling import generate_and_commit_schedule
from app.services.task_outcomes import weekly_replan

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])
DbSession = Annotated[Session, Depends(get_db)]
StudentId = Annotated[str, Depends(get_student_id)]


@router.post("", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
def create_student_plan(data: PlanInput, session: DbSession, student_id: StudentId) -> PlanResponse:
    return PlanResponse.model_validate(create_plan(session, student_id, data))


@router.get("", response_model=PlanListResponse)
def get_student_plans(session: DbSession, student_id: StudentId) -> PlanListResponse:
    return PlanListResponse(plans=list_plans(session, student_id))


@router.get("/{plan_id}", response_model=PlanResponse)
def get_student_plan(
    plan_id: UUID,
    session: DbSession,
    student_id: StudentId,
) -> PlanResponse:
    return PlanResponse.model_validate(get_plan(session, student_id, plan_id))


@router.put("/{plan_id}", response_model=PlanResponse)
def replace_student_plan(
    plan_id: UUID,
    data: PlanInput,
    session: DbSession,
    student_id: StudentId,
) -> PlanResponse:
    return PlanResponse.model_validate(update_plan(session, student_id, plan_id, data))


@router.post("/{plan_id}/generate", response_model=ScheduleResponse)
def generate_student_schedule(
    plan_id: UUID,
    data: GenerateScheduleRequest,
    session: DbSession,
    student_id: StudentId,
) -> ScheduleResponse:
    return generate_and_commit_schedule(
        session,
        student_id,
        plan_id,
        horizon_days=data.horizon_days,
    )


@router.post("/{plan_id}/weekly-replan", response_model=WeeklyReplanResponse)
def refresh_weekly_plan(
    plan_id: UUID,
    session: DbSession,
    student_id: StudentId,
) -> WeeklyReplanResponse:
    return weekly_replan(session, student_id, plan_id)
