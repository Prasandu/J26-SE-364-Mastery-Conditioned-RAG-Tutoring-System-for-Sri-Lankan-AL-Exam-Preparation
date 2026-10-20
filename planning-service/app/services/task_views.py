"""Shared conversion of stored study tasks into API responses."""

from datetime import UTC, datetime, timedelta
from typing import Any

from app.schemas.tasks import ScheduledTaskResponse
from app.services.weights import UNDO_WINDOW_HOURS


def elapsed_seconds(task: Any, now: datetime) -> int:
    """Active timer seconds so far, excluding pauses, from server timestamps only."""
    started_at = getattr(task, "started_at", None)
    if started_at is None:
        return 0
    state = getattr(task, "timer_state", "idle") or "idle"
    paused_at = getattr(task, "paused_at", None)
    end = paused_at if state in {"paused", "finished"} and paused_at is not None else now
    seconds = (end - started_at).total_seconds() - (getattr(task, "paused_total_sec", 0) or 0)
    return max(int(seconds), 0)


def can_undo_outcome(task: Any, now: datetime) -> bool:
    """A recorded outcome can be undone for ``UNDO_WINDOW_HOURS``.

    Older rows without ``outcome_recorded_at`` fall back to the session's end.
    """
    if getattr(task, "status", "planned") == "planned":
        return False
    recorded = getattr(task, "outcome_recorded_at", None)
    if recorded is None:
        recorded = task.start_at + timedelta(minutes=task.duration_min)
    return now - recorded <= timedelta(hours=UNDO_WINDOW_HOURS)


def scheduled_task_response(
    task: Any,
    priority: float,
    *,
    now: datetime | None = None,
) -> ScheduledTaskResponse:
    current = (now or datetime.now(UTC)).astimezone(UTC)
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
        timer_state=getattr(task, "timer_state", None) or "idle",
        timer_started_at=getattr(task, "started_at", None),
        timer_elapsed_sec=elapsed_seconds(task, current),
        can_undo=can_undo_outcome(task, current),
    )
