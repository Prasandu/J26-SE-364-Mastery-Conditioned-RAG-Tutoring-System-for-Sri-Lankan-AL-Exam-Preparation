from dataclasses import replace
from datetime import UTC, date, datetime, time, timedelta
from math import exp
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errors import ConstraintViolation, NotFound
from app.models import (
    AvailabilitySlot,
    LearnerTopicState,
    Question,
    StudyPlan,
    StudyTask,
    Topic,
    TopicEvidence,
)
from app.schemas.plans import FixedCommitment
from app.schemas.tasks import ScheduledTaskResponse, ScheduleResponse
from app.services.achievability import TopicInput, allocate_hours, expected_gain_per_hour
from app.services.decline import detect_decline
from app.services.priority import LearningProfile, choose_activity
from app.services.scheduler import (
    FixedCommitment as SchedulerCommitment,
)
from app.services.scheduler import (
    RankedTopic,
    TimeWindow,
    schedule_tasks,
)
from app.services.task_content import build_activity_steps, build_task_reason
from app.services.weights import DECLINE_PRIORITY_BOOST


def generate_plan_schedule(
    session: Session,
    student_id: str,
    plan_id: Any,
    *,
    horizon_days: int = 14,
    now: datetime | None = None,
    duration_overrides: dict[str, int] | None = None,
    priority_overrides: dict[str, float] | None = None,
    replanned_from: dict[str, Any] | None = None,
) -> ScheduleResponse:
    plan = _owned_plan(session, student_id, plan_id)
    current = (now or datetime.now(UTC)).astimezone(UTC)
    constraints = plan.constraints
    duration_overrides = duration_overrides or {}
    local_zone = _time_zone(constraints.get("timezone", "Asia/Colombo"))
    start_local = current.astimezone(local_zone)
    end_date = min(start_local.date() + timedelta(days=horizon_days - 1), plan.exam_date - timedelta(days=1))
    exam_deadline = datetime.combine(plan.exam_date, time.min, local_zone)

    priorities = _ranked_topics(
        session,
        student_id,
        constraints,
        duration_overrides=duration_overrides or {},
        priority_overrides=priority_overrides or {},
        as_of=current,
        exam_date=plan.exam_date,
    )
    if exam_deadline <= current:
        unscheduled = {item.topic_id: item.duration_minutes for item in priorities}
        return ScheduleResponse(
            tasks=[],
            infeasible=True,
            shortfall_minutes=sum(unscheduled.values()),
            unscheduled_minutes=unscheduled,
        )

    windows = _availability_windows(
        session,
        plan_id,
        current,
        end_date,
        local_zone,
    )
    commitments = _fixed_commitments(constraints.get("fixed_commitments", []))
    effective_minutes_by_day: dict[date, int] = {}
    for window in windows:
        duration = int((window.end_at - window.start_at).total_seconds() // 60)
        blocked = sum(
            int(
                (
                    min(window.end_at, item.end_at)
                    - max(window.start_at, item.start_at)
                ).total_seconds()
                // 60
            )
            for item in commitments
            if window.start_at < item.end_at and item.start_at < window.end_at
        )
        day = window.start_at.astimezone(local_zone).date()
        effective_minutes_by_day[day] = effective_minutes_by_day.get(day, 0) + max(0, duration - blocked)
    total_available_hours = sum(
        min(minutes, constraints.get("max_daily_minutes", 180))
        for minutes in effective_minutes_by_day.values()
    ) / 60
    allocation = allocate_hours(
        [
            {
                "topic_id": topic.topic_id,
                "exam_weight": topic.exam_weight,
                "mastery": topic.mastery,
                "prerequisites": list(topic.prerequisites),
                "prerequisite_mastery": topic.prerequisite_mastery or {},
            }
            for topic in priorities
        ],
        total_available_hours,
    )
    if priorities and not any(allocation.values()):
        unscheduled = {item.topic_id: item.duration_minutes for item in priorities}
        return ScheduleResponse(
            tasks=[],
            infeasible=True,
            shortfall_minutes=sum(unscheduled.values()),
            unscheduled_minutes=unscheduled,
        )
    priorities = [
        replace(
            topic,
            duration_minutes=max(
                round(allocation.get(topic.topic_id, 0) * 60),
                duration_overrides.get(topic.topic_id, 0),
            ),
        )
        for topic in priorities
        if allocation.get(topic.topic_id, 0) > 0 or duration_overrides.get(topic.topic_id, 0) > 0
    ]
    allocated_topic_ids = {topic.topic_id for topic in priorities}
    priorities = [
        replace(
            topic,
            prerequisites=tuple(
                prerequisite
                for prerequisite in topic.prerequisites
                if prerequisite in allocated_topic_ids
            ),
        )
        for topic in priorities
    ]
    result = schedule_tasks(
        priorities=priorities,
        availability=windows,
        commitments=commitments,
        exam_deadline=exam_deadline,
        max_session_minutes=constraints["max_session_minutes"],
        daily_cap_minutes=constraints.get("max_daily_minutes", 180),
        now=current,
    )

    existing = session.scalars(
        select(StudyTask).where(
            StudyTask.plan_id == plan.id,
            StudyTask.status == "planned",
            StudyTask.start_at >= current,
            StudyTask.start_at
            < datetime.combine(
                end_date + timedelta(days=1),
                time.min,
                local_zone,
            ).astimezone(UTC),
        )
    ).all()
    for task in existing:
        session.delete(task)

    priority_by_topic = {item.topic_id: item.priority for item in priorities}
    stored: list[StudyTask] = []
    replanned_topics: set[str] = set()
    for scheduled in result.tasks:
        origin_id = (replanned_from or {}).get(scheduled.topic_id)
        task = StudyTask(
            plan_id=plan.id,
            student_id=student_id,
            topic_id=scheduled.topic_id,
            activity=scheduled.activity,
            start_at=scheduled.start_at,
            duration_min=scheduled.duration_min,
            status="planned",
            reason=scheduled.reason,
            reason_details=scheduled.reason_details or {},
            steps=build_activity_steps(
                duration_minutes=scheduled.duration_min,
                mastery=scheduled.reason_details["mastery"],
                studied=scheduled.studied,
                activity=scheduled.activity,
                declining=scheduled.declining,
                question_ids=scheduled.question_ids,
            ),
            replanned_from=origin_id if scheduled.topic_id not in replanned_topics else None,
        )
        if origin_id is not None:
            replanned_topics.add(scheduled.topic_id)
        session.add(task)
        stored.append(task)
    session.flush()
    return ScheduleResponse(
        tasks=[_scheduled_response(task, priority_by_topic.get(task.topic_id, 0)) for task in stored],
        infeasible=result.infeasible,
        shortfall_minutes=result.shortfall_minutes,
        unscheduled_minutes=result.unscheduled_minutes,
    )


def generate_and_commit_schedule(
    session: Session,
    student_id: str,
    plan_id: Any,
    *,
    horizon_days: int = 14,
) -> ScheduleResponse:
    response = generate_plan_schedule(
        session,
        student_id,
        plan_id,
        horizon_days=horizon_days,
    )
    session.commit()
    return response


def get_plan_schedule(session: Session, student_id: str, plan_id: Any) -> ScheduleResponse:
    plan = _owned_plan(session, student_id, plan_id)
    tasks = session.scalars(
        select(StudyTask)
        .where(
            StudyTask.plan_id == plan.id,
            StudyTask.student_id == student_id,
        )
        .order_by(StudyTask.start_at, StudyTask.id)
    ).all()
    priorities = {
        item["topic_id"]: float(item["priority"])
        for item in plan.constraints.get("priorities", [])
    }
    return ScheduleResponse(
        tasks=[
            _scheduled_response(task, priorities.get(task.topic_id, 0))
            for task in tasks
        ],
        infeasible=False,
        shortfall_minutes=0,
        unscheduled_minutes={},
    )


def _ranked_topics(
    session: Session,
    student_id: str,
    constraints: dict[str, Any],
    *,
    duration_overrides: dict[str, int],
    priority_overrides: dict[str, float],
    as_of: datetime,
    exam_date: date | None = None,
) -> list[RankedTopic]:
    priorities = constraints.get("priorities", [])
    if not priorities:
        raise ConstraintViolation("Plan has no topics to schedule.")
    state_by_topic = {
        state.topic_id: state
        for state in session.scalars(
            select(LearnerTopicState).where(LearnerTopicState.student_id == student_id)
        ).all()
    }
    evidence_by_topic: dict[str, list[dict[str, Any]]] = {}
    for evidence in session.scalars(
        select(TopicEvidence)
        .where(TopicEvidence.student_id == student_id)
        .order_by(TopicEvidence.observed_at)
    ).all():
        evidence_by_topic.setdefault(evidence.topic_id, []).append(
            {
                "score": evidence.score,
                "max_score": evidence.max_score,
                "attempted_at": evidence.observed_at,
                "paper_id": getattr(evidence, "paper_id", None),
                "question_id": getattr(evidence, "question_id", None),
            }
        )
    ranked: list[RankedTopic] = []
    for item in priorities:
        topic_id = item["topic_id"]
        topic = session.get(Topic, topic_id)
        if topic is None:
            raise ConstraintViolation(f"Plan references unknown topic {topic_id!r}.")
        state = state_by_topic.get(topic_id)
        topic_mastery = float(state.mastery) if state is not None else 0.0
        prerequisite_mastery = {
            prerequisite: float(state_by_topic[prerequisite].mastery)
            for prerequisite in topic.prerequisites or []
            if prerequisite in state_by_topic
        }
        gain_input: TopicInput = {
            "topic_id": topic_id,
            "exam_weight": float(topic.exam_weight or 0),
            "mastery": topic_mastery,
            "prerequisites": list(topic.prerequisites or []),
            "prerequisite_mastery": prerequisite_mastery,
        }
        expected_priority = expected_gain_per_hour(gain_input)
        decline = detect_decline(
            topic_id,
            evidence_by_topic.get(topic_id, []),
            topic_name=getattr(topic, "name", None),
        )
        if state is None:
            profile = LearningProfile(studied=False, theory_completed=False, mastery=0)
        else:
            profile = LearningProfile(
                studied=True,
                theory_completed=state.mastery >= 0.35,
                mastery=state.mastery,
                repeated_errors=2 if state.error_rate >= 0.4 else 0,
                review_due=state.next_review_at is not None and state.next_review_at <= as_of,
            )
        activity = "recovery_revision" if decline is not None else choose_activity(profile)
        days_to_exam = max(((exam_date or as_of.date()) - as_of.date()).days, 0)
        urgency = 1 / (1 + days_to_exam / 14)
        days_since_revision = (
            max((as_of - state.last_revised).total_seconds() / 86400, 0)
            if state is not None and getattr(state, "last_revised", None) is not None
            else None
        )
        forgetting_risk = 1.0 if days_since_revision is None else 1 - exp(-days_since_revision / 30)
        effective_priority = min(
            max(
                expected_priority + (DECLINE_PRIORITY_BOOST if decline is not None else 0),
                priority_overrides.get(topic_id, 0.0),
            ),
            1.0,
        )
        parent_id = getattr(topic, "parent_id", None)
        topic_name = getattr(topic, "name", topic_id)
        parent_topic = session.get(Topic, parent_id) if parent_id else None
        reason_details = build_task_reason(
            topic_name=getattr(parent_topic, "name", topic_name),
            sub_topic_name=topic_name if parent_id else None,
            mastery=topic_mastery,
            trend=float(getattr(state, "trend", 0)) if state is not None else 0.0,
            decline=decline,
            exam_weight=float(topic.exam_weight or 0),
            days_to_exam=days_to_exam,
            main_factors={
                "weakness": (
                    float(getattr(state, "weak_score", 1 - topic_mastery))
                    if state is not None
                    else 1 - topic_mastery
                ),
                "exam_weight": float(topic.exam_weight or 0),
                "urgency": urgency,
                "forgetting_risk": forgetting_risk,
                "improvement_potential": 1 - topic_mastery,
                "priority": effective_priority,
            },
            activity=activity,
        )
        question_ids = _question_ids_for_topic(session, student_id, topic_id)
        ranked.append(
            RankedTopic(
                topic_id=topic_id,
                activity=activity,
                priority=effective_priority,
                duration_minutes=duration_overrides.get(
                    topic_id,
                    constraints["max_session_minutes"] * 2,
                ),
                reason=(
                    f"Recovery revision first, then questions from this topic. {decline.message}"
                    if decline is not None
                    else item.get("reason", f"Scheduled from priority {item['priority']:.2f}.")
                ),
                reason_details=reason_details,
                question_ids=question_ids,
                declining=decline is not None,
                studied=profile.studied,
                prerequisites=tuple(
                    prerequisite
                    for prerequisite in topic.prerequisites
                    if prerequisite in {entry["topic_id"] for entry in priorities}
                ),
                exam_weight=float(topic.exam_weight or 0),
                mastery=topic_mastery,
                prerequisite_mastery=prerequisite_mastery,
            )
        )
    return ranked


def _question_ids_for_topic(
    session: Session,
    student_id: str,
    topic_id: str,
) -> tuple[str, ...]:
    questions = session.scalars(
        select(Question).where(or_(Question.topic_id == topic_id, Question.sub_topic_id == topic_id))
    ).all()
    if not questions:
        return ()
    question_ids = [question.question_id for question in questions]
    evidence = session.scalars(
        select(TopicEvidence).where(
            TopicEvidence.student_id == student_id,
            TopicEvidence.question_id.in_(question_ids),
        )
    ).all()
    attempt_rank: dict[str, int] = {}
    for attempt in evidence:
        rank = 0 if attempt.score < attempt.max_score else 2
        if attempt.question_id is not None:
            attempt_rank[attempt.question_id] = min(
                attempt_rank.get(attempt.question_id, rank),
                rank,
            )
    return tuple(
        question.question_id
        for question in sorted(
            questions,
            key=lambda question: (
                attempt_rank.get(question.question_id, 1),
                question.question_id,
            ),
        )
    )


def _availability_windows(
    session: Session,
    plan_id: Any,
    start_at: datetime,
    end_date: date,
    zone: ZoneInfo,
) -> list[TimeWindow]:
    slots = session.scalars(select(AvailabilitySlot).where(AvailabilitySlot.plan_id == plan_id)).all()
    if not slots:
        raise ConstraintViolation("Plan has no saved availability windows.")
    windows: list[TimeWindow] = []
    local_day = start_at.astimezone(zone).date()
    while local_day <= end_date:
        for slot in slots:
            if local_day.weekday() == slot.weekday:
                windows.append(
                    TimeWindow(
                        datetime.combine(local_day, slot.start_time, zone),
                        datetime.combine(local_day, slot.end_time, zone),
                    )
                )
        local_day += timedelta(days=1)

    return windows


def _fixed_commitments(items: list[dict[str, Any]]) -> list[SchedulerCommitment]:
    return [
        SchedulerCommitment(start_at=item.start_at.astimezone(UTC), end_at=item.end_at.astimezone(UTC))
        for item in (FixedCommitment.model_validate(raw) for raw in items)
    ]


def _time_zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, TypeError) as exc:
        raise ConstraintViolation(f"Invalid plan timezone {name!r}.") from exc


def _owned_plan(session: Session, student_id: str, plan_id: Any) -> StudyPlan:
    plan = session.get(StudyPlan, plan_id)
    if plan is None or plan.student_id != student_id:
        raise NotFound("Study plan not found.")
    return plan


def _scheduled_response(task: StudyTask, priority: float) -> ScheduledTaskResponse:
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
