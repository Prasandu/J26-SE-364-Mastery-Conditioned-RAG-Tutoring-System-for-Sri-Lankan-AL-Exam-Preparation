from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.plans import PlanInput, PlanListResponse, PlanResponse
from app.schemas.roadmap import (
    CheckpointRequest,
    RoadmapResponse,
    RollingUpdateResponse,
    TargetChoiceRequest,
)
from app.schemas.tasks import GenerateScheduleRequest, ScheduleResponse, WeeklyReplanResponse
from app.security import StudentIdentity, get_student_identity
from app.services.plans import create_plan, get_plan, list_plans, update_plan
from app.services.rolling import choose_target, roadmap_view, run_checkpoint
from app.services.scheduling import generate_and_commit_schedule, get_plan_schedule
from app.services.task_outcomes import weekly_replan

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])
DbSession = Annotated[Session, Depends(get_db)]
StudentIdentityDep = Annotated[StudentIdentity, Depends(get_student_identity)]


@router.post("", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
def create_student_plan(
    data: PlanInput,
    session: DbSession,
    identity: StudentIdentityDep,
) -> PlanResponse:
    return PlanResponse.model_validate(
        create_plan(
            session,
            identity.student_id,
            data,
            student_name=identity.first_name,
        )
    )


@router.get("", response_model=PlanListResponse)
def get_student_plans(session: DbSession, identity: StudentIdentityDep) -> PlanListResponse:
    return PlanListResponse(
        plans=list_plans(
            session,
            identity.student_id,
            student_name=identity.first_name,
        )
    )


@router.get("/{plan_id}", response_model=PlanResponse)
def get_student_plan(
    plan_id: UUID,
    session: DbSession,
    identity: StudentIdentityDep,
) -> PlanResponse:
    return PlanResponse.model_validate(
        get_plan(
            session,
            identity.student_id,
            plan_id,
            student_name=identity.first_name,
        )
    )


@router.get("/{plan_id}/schedule", response_model=ScheduleResponse)
def get_student_plan_schedule(
    plan_id: UUID,
    session: DbSession,
    identity: StudentIdentityDep,
) -> ScheduleResponse:
    return get_plan_schedule(session, identity.student_id, plan_id)


@router.put("/{plan_id}", response_model=PlanResponse)
def replace_student_plan(
    plan_id: UUID,
    data: PlanInput,
    session: DbSession,
    identity: StudentIdentityDep,
) -> PlanResponse:
    return PlanResponse.model_validate(
        update_plan(
            session,
            identity.student_id,
            plan_id,
            data,
            student_name=identity.first_name,
        )
    )


@router.post("/{plan_id}/generate", response_model=ScheduleResponse)
def generate_student_schedule(
    plan_id: UUID,
    data: GenerateScheduleRequest,
    session: DbSession,
    identity: StudentIdentityDep,
) -> ScheduleResponse:
    return generate_and_commit_schedule(
        session,
        identity.student_id,
        plan_id,
        horizon_days=data.horizon_days,
    )


@router.post("/{plan_id}/weekly-replan", response_model=WeeklyReplanResponse)
def refresh_weekly_plan(
    plan_id: UUID,
    session: DbSession,
    identity: StudentIdentityDep,
) -> WeeklyReplanResponse:
    return weekly_replan(session, identity.student_id, plan_id)


@router.get("/{plan_id}/roadmap", response_model=RoadmapResponse)
def get_student_roadmap(
    plan_id: UUID,
    session: DbSession,
    identity: StudentIdentityDep,
) -> RoadmapResponse:
    return roadmap_view(session, identity.student_id, plan_id)


@router.post("/{plan_id}/checkpoint", response_model=RollingUpdateResponse)
def run_plan_checkpoint(
    plan_id: UUID,
    session: DbSession,
    identity: StudentIdentityDep,
    data: CheckpointRequest | None = None,
) -> RollingUpdateResponse:
    return run_checkpoint(
        session,
        identity.student_id,
        plan_id,
        force=data.force if data is not None else False,
    )


@router.post("/{plan_id}/target-choice", response_model=RollingUpdateResponse)
def choose_plan_target(
    plan_id: UUID,
    data: TargetChoiceRequest,
    session: DbSession,
    identity: StudentIdentityDep,
) -> RollingUpdateResponse:
    return choose_target(session, identity.student_id, plan_id, data.choice)
