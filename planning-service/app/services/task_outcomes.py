"""Task outcomes, schedule replanning, and weekly prediction refreshes."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Conflict, NotFound
from app.models import (
    LearnerTopicState,
    ReplanLog,
    StudyPlan,
    StudyTask,
    Topic,
    TopicEvidence,
)
from app.schemas.tasks import (
    ScheduledTaskResponse,
    ScheduleResponse,
    TaskStatusResponse,
    TaskStatusUpdate,
    WeeklyReplanResponse,
)
from app.services.mastery import recompute_for
from app.services.predictions import predict_student
from app.services.priority import compute_priority
from app.services.roadmap import (
    apply_overload_rule,
    build_and_store_roadmap,
    rescheduling_horizon_days,
    start_window,
)
from app.services.scheduling import generate_plan_schedule


def update_task_status(
    session: Session,
    student_id: str,
    task_id: UUID,
    data: TaskStatusUpdate,
) -> TaskStatusResponse:
    task = session.get(StudyTask, task_id)
    if task is None or task.student_id != student_id:
        raise NotFound("Study task not found.")
    if task.status != "planned":
        raise Conflict("Only planned study tasks can be updated.")
    if data.status == "partial" and not data.actual_duration_min:
        raise Conflict("Partial tasks require actual_duration_min greater than zero.")
    if data.actual_duration_min is not None and data.actual_duration_min > task.duration_min:
        raise Conflict("actual_duration_min cannot exceed the planned duration.")

    task.status = data.status
    task.actual_duration_min = (
        task.duration_min
        if data.status == "completed" and data.actual_duration_min is None
        else data.actual_duration_min
    )
    task.score_before = data.score_before
    task.score_after = data.score_after
    score_change = (
        data.score_after - data.score_before
        if data.score_before is not None and data.score_after is not None
        else None
    )
    remaining_minutes = (
        task.duration_min
        if data.status == "missed"
        else max(task.duration_min - (task.actual_duration_min or 0), 0)
    )
    schedule: ScheduleResponse | None = None
    if remaining_minutes:
        priority = _topic_priority(session, task.plan_id, task.topic_id)
        # Daily level: reschedule into the next free slot of the committed window.
        schedule = generate_plan_schedule(
            session,
            student_id,
            task.plan_id,
            horizon_days=rescheduling_horizon_days(
                session.get(StudyPlan, task.plan_id),
                datetime.now(UTC).date(),
            ),
            duration_overrides={task.topic_id: remaining_minutes},
            priority_overrides={task.topic_id: min(priority + 0.25, 1.0)},
            replanned_from={task.topic_id: task.id},
        )
        session.add(
            ReplanLog(
                student_id=student_id,
                plan_id=task.plan_id,
                task_id=task.id,
                reason=f"{data.status.title()} task rescheduled with {remaining_minutes} minutes remaining.",
                changes=[
                    {
                        "topic_id": task.topic_id,
                        "status": data.status,
                        "remaining_minutes": remaining_minutes,
                        "schedule_created": len(schedule.tasks),
                        "infeasible": schedule.infeasible,
                    }
                ],
            )
        )
    session.commit()
    return TaskStatusResponse(
        task=_task_response(task, _topic_priority(session, task.plan_id, task.topic_id)),
        score_change=score_change,
        planned_minutes=task.duration_min,
        actual_minutes=task.actual_duration_min or 0,
        replanned=bool(remaining_minutes),
        schedule=schedule,
    )


def weekly_replan(
    session: Session,
    student_id: str,
    plan_id: UUID,
    *,
    now: datetime | None = None,
) -> WeeklyReplanResponse:
    plan = session.get(StudyPlan, plan_id)
    if plan is None or plan.student_id != student_id:
        raise NotFound("Study plan not found.")

    analyzed_until = (now or datetime.now(UTC)).astimezone(UTC)
    analyzed_from = analyzed_until - timedelta(days=7)
    tasks, planned_minutes, completed_minutes, adherence = measure_adherence(
        session,
        student_id,
        plan_id,
        since=analyzed_from,
        until=analyzed_until,
    )
    changes = [
        task.score_after - task.score_before
        for task in tasks
        if task.score_before is not None and task.score_after is not None
    ]
    average_score_change = sum(changes) / len(changes) if changes else None

    new_evidence_topic_ids = set(
        session.scalars(
            select(TopicEvidence.topic_id).where(
                TopicEvidence.student_id == student_id,
                TopicEvidence.observed_at >= analyzed_from,
                TopicEvidence.observed_at < analyzed_until,
            )
        ).all()
    )
    recompute_for(session, student_id, sorted(new_evidence_topic_ids), as_of=analyzed_until)
    session.flush()

    states = session.scalars(
        select(LearnerTopicState).where(LearnerTopicState.student_id == student_id)
    ).all()
    refresh_predicted_priorities(session, plan, states, analyzed_until)
    session.flush()
    # Weekly level: compress the plan when adherence falls below the floor.
    overload = apply_overload_rule(session, student_id, plan, adherence, now=analyzed_until)
    predictions = predict_student(
        session,
        student_id,
        student_id,
        as_of=analyzed_until,
        commit=False,
    )
    schedule = generate_plan_schedule(
        session,
        student_id,
        plan_id,
        horizon_days=7,
        now=analyzed_until,
    )
    start_window(plan, today=analyzed_until.date(), window_days=7, now=analyzed_until)
    build_and_store_roadmap(session, student_id, plan, now=analyzed_until)
    session.add(
        ReplanLog(
            student_id=student_id,
            plan_id=plan_id,
            reason="Weekly progress review and next-week schedule refresh.",
            changes=[
                {
                    "analyzed_from": analyzed_from.isoformat(),
                    "analyzed_until": analyzed_until.isoformat(),
                    "adherence": adherence,
                    "average_score_change": average_score_change,
                    "predictions_created": len(predictions.topics) + 1,
                    "next_week_tasks": len(schedule.tasks),
                    "infeasible": schedule.infeasible,
                    "compressed": overload.compressed,
                    "deferred_topics": overload.dropped_topics,
                }
            ],
        )
    )
    session.commit()
    return WeeklyReplanResponse(
        plan_id=plan_id,
        analyzed_from=analyzed_from,
        analyzed_until=analyzed_until,
        planned_minutes=planned_minutes,
        completed_minutes=completed_minutes,
        adherence=adherence,
        average_score_change=average_score_change,
        predictions_created=len(predictions.topics) + 1,
        schedule=schedule,
        compressed=overload.compressed,
        deferred_topics=overload.dropped_topics,
        restored_topics=overload.restored_topics,
        explanation=overload.explanation,
    )


def measure_adherence(
    session: Session,
    student_id: str,
    plan_id: UUID,
    *,
    since: datetime,
    until: datetime,
) -> tuple[list[StudyTask], int, int, float | None]:
    """Return tasks, planned minutes, completed minutes and adherence in a period."""
    tasks = list(
        session.scalars(
            select(StudyTask).where(
                StudyTask.plan_id == plan_id,
                StudyTask.student_id == student_id,
                StudyTask.start_at >= since,
                StudyTask.start_at < until,
            )
        ).all()
    )
    planned_minutes = sum(task.duration_min for task in tasks)
    completed_minutes = sum(
        task.actual_duration_min
        if task.actual_duration_min is not None
        else task.duration_min
        if task.status == "completed"
        else 0
        for task in tasks
    )
    adherence = completed_minutes / planned_minutes if planned_minutes else None
    return tasks, planned_minutes, completed_minutes, adherence


def refresh_predicted_priorities(
    session: Session,
    plan: StudyPlan,
    states: list[LearnerTopicState],
    now: datetime,
) -> None:
    if plan.mode != "predicted":
        return
    state_by_topic = {state.topic_id: state for state in states}
    priorities = plan.constraints.get("priorities", [])
    days_until_exam = (plan.exam_date - now.date()).days
    for item in priorities:
        state = state_by_topic.get(item["topic_id"])
        if state is None:
            continue
        result = compute_priority(
            weakness=state.weak_score,
            exam_importance=(
                float(topic.exam_weight or 0)
                if (topic := session.get(Topic, state.topic_id)) is not None
                else 0
            ),
            days_until_exam=days_until_exam,
            days_since_revision=(
                max((now - state.last_revised).total_seconds() / 86400, 0) if state.last_revised else None
            ),
            improvement_potential=1 - state.mastery,
            prerequisite_boost=0,
        )
        item["priority"] = result.score
        item["mastery"] = state.mastery
        item["reason"] = result.reason
    plan.constraints = {**plan.constraints, "priorities": priorities}


def _topic_priority(session: Session, plan_id: UUID, topic_id: str) -> float:
    plan = session.get(StudyPlan, plan_id)
    if plan is None:
        raise NotFound("Study plan not found.")
    return next(
        (
            float(item["priority"])
            for item in plan.constraints.get("priorities", [])
            if item["topic_id"] == topic_id
        ),
        0.0,
    )


def _task_response(task: StudyTask, priority: float) -> ScheduledTaskResponse:
    return ScheduledTaskResponse(
        id=task.id,
        topic_id=task.topic_id,
        activity=task.activity,
        start_at=task.start_at,
        duration_min=task.duration_min,
        status=task.status,
        reason=task.reason,
        reason_details=getattr(task, "reason_details", None),
        steps=getattr(task, "steps", None) or [],
        priority=priority,
        replanned_from=task.replanned_from,
    )
