from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Conflict, ConstraintViolation, NotFound
from app.models import (
    AvailabilitySlot,
    LearnerTopicState,
    ReplanLog,
    StudyPlan,
    Topic,
    TopicEvidence,
)
from app.schemas.plans import PlanInput
from app.services.achievability import (
    TopicInput,
    build_achievability_report,
    build_coaching_message,
    expected_gain_per_hour,
)


def create_plan(
    session: Session,
    student_id: str,
    data: PlanInput,
    *,
    student_name: str = "there",
) -> dict[str, Any]:
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
    return _plan_response(
        plan,
        build_plan_achievability(session, student_id, plan, student_name=student_name),
    )


def list_plans(
    session: Session,
    student_id: str,
    *,
    student_name: str = "there",
) -> list[dict[str, Any]]:
    plans = session.scalars(
        select(StudyPlan)
        .where(StudyPlan.student_id == student_id)
        .order_by(StudyPlan.created_at.desc(), StudyPlan.id.desc())
    ).all()
    return [
        _plan_response(
            plan,
            build_plan_achievability(session, student_id, plan, student_name=student_name),
        )
        for plan in plans
    ]


def get_plan(
    session: Session,
    student_id: str,
    plan_id: UUID,
    *,
    student_name: str = "there",
) -> dict[str, Any]:
    plan = _owned_plan(session, student_id, plan_id)
    return _plan_response(
        plan,
        build_plan_achievability(session, student_id, plan, student_name=student_name),
    )


def update_plan(
    session: Session,
    student_id: str,
    plan_id: UUID,
    data: PlanInput,
    *,
    student_name: str = "there",
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
    return _plan_response(
        plan,
        build_plan_achievability(session, student_id, plan, student_name=student_name),
    )


def build_plan_achievability(
    session: Session,
    student_id: str,
    plan: StudyPlan,
    *,
    student_name: str = "there",
    current_score: float | None = None,
    evidence_count: int | None = None,
    as_of: datetime | None = None,
) -> dict[str, Any]:
    states = session.scalars(
        select(LearnerTopicState).where(LearnerTopicState.student_id == student_id)
    ).all()
    state_by_id = {state.topic_id: state for state in states}
    priorities = plan.constraints.get("priorities", [])
    topic_ids = [item["topic_id"] for item in priorities]
    topics: list[TopicInput] = []
    focus_topics: list[tuple[float, dict[str, str]]] = []
    for topic_id in topic_ids:
        topic = session.get(Topic, topic_id)
        if topic is None:
            continue
        state = state_by_id.get(topic_id)
        topics.append(
            {
                "topic_id": topic_id,
                "exam_weight": float(topic.exam_weight or 0),
                "mastery": float(state.mastery) if state is not None else 0.0,
                "prerequisites": list(getattr(topic, "prerequisites", None) or []),
                "prerequisite_mastery": {
                    prerequisite: float(state_by_id[prerequisite].mastery)
                    for prerequisite in getattr(topic, "prerequisites", None) or []
                    if prerequisite in state_by_id
                },
            }
        )
        mastery = float(state.mastery) if state is not None else 0.0
        trend = float(getattr(state, "trend", 0)) if state is not None else 0.0
        if trend < -0.01:
            reason = "recent mastery is declining"
        elif mastery < 0.45:
            reason = f"mastery is {round(mastery * 100)}%"
        elif float(topic.exam_weight or 0) >= 0.65:
            reason = "high exam weight"
        else:
            reason = "steady practice will strengthen recall"
        parent_id = getattr(topic, "parent_id", None)
        parent = session.get(Topic, parent_id) if parent_id else None
        name = getattr(topic, "name", topic_id)
        if parent is not None:
            name = f"{getattr(parent, 'name', topic_id)}, {name}"
        focus_topics.append(
            (
                expected_gain_per_hour(topics[-1]),
                {"topic": name, "reason": reason},
            )
        )
    if current_score is None:
        weights = [item["exam_weight"] for item in topics]
        mastery_values = [item["mastery"] for item in topics]
        total_weight = sum(weights)
        current_score = (
            sum(weight * mastery for weight, mastery in zip(weights, mastery_values, strict=True))
            / total_weight
            if total_weight > 0
            else sum(mastery_values) / len(mastery_values)
            if mastery_values
            else 0.0
        )
    if evidence_count is None:
        evidence_count = len(
            session.scalars(
                select(TopicEvidence).where(TopicEvidence.student_id == student_id)
            ).all()
        )
    slots = session.scalars(
        select(AvailabilitySlot).where(AvailabilitySlot.plan_id == plan.id)
    ).all()
    hours_available = sum(
        (
            slot.end_time.hour * 60
            + slot.end_time.minute
            - slot.start_time.hour * 60
            - slot.start_time.minute
        )
        / 60
        for slot in slots
    )
    now = (as_of or datetime.now(UTC)).astimezone(UTC)
    days_remaining = max((plan.exam_date - now.date()).days, 0)
    report = build_achievability_report(
        current=current_score,
        target_grade=plan.target_grade,
        topics=topics,
        days_remaining=days_remaining,
        hours_available=hours_available,
        evidence_count=evidence_count,
    )
    ordered_focus_topics = [
        topic
        for _, topic in sorted(focus_topics, key=lambda item: item[0], reverse=True)[:3]
    ]
    suggested_hours_per_day = min(
        max(report.hours_needed / 7, min(report.hours_available / 7, 1.5)),
        report.hours_available / 7,
    )
    coaching = build_coaching_message(
        student_name=student_name,
        days_left=days_remaining,
        best_range=(
            f"{report.best_range_grade} "
            f"({round(report.projected_range.low * 100)}–"
            f"{round(report.projected_range.high * 100)}%)"
        ),
        target_grade=plan.target_grade,
        status=report.status,
        focus_topics=ordered_focus_topics,
        suggested_hours_per_day=suggested_hours_per_day,
    )
    return {
        **asdict(report),
        "student_name": student_name,
        "coaching_message": asdict(coaching),
    }


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
        state_by_id = {item.topic_id: item for item in states}
        if data.topics:
            requested_topics = set(data.topics)
            states = [state for state in states if state.topic_id in requested_topics]
        if not states:
            raise Conflict("Predicted mode requires stored mastery data for selected topics.")

        priorities = []
        for state in states:
            topic = session.get(Topic, state.topic_id)
            if topic is None:
                raise ConstraintViolation(f"Mastery state references unknown topic {state.topic_id!r}.")
            prerequisite_mastery = {
                prerequisite: float(state_by_id[prerequisite].mastery)
                for prerequisite in getattr(topic, "prerequisites", None) or []
                if prerequisite in state_by_id
            }
            priority = expected_gain_per_hour(
                {
                    "topic_id": state.topic_id,
                    "exam_weight": float(topic.exam_weight or 0),
                    "mastery": float(state.mastery),
                    "prerequisites": list(getattr(topic, "prerequisites", None) or []),
                    "prerequisite_mastery": prerequisite_mastery,
                }
            )
            priorities.append(
                {
                    "topic_id": state.topic_id,
                    "priority": priority,
                    "mastery": state.mastery,
                    "reason": f"Estimated {priority:.3f} exam-score gain per study hour.",
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


def _plan_response(plan: StudyPlan, achievability: dict[str, Any]) -> dict[str, Any]:
    report = {
        key: value
        for key, value in achievability.items()
        if key not in {"student_name", "coaching_message"}
    }
    return {
        "id": str(plan.id),
        "mode": plan.mode,
        "exam_date": plan.exam_date,
        "target_grade": plan.target_grade,
        "constraints": plan.constraints,
        "student_name": achievability["student_name"],
        "coaching_message": achievability["coaching_message"],
        "achievability": report,
    }
