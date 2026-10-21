"""Study reminders and missed-session alerts, computed on request.

``list_notifications`` runs a sweep every time the student (or the 60-second
poll) asks for notifications, so no background job is needed:

* reminder: a planned, untouched session starts within the lead time;
* missed: an untouched session ended more than the grace period ago. It is
  marked missed and re-planned with the existing re-planner, and the alert
  says where it moved (or offers a one-click reschedule if nothing fit).

NFR8 restraint: no alerts during quiet hours, one alert per event (dedupe
key), stale reminders are cleared, and at most ``MAX_VISIBLE_ALERTS`` unread
alerts are shown, newest first.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.errors import NotFound, PlanningError
from app.models import (
    Notification,
    NotificationPreferences,
    ReplanLog,
    StudyPlan,
    StudyTask,
)
from app.schemas.notifications import (
    NotificationListResponse,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
)
from app.services.roadmap import rescheduling_horizon_days
from app.services.scheduling import generate_plan_schedule
from app.services.timer import stop_timer_for_outcome
from app.services.weights import MAX_VISIBLE_ALERTS, MISSED_ALERT_MAX_AGE_HOURS

DEFAULT_PREFERENCES = NotificationPreferencesResponse(
    reminder_lead_minutes=10,
    quiet_hours_start=time(22, 0),
    quiet_hours_end=time(6, 0),
    enabled=True,
)


def list_notifications(
    session: Session,
    student_id: str,
    *,
    now: datetime | None = None,
) -> NotificationListResponse:
    current = _now(now)
    preferences = get_preferences(session, student_id)
    quiet = sweep(session, student_id, preferences, now=current)
    session.commit()
    unread = session.scalars(
        select(Notification)
        .where(Notification.student_id == student_id, Notification.read_at.is_(None))
        .order_by(Notification.created_at.desc())
    ).all()
    return NotificationListResponse(
        notifications=[NotificationResponse.model_validate(item) for item in unread[:MAX_VISIBLE_ALERTS]],
        unread_count=len(unread),
        quiet_hours_active=quiet,
    )


def sweep(
    session: Session,
    student_id: str,
    preferences: NotificationPreferencesResponse,
    *,
    now: datetime,
) -> bool:
    """Create due reminders, process missed sessions and clear stale reminders.

    Returns True when quiet hours are active (nothing new is created then).
    """
    zone = student_zone(session, student_id)
    quiet = in_quiet_hours(now.astimezone(zone).time(), preferences)
    existing_keys = set(
        session.scalars(select(Notification.dedupe_key).where(Notification.student_id == student_id)).all()
    )
    _clear_stale_reminders(session, student_id, now)
    if quiet:
        return True

    lead = timedelta(minutes=preferences.reminder_lead_minutes)
    grace = timedelta(minutes=settings.missed_grace_minutes)
    candidates = session.scalars(
        select(StudyTask).where(
            StudyTask.student_id == student_id,
            StudyTask.status == "planned",
            StudyTask.timer_state == "idle",
            StudyTask.undone_at.is_(None),
            StudyTask.start_at <= now + lead,
        )
    ).all()
    # A session the student undid is theirs to record; never auto-mark it missed again.
    candidates = [task for task in candidates if getattr(task, "undone_at", None) is None]
    missed = [
        task for task in candidates if task.start_at + timedelta(minutes=task.duration_min) + grace <= now
    ]
    if missed:
        _process_missed(session, student_id, missed, preferences, existing_keys, zone, now)
    if preferences.enabled:
        for task in candidates:
            if task in missed or not (task.start_at - lead <= now < task.start_at):
                continue
            _add_once(
                session,
                existing_keys,
                Notification(
                    student_id=student_id,
                    type="reminder",
                    title="Session starting soon",
                    message=(
                        f"{_topic_name(task)} starts at {_clock(task.start_at, zone)}. "
                        "Open your plan when you're ready to start the timer."
                    ),
                    task_id=task.id,
                    action={"kind": "open_plan", "label": "Open my plan"},
                    dedupe_key=f"reminder:{task.id}",
                    created_at=now,
                ),
            )
    return False


def mark_read(
    session: Session,
    student_id: str,
    notification_id: UUID,
    *,
    now: datetime | None = None,
) -> NotificationResponse:
    notification = session.get(Notification, notification_id)
    if notification is None or notification.student_id != student_id:
        raise NotFound("Notification not found.")
    if notification.read_at is None:
        notification.read_at = _now(now)
        session.commit()
    return NotificationResponse.model_validate(notification)


def get_preferences(session: Session, student_id: str) -> NotificationPreferencesResponse:
    stored = session.get(NotificationPreferences, student_id)
    if stored is None:
        return DEFAULT_PREFERENCES
    return NotificationPreferencesResponse(
        reminder_lead_minutes=stored.reminder_lead_minutes,
        quiet_hours_start=stored.quiet_hours_start,
        quiet_hours_end=stored.quiet_hours_end,
        enabled=stored.enabled,
    )


def update_preferences(
    session: Session,
    student_id: str,
    data: NotificationPreferencesUpdate,
) -> NotificationPreferencesResponse:
    stored = session.get(NotificationPreferences, student_id)
    if stored is None:
        stored = NotificationPreferences(student_id=student_id)
        session.add(stored)
    stored.reminder_lead_minutes = data.reminder_lead_minutes
    stored.quiet_hours_start = data.quiet_hours_start
    stored.quiet_hours_end = data.quiet_hours_end
    stored.enabled = data.enabled
    session.commit()
    return get_preferences(session, student_id)


def in_quiet_hours(local_time: time, preferences: NotificationPreferencesResponse) -> bool:
    """Quiet hours may span midnight (22:00-06:00). Equal start and end means none."""
    start, end = preferences.quiet_hours_start, preferences.quiet_hours_end
    if start == end:
        return False
    if start < end:
        return start <= local_time < end
    return local_time >= start or local_time < end


def _process_missed(
    session: Session,
    student_id: str,
    missed: list[StudyTask],
    preferences: NotificationPreferencesResponse,
    existing_keys: set[str],
    zone: ZoneInfo,
    now: datetime,
) -> None:
    """Mark untouched overdue sessions missed and re-plan each plan once."""
    by_plan: dict[UUID, list[StudyTask]] = defaultdict(list)
    for task in missed:
        stop_timer_for_outcome(task, now)
        task.status = "missed"
        task.actual_duration_min = None
        task.outcome_recorded_at = now
        by_plan[task.plan_id].append(task)
    session.flush()

    for plan_id, tasks in by_plan.items():
        moved_to = _replan_missed(session, student_id, plan_id, tasks, zone, now)
        for task in tasks:
            ended = task.start_at + timedelta(minutes=task.duration_min)
            if not preferences.enabled or now - ended > timedelta(hours=MISSED_ALERT_MAX_AGE_HOURS):
                continue
            new_start = moved_to.get(task.id)
            message = f"No worries, you missed {_topic_name(task)} at {_clock(task.start_at, zone)}. " + (
                f"We've moved it to {_day_clock(new_start, zone)}."
                if new_start is not None
                else "There was no free slot left in this study window."
            )
            _add_once(
                session,
                existing_keys,
                Notification(
                    student_id=student_id,
                    type="missed",
                    title="Missed session moved" if new_start is not None else "Missed session",
                    message=message,
                    task_id=task.id,
                    action=(
                        {"kind": "open_plan", "label": "See my plan"}
                        if new_start is not None
                        else {"kind": "reschedule", "label": "Find a new time", "plan_id": str(plan_id)}
                    ),
                    dedupe_key=f"missed:{task.id}",
                    created_at=now,
                ),
            )


def _replan_missed(
    session: Session,
    student_id: str,
    plan_id: UUID,
    tasks: list[StudyTask],
    zone: ZoneInfo,
    now: datetime,
) -> dict[UUID, datetime]:
    """Run the existing re-planner once for all missed sessions of a plan."""
    plan = session.get(StudyPlan, plan_id)
    if plan is None:
        return {}
    durations: dict[str, int] = defaultdict(int)
    origins: dict[str, Any] = {}
    for task in tasks:
        durations[task.topic_id] += task.duration_min
        origins.setdefault(task.topic_id, task.id)
    priorities = {
        item["topic_id"]: float(item["priority"]) for item in plan.constraints.get("priorities", [])
    }
    try:
        schedule = generate_plan_schedule(
            session,
            student_id,
            plan_id,
            horizon_days=rescheduling_horizon_days(plan, now.astimezone(zone).date()),
            now=now,
            duration_overrides=dict(durations),
            priority_overrides={
                topic_id: min(priorities.get(topic_id, 0.0) + 0.25, 1.0) for topic_id in durations
            },
            replanned_from=origins,
            keep_existing=True,
        )
    except PlanningError:
        return {}
    session.add(
        ReplanLog(
            student_id=student_id,
            plan_id=plan_id,
            reason="Untouched sessions marked missed after the grace period and rescheduled.",
            changes=[
                {
                    "missed_task_ids": [str(task.id) for task in tasks],
                    "minutes_by_topic": dict(durations),
                    "schedule_created": len(schedule.tasks),
                    "infeasible": schedule.infeasible,
                }
            ],
        )
    )
    first_new_start: dict[str, datetime] = {}
    for item in schedule.tasks:
        if item.topic_id in durations and item.topic_id not in first_new_start:
            first_new_start[item.topic_id] = item.start_at
    return {
        task.id: first_new_start[task.topic_id]
        for task in tasks
        if task.topic_id in first_new_start
    }


def _clear_stale_reminders(session: Session, student_id: str, now: datetime) -> None:
    """Clear alerts that no longer point at anything useful.

    * A reminder is only useful before its session starts.
    * A reminder or missed alert whose session was deleted (for example
      because the plan was deleted or replaced) is cleared, so a student
      without a plan never sees alerts about sessions that no longer exist.
    """
    unread = session.scalars(
        select(Notification).where(
            Notification.student_id == student_id,
            Notification.type.in_(("reminder", "missed")),
            Notification.read_at.is_(None),
        )
    ).all()
    for notification in unread:
        if notification.type not in {"reminder", "missed"}:
            continue
        task = session.get(StudyTask, notification.task_id) if notification.task_id else None
        if task is None:
            notification.read_at = now
        elif notification.type == "reminder" and (task.status != "planned" or task.start_at <= now):
            notification.read_at = now


def _add_once(session: Session, existing_keys: set[str], notification: Notification) -> None:
    if notification.dedupe_key in existing_keys:
        return
    existing_keys.add(notification.dedupe_key)
    session.add(notification)


def student_zone(session: Session, student_id: str) -> ZoneInfo:
    """Timezone of the student's latest plan (Asia/Colombo by default)."""
    plan = session.scalars(
        select(StudyPlan).where(StudyPlan.student_id == student_id).order_by(StudyPlan.created_at.desc())
    ).first()
    name = (getattr(plan, "constraints", None) or {}).get("timezone", "Asia/Colombo")
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, TypeError):
        return ZoneInfo("Asia/Colombo")


def _topic_name(task: StudyTask) -> str:
    details = getattr(task, "reason_details", None) or {}
    if details.get("sub_topic"):
        return str(details["sub_topic"])
    return str(details.get("topic") or task.topic_id)


def _clock(moment: datetime, zone: ZoneInfo) -> str:
    return moment.astimezone(zone).strftime("%I:%M %p").lstrip("0")


def _day_clock(moment: datetime, zone: ZoneInfo) -> str:
    local = moment.astimezone(zone)
    return f"{local.strftime('%a')} {local.day} {local.strftime('%b')} at {_clock(moment, zone)}"


def _now(now: datetime | None) -> datetime:
    return (now or datetime.now(UTC)).astimezone(UTC)
