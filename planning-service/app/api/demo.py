from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.errors import NotFound
from app.models import LearnerTopicState, StudyTask
from app.schemas.demo import (
    DemoPlanRequest,
    DemoPlanResponse,
    DemoStudentSummary,
    DemoTaskReplanResult,
    DemoTaskStatusResponse,
    DemoTopicMastery,
    DemoWeeklyReplanResponse,
)
from app.schemas.plans import PlanInput, PlanResponse
from app.schemas.tasks import TaskStatusUpdate
from app.security import require_api_key, require_demo_mode
from app.services.dashboard import get_dashboard
from app.services.demo import delete_student_data
from app.services.plans import create_plan, list_plans
from app.services.predictions import predict_student
from app.services.scheduling import generate_and_commit_schedule
from app.services.task_outcomes import update_task_status, weekly_replan

router = APIRouter(
    prefix="/api/v1/demo",
    tags=["demo"],
    dependencies=[Depends(require_api_key), Depends(require_demo_mode)],
)
DbSession = Annotated[Session, Depends(get_db)]


def _require_demo_student(student_id: str) -> None:
    if student_id not in settings.allowed_demo_student_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student is not enabled for demo access.",
        )


@router.get("/students/{student_id}/summary", response_model=DemoStudentSummary)
def student_summary(student_id: str, session: DbSession) -> DemoStudentSummary:
    _require_demo_student(student_id)
    prediction = predict_student(session, student_id, student_id)
    dashboard = get_dashboard(
        session,
        student_id,
        prediction_score=prediction.overall_predicted_score,
    )
    states = {
        state.topic_id: state
        for state in session.scalars(
            select(LearnerTopicState).where(LearnerTopicState.student_id == student_id)
        ).all()
    }
    mastery_by_topic = [
        DemoTopicMastery(
            topic_id=topic.topic_id,
            topic_name=topic.topic_name,
            parent_topic_id=topic.parent_topic_id,
            mastery=topic.mastery,
            trend=topic.trend,
            weak_score=float(states[topic.topic_id].weak_score) if topic.topic_id in states else 0.0,
        )
        for topic in dashboard.mastery_trend
    ]
    return DemoStudentSummary(
        student_id=student_id,
        mastery_by_topic=mastery_by_topic,
        mastery_history=dashboard.mastery_history,
        top_weak_topics=dashboard.weak_topics[:5],
        predicted_overall_score=prediction.overall_predicted_score,
        predicted_overall_grade=prediction.overall_predicted_grade,
        prediction_source=prediction.prediction_source,
        model_version=prediction.model_version,
        per_topic_predictions=prediction.topics,
        target_grade=dashboard.target_grade,
        gap_to_target=dashboard.gap_to_target,
        exam_countdown_days=dashboard.exam_countdown_days,
    )


@router.post(
    "/students/{student_id}/plan",
    response_model=DemoPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_demo_plan(student_id: str, data: DemoPlanRequest, session: DbSession) -> DemoPlanResponse:
    _require_demo_student(student_id)
    plan_data = PlanInput(
        mode="predicted",
        exam_date=data.exam_date,
        target_grade=data.target_grade,
        availability_windows=data.weekly_availability,
        max_session_minutes=data.max_session_minutes,
        max_daily_minutes=data.max_daily_minutes,
        timezone=data.timezone,
    )
    plan = create_plan(session, student_id, plan_data)
    schedule = generate_and_commit_schedule(
        session,
        student_id,
        UUID(plan["id"]),
        horizon_days=data.horizon_days,
    )
    return DemoPlanResponse(plan=PlanResponse.model_validate(plan), schedule=schedule)


@router.post("/tasks/{task_id}/status", response_model=DemoTaskStatusResponse)
def set_demo_task_status(
    task_id: UUID,
    data: TaskStatusUpdate,
    session: DbSession,
) -> DemoTaskStatusResponse:
    task = session.get(StudyTask, task_id)
    if task is None:
        raise NotFound("Study task not found.")
    _require_demo_student(task.student_id)
    outcome = update_task_status(session, task.student_id, task_id, data)
    moved_tasks = outcome.schedule.tasks if outcome.schedule is not None else []
    reason = (
        f"{data.status.title()} task left "
        f"{outcome.planned_minutes - outcome.actual_minutes} minutes to reschedule."
        if outcome.replanned
        else "No remaining study time required rescheduling."
    )
    return DemoTaskStatusResponse(
        outcome=outcome,
        replan_result=DemoTaskReplanResult(
            replanned=outcome.replanned,
            moved_tasks=moved_tasks,
            reason=reason,
        ),
    )


@router.post("/students/{student_id}/replan", response_model=DemoWeeklyReplanResponse)
def replan_demo_student(student_id: str, session: DbSession) -> DemoWeeklyReplanResponse:
    _require_demo_student(student_id)
    plans = list_plans(session, student_id)
    if not plans:
        raise NotFound("Study plan not found.")
    result = weekly_replan(session, student_id, UUID(plans[0]["id"]))
    return DemoWeeklyReplanResponse(
        result=result,
        moved_tasks=result.schedule.tasks,
        reason=(
            "Weekly progress review refreshed predicted priorities and generated the next week's schedule."
        ),
    )


@router.delete("/students/{student_id}")
def delete_demo_student(student_id: str, session: DbSession) -> dict[str, object]:
    _require_demo_student(student_id)
    deleted = delete_student_data(session, student_id)
    return {"student_id": student_id, "deleted": deleted}
