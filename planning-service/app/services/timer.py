"""Server-backed study timer for planned tasks.

State machine::

    idle --start--> running --pause--> paused --resume--> running
    running|paused --finish--> finished

Elapsed time is derived only from server timestamps. A student can have at
most one running timer; starting another task pauses the running one.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Conflict, NotFound
from app.models import StudyPlan, StudyTask
from app.schemas.tasks import TimerResponse
from app.services.task_views import elapsed_seconds, scheduled_task_response
from app.services.weights import TIMER_CONFIRM_MULTIPLIER

ACTIVE_STATES = frozenset({"running", "paused"})



def start_timer(
    session: Session,
    student_id: str,
    task_id: UUID,
    *,
    now: datetime | None = None,
) -> TimerResponse:
    current = _now(now)
    task = _owned_planned_task(session, student_id, task_id)
    if task.timer_state != "idle":
        raise Conflict(f"This session's timer is already {task.timer_state}.")
    paused = _pause_other_running(session, student_id, task.id, current)
    task.timer_state = "running"
    task.started_at = current
    task.last_resumed_at = current
    task.paused_at = None
    task.paused_total_sec = 0
    session.commit()
    return TimerResponse(
        task=_response(session, task, current),
        paused_task=_response(session, paused, current) if paused is not None else None,
        message="Your other session was paused so you can start this one." if paused is not None else None,
    )


def pause_timer(
    session: Session,
    student_id: str,
    task_id: UUID,
    *,
    now: datetime | None = None,
) -> TimerResponse:
    current = _now(now)
    task = _owned_planned_task(session, student_id, task_id)
    if task.timer_state != "running":
        raise Conflict("Only a running timer can be paused.")
    _pause(task, current)
    session.commit()
    return TimerResponse(task=_response(session, task, current))


def resume_timer(
    session: Session,
    student_id: str,
    task_id: UUID,
    *,
    now: datetime | None = None,
) -> TimerResponse:
    current = _now(now)
    task = _owned_planned_task(session, student_id, task_id)
    if task.timer_state != "paused":
        raise Conflict("Only a paused timer can be resumed.")
    paused = _pause_other_running(session, student_id, task.id, current)
    task.paused_total_sec = (task.paused_total_sec or 0) + max(
        int((current - task.paused_at).total_seconds()), 0
    )
    task.paused_at = None
    task.last_resumed_at = current
    task.timer_state = "running"
    session.commit()
    return TimerResponse(
        task=_response(session, task, current),
        paused_task=_response(session, paused, current) if paused is not None else None,
        message="Your other session was paused so you can resume this one." if paused is not None else None,
    )


def finish_timer(
    session: Session,
    student_id: str,
    task_id: UUID,
    *,
    confirmed_minutes: int | None = None,
    now: datetime | None = None,
) -> TimerResponse:
    """Stop the timer and prefill ``actual_duration_min``.

    Unusual sessions (over ``TIMER_CONFIRM_MULTIPLIER`` x planned time, or
    running past local midnight) are not saved until the student confirms
    the real number of minutes.
    """
    current = _now(now)
    task = _owned_planned_task(session, student_id, task_id)
    if task.timer_state not in ACTIVE_STATES:
        raise Conflict("Start the timer before finishing this session.")
    seconds = elapsed_seconds(task, current)
    measured = round(seconds / 60)
    reason = _confirmation_reason(session, task, seconds, current)
    if reason is not None and confirmed_minutes is None:
        return TimerResponse(
            task=_response(session, task, current),
            measured_minutes=measured,
            suggested_actual_minutes=min(measured, task.duration_min),
            requires_confirmation=True,
            confirmation_reason=reason,
        )
    minutes = measured if confirmed_minutes is None else confirmed_minutes
    if task.timer_state == "running":
        _pause(task, current)
    task.timer_state = "finished"
    suggested = min(minutes, task.duration_min)
    task.actual_duration_min = suggested
    session.commit()
    return TimerResponse(
        task=_response(session, task, current),
        measured_minutes=measured,
        suggested_actual_minutes=suggested,
    )


def stop_timer_for_outcome(task: Any, now: datetime | None = None) -> None:
    """Close an active timer when the task outcome is recorded directly."""
    if getattr(task, "timer_state", "idle") in ACTIVE_STATES:
        if task.timer_state == "running":
            _pause(task, _now(now))
        task.timer_state = "finished"


def _pause(task: StudyTask, now: datetime) -> None:
    task.timer_state = "paused"
    task.paused_at = now


def _pause_other_running(
    session: Session,
    student_id: str,
    task_id: UUID,
    now: datetime,
) -> StudyTask | None:
    running = session.scalars(
        select(StudyTask).where(
            StudyTask.student_id == student_id,
            StudyTask.timer_state == "running",
            StudyTask.id != task_id,
        )
    ).first()
    if running is not None:
        _pause(running, now)
        session.flush()
    return running


def _confirmation_reason(session: Session, task: StudyTask, seconds: int, now: datetime) -> str | None:
    planned_seconds = task.duration_min * 60
    if seconds > TIMER_CONFIRM_MULTIPLIER * planned_seconds:
        return (
            f"This session ran {round(seconds / 60)} minutes, more than {TIMER_CONFIRM_MULTIPLIER} "
            f"times the planned {task.duration_min}. Was the timer left running? "
            "Please confirm how many minutes you actually studied."
        )
    zone = _plan_zone(session, task)
    if task.started_at is not None and now.astimezone(zone).date() != task.started_at.astimezone(zone).date():
        return (
            "This session ran past midnight. Please confirm how many minutes you actually studied."
        )
    return None


def _plan_zone(session: Session, task: StudyTask) -> ZoneInfo:
    plan = session.get(StudyPlan, task.plan_id)
    name = (getattr(plan, "constraints", None) or {}).get("timezone", "Asia/Colombo")
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, TypeError):
        return ZoneInfo("UTC")


def _owned_planned_task(session: Session, student_id: str, task_id: UUID) -> StudyTask:
    task = session.get(StudyTask, task_id)
    if task is None or task.student_id != student_id:
        raise NotFound("Study task not found.")
    if task.status != "planned":
        raise Conflict("The timer is only available for planned sessions.")
    return task


def _response(session: Session, task: StudyTask, now: datetime) -> Any:
    plan = session.get(StudyPlan, task.plan_id)
    priority = next(
        (
            float(item["priority"])
            for item in (getattr(plan, "constraints", None) or {}).get("priorities", [])
            if item["topic_id"] == task.topic_id
        ),
        0.0,
    )
    return scheduled_task_response(task, priority, now=now)


def _now(now: datetime | None) -> datetime:
    return (now or datetime.now(UTC)).astimezone(UTC)
