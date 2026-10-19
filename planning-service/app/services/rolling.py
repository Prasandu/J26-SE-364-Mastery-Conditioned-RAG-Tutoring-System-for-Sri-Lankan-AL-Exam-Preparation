"""Checkpoints and target decisions for rolling-horizon planning."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Conflict, NotFound
from app.models import LearnerTopicState, RawEvent, ReplanLog, RoadmapWeek, StudyPlan
from app.schemas.roadmap import RangeChange, RoadmapResponse, RollingUpdateResponse
from app.services.mastery import recompute_for
from app.services.plans import build_plan_achievability
from app.services.roadmap import (
    apply_overload_rule,
    build_and_store_roadmap,
    committed_window_days,
    get_roadmap,
    is_final_week,
    rescheduling_horizon_days,
    rolling_state,
    set_rolling_state,
    start_window,
)
from app.services.scheduling import generate_plan_schedule
from app.services.task_outcomes import measure_adherence, refresh_predicted_priorities
from app.services.weights import RANGE_CHANGE_EPSILON


def checkpoint_status(
    session: Session,
    student_id: str,
    plan: StudyPlan,
    *,
    now: datetime,
) -> tuple[bool, str | None]:
    """Return whether a checkpoint is due and why.

    A checkpoint is due when the committed window has ended or when new
    assessment evidence arrived after the last checkpoint. Once the final
    week's window has started the plan stops rolling.
    """
    state = rolling_state(plan)
    if not state.get("window_end") or not state.get("window_start"):
        return False, None
    window_start = date.fromisoformat(state["window_start"])
    if is_final_week((plan.exam_date - window_start).days):
        return False, None
    today = _local_today(plan, now)
    if today >= plan.exam_date:
        return False, None
    if today > date.fromisoformat(state["window_end"]):
        return True, "window_end"
    last_checkpoint = state.get("last_checkpoint_at")
    if last_checkpoint:
        newer_assessment = session.scalars(
            select(RawEvent.event_id)
            .where(
                RawEvent.student_id == student_id,
                RawEvent.event_type == "assessment",
                RawEvent.received_at > datetime.fromisoformat(last_checkpoint),
            )
            .limit(1)
        ).first()
        if newer_assessment is not None:
            return True, "new_evidence"
    return False, None


def roadmap_view(
    session: Session,
    student_id: str,
    plan_id: UUID,
    *,
    now: datetime | None = None,
) -> RoadmapResponse:
    """Return the roadmap, building it first for plans created before roadmaps existed."""
    plan = _owned_plan(session, student_id, plan_id)
    current = (now or datetime.now(UTC)).astimezone(UTC)
    has_rows = session.scalars(
        select(RoadmapWeek.id).where(RoadmapWeek.plan_id == plan.id).limit(1)
    ).first()
    if has_rows is None:
        build_and_store_roadmap(session, student_id, plan, now=current)
        session.commit()
    return RoadmapResponse.model_validate(
        get_roadmap(
            session,
            student_id,
            plan.id,
            now=current,
            checkpoint_due=checkpoint_status(session, student_id, plan, now=current),
        )
    )


def run_checkpoint(
    session: Session,
    student_id: str,
    plan_id: UUID,
    *,
    now: datetime | None = None,
    force: bool = False,
) -> RollingUpdateResponse:
    """Rebuild the roadmap and commit the next window when a checkpoint is due.

    Uses the latest mastery (with trends and decline alerts, via the
    scheduler's ranking) and the adherence measured over the last week.
    """
    plan = _owned_plan(session, student_id, plan_id)
    current = (now or datetime.now(UTC)).astimezone(UTC)
    due, reason = checkpoint_status(session, student_id, plan, now=current)
    if not due and not force:
        return RollingUpdateResponse(
            plan_id=plan.id,
            ran=False,
            target_grade=plan.target_grade,
            roadmap=roadmap_view(session, student_id, plan.id, now=current),
        )
    trigger = reason or "manual"
    state = rolling_state(plan)

    _, planned, completed, adherence = measure_adherence(
        session,
        student_id,
        plan.id,
        since=current - timedelta(days=7),
        until=current,
    )
    recompute_for(
        session,
        student_id,
        [item["topic_id"] for item in plan.constraints.get("priorities", [])],
        as_of=current,
    )
    session.flush()
    states = list(
        session.scalars(
            select(LearnerTopicState).where(LearnerTopicState.student_id == student_id)
        ).all()
    )
    refresh_predicted_priorities(session, plan, states, current)
    overload = apply_overload_rule(session, student_id, plan, adherence, now=current)

    achievability = build_plan_achievability(session, student_id, plan, as_of=current)
    expected = float(achievability["projected_range"]["expected"])
    range_change = describe_range_change(state.get("last_expected_score"), expected)

    today = _local_today(plan, current)
    window_days = max(committed_window_days((plan.exam_date - today).days), 1)
    schedule = generate_plan_schedule(
        session,
        student_id,
        plan.id,
        horizon_days=window_days,
        now=current,
    )
    start_window(plan, today=today, window_days=window_days, now=current)
    set_rolling_state(
        plan,
        last_expected_score=expected,
        checkpoint_count=int(state.get("checkpoint_count") or 0) + 1,
    )
    build_and_store_roadmap(session, student_id, plan, now=current)
    session.add(
        ReplanLog(
            student_id=student_id,
            plan_id=plan.id,
            reason=f"Checkpoint ({trigger}): roadmap and next {window_days}-day window rebuilt.",
            changes=[
                {
                    "trigger": trigger,
                    "adherence": adherence,
                    "planned_minutes": planned,
                    "completed_minutes": completed,
                    "compressed": overload.compressed,
                    "deferred_topics": overload.dropped_topics,
                    "restored_topics": overload.restored_topics,
                    "previous_expected_score": state.get("last_expected_score"),
                    "expected_score": expected,
                    "window_days": window_days,
                    "tasks_created": len(schedule.tasks),
                }
            ],
        )
    )
    session.commit()
    return RollingUpdateResponse(
        plan_id=plan.id,
        ran=True,
        trigger=trigger,
        adherence=adherence,
        compressed=overload.compressed,
        deferred_topics=overload.dropped_topics,
        restored_topics=overload.restored_topics,
        explanation=overload.explanation,
        target_grade=plan.target_grade,
        range_change=range_change,
        roadmap=roadmap_view(session, student_id, plan.id, now=current),
        schedule=schedule,
    )


def choose_target(
    session: Session,
    student_id: str,
    plan_id: UUID,
    choice: str,
    *,
    now: datetime | None = None,
) -> RollingUpdateResponse:
    """Apply the student's choice after compression: keep target or adjust goal."""
    plan = _owned_plan(session, student_id, plan_id)
    current = (now or datetime.now(UTC)).astimezone(UTC)
    pending: dict[str, Any] | None = rolling_state(plan).get("pending_target_choice")
    if not pending:
        raise Conflict("There is no target decision waiting for this plan.")
    old_grade = plan.target_grade
    if choice == "keep_target":
        set_rolling_state(
            plan,
            deferred_topics=[],
            compression_note=None,
            session_minutes=None,
            daily_minutes=None,
            pending_target_choice=None,
        )
        explanation = (
            f"Target {old_grade} kept. All topics are back in your plan; aim for about "
            f"{pending['keep_target']['hours_per_day']} hours a day."
        )
    else:
        plan.target_grade = pending["adjust_goal"]["grade"]
        set_rolling_state(plan, pending_target_choice=None)
        explanation = (
            f"Goal adjusted from {old_grade} to {plan.target_grade}. Your lighter plan stays in "
            "place, and you can raise the goal again at any time."
        )
    session.add(
        ReplanLog(
            student_id=student_id,
            plan_id=plan.id,
            reason=f"Student chose to {choice.replace('_', ' ')} after plan compression.",
            changes=[
                {"field": "target_grade", "old": old_grade, "new": plan.target_grade, "choice": choice}
            ],
        )
    )
    schedule = generate_plan_schedule(
        session,
        student_id,
        plan.id,
        horizon_days=rescheduling_horizon_days(plan, _local_today(plan, current)),
        now=current,
    )
    build_and_store_roadmap(session, student_id, plan, now=current)
    session.commit()
    return RollingUpdateResponse(
        plan_id=plan.id,
        ran=True,
        trigger="target_choice",
        explanation=explanation,
        target_grade=plan.target_grade,
        deferred_topics=list(rolling_state(plan).get("deferred_topics") or []),
        roadmap=roadmap_view(session, student_id, plan.id, now=current),
        schedule=schedule,
    )


def describe_range_change(previous: float | None, current: float) -> RangeChange:
    """Explain how the estimated score moved since the last checkpoint."""
    if previous is None or abs(current - previous) < RANGE_CHANGE_EPSILON:
        return RangeChange(
            direction="same",
            previous=previous,
            current=current,
            message="Your estimated range is steady. Keep going with the plan.",
        )
    if current > previous:
        return RangeChange(
            direction="up",
            previous=previous,
            current=current,
            message=(
                f"Your estimated score moved up from {round(previous * 100)}% to "
                f"{round(current * 100)}%. Your work is paying off!"
            ),
        )
    return RangeChange(
        direction="down",
        previous=previous,
        current=current,
        message=(
            f"Your estimated score moved from {round(previous * 100)}% to {round(current * 100)}%. "
            "That happens, and your next sessions now focus on the topics that will help most."
        ),
    )


def _local_today(plan: StudyPlan, now: datetime) -> date:
    try:
        zone = ZoneInfo(plan.constraints.get("timezone", "Asia/Colombo"))
    except (ZoneInfoNotFoundError, TypeError):
        zone = ZoneInfo("UTC")
    return now.astimezone(zone).date()


def _owned_plan(session: Session, student_id: str, plan_id: UUID) -> StudyPlan:
    plan = session.get(StudyPlan, plan_id)
    if plan is None or plan.student_id != student_id:
        raise NotFound("Study plan not found.")
    return plan
