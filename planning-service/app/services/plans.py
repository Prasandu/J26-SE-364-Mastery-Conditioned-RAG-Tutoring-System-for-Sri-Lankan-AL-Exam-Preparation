from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Conflict, ConstraintViolation, NotFound
from app.models import AvailabilitySlot, LearnerTopicState, ReplanLog, StudyPlan, Topic
from app.schemas.plans import PlanInput
from app.services.priority import compute_priority


def create_plan(session: Session, student_id: str, data: PlanInput) -> dict[str, Any]:
    _validate_topic_ids(session, data.topics)
    constraints = _build_constraints(session, student_id, data)
    plan = StudyPlan(
        student_id=student_id,
        mode=data.mode,
        exam_date=data.exam_date,
        target_grade=data.target_grade,
        constraints=constraints,
    )
    session.add(plan)
    session.flush()
    _save_availability(session, plan.id, data)
    session.add(
        ReplanLog(
            student_id=student_id,
            plan_id=plan.id,
            reason="Initial plan constraints configured.",
            changes=[
                {
                    "field": "plan",
                    "old": None,
                    "new": _plan_snapshot(data, constraints),
                }
            ],
        )
    )
    session.commit()
    return _plan_response(plan)


def list_plans(session: Session, student_id: str) -> list[dict[str, Any]]:
    plans = session.scalars(
        select(StudyPlan).where(StudyPlan.student_id == student_id).order_by(StudyPlan.updated_at.desc())
    ).all()
    return [_plan_response(plan) for plan in plans]


def get_plan(session: Session, student_id: str, plan_id: UUID) -> dict[str, Any]:
    return _plan_response(_owned_plan(session, student_id, plan_id))


def update_plan(
    session: Session,
    student_id: str,
    plan_id: UUID,
    data: PlanInput,
) -> dict[str, Any]:
    plan = _owned_plan(session, student_id, plan_id)
    _validate_topic_ids(session, data.topics)
    constraints = _build_constraints(session, student_id, data)
    old_snapshot = {
        "mode": plan.mode,
        "exam_date": plan.exam_date.isoformat(),
        "target_grade": plan.target_grade,
        "constraints": plan.constraints,
    }
    new_snapshot = _plan_snapshot(data, constraints)
    changes = [
        {"field": field, "old": old_snapshot[field], "new": new_snapshot[field]}
        for field in old_snapshot
        if old_snapshot[field] != new_snapshot[field]
    ]

    plan.mode = data.mode
    plan.exam_date = data.exam_date
    plan.target_grade = data.target_grade
    plan.constraints = constraints
    for slot in session.scalars(select(AvailabilitySlot).where(AvailabilitySlot.plan_id == plan.id)).all():
        session.delete(slot)
    _save_availability(session, plan.id, data)

    if changes:
        session.add(
            ReplanLog(
                student_id=student_id,
                plan_id=plan.id,
                reason="Study plan constraints updated.",
                changes=changes,
            )
        )
    session.commit()
    return _plan_response(plan)


def _validate_topic_ids(session: Session, topic_ids: list[str]) -> None:
    unknown = [topic_id for topic_id in topic_ids if session.get(Topic, topic_id) is None]
    if unknown:
        raise ConstraintViolation(f"Unknown topic_ids: {', '.join(unknown)}")


def _build_constraints(
    session: Session,
    student_id: str,
    data: PlanInput,
) -> dict[str, Any]:
    selected_priorities = {item.topic_id: item.priority for item in data.priorities}
    if data.mode == "manual":
        priorities = [
            {
                "topic_id": topic_id,
                "priority": selected_priorities.get(topic_id, 0.5),
                "reason": "Manually prioritized by the student.",
            }
            for topic_id in data.topics
        ]
    else:
        states = session.scalars(
            select(LearnerTopicState).where(LearnerTopicState.student_id == student_id)
        ).all()
        if data.topics:
            requested_topics = set(data.topics)
            states = [state for state in states if state.topic_id in requested_topics]
        if not states:
            raise Conflict("Predicted mode requires stored mastery data for selected topics.")

        now = datetime.now(UTC)
        days_until_exam = (data.exam_date - now.date()).days
        priorities = []
        for state in states:
            topic = session.get(Topic, state.topic_id)
            if topic is None:
                raise ConstraintViolation(f"Mastery state references unknown topic {state.topic_id!r}.")
            days_since_revision = (
                max((now - state.last_revised).total_seconds() / 86400, 0)
                if state.last_revised is not None
                else None
            )
            result = compute_priority(
                weakness=state.weak_score,
                exam_importance=topic.exam_weight,
                days_until_exam=days_until_exam,
                days_since_revision=days_since_revision,
                improvement_potential=1 - state.mastery,
                prerequisite_boost=0,
            )
            priorities.append(
                {
                    "topic_id": state.topic_id,
                    "priority": result.score,
                    "mastery": state.mastery,
                    "reason": result.reason,
                }
            )

    constraints = data.model_dump(mode="json")
    constraints["priorities"] = priorities
    return constraints


def _save_availability(session: Session, plan_id: UUID, data: PlanInput) -> None:
    for window in data.availability_windows:
        session.add(
            AvailabilitySlot(
                plan_id=plan_id,
                weekday=window.weekday,
                start_time=window.start_time,
                end_time=window.end_time,
            )
        )


def _owned_plan(session: Session, student_id: str, plan_id: UUID) -> StudyPlan:
    plan = session.get(StudyPlan, plan_id)
    if plan is None or plan.student_id != student_id:
        raise NotFound("Study plan not found.")
    return plan


def _plan_snapshot(data: PlanInput, constraints: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": data.mode,
        "exam_date": data.exam_date.isoformat(),
        "target_grade": data.target_grade,
        "constraints": constraints,
    }


def _plan_response(plan: StudyPlan) -> dict[str, Any]:
    return {
        "id": str(plan.id),
        "mode": plan.mode,
        "exam_date": plan.exam_date,
        "target_grade": plan.target_grade,
        "constraints": plan.constraints,
    }
