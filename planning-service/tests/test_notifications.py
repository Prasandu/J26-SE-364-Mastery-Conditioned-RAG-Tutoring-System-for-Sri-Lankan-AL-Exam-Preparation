from datetime import UTC, datetime, time, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest

from app.errors import NotFound
from app.main import app
from app.models import (
    Notification,
    NotificationPreferences,
    ReplanLog,
    StudyPlan,
    StudyTask,
)
from app.schemas.notifications import NotificationPreferencesUpdate
from app.schemas.tasks import ScheduledTaskResponse, ScheduleResponse
from app.services import notifications
from app.services.notifications import (
    DEFAULT_PREFERENCES,
    get_preferences,
    in_quiet_hours,
    list_notifications,
    mark_read,
    update_preferences,
)

# 16:00 in Colombo (UTC+5:30)
NOW = datetime(2026, 10, 20, 10, 30, tzinfo=UTC)
PLAN = SimpleNamespace(
    id=uuid4(),
    student_id="student-1",
    created_at=NOW - timedelta(days=5),
    constraints={"timezone": "Asia/Colombo", "priorities": [{"topic_id": "ketones", "priority": 0.6}]},
)


def make_task(start: datetime, *, duration: int = 60, timer_state: str = "idle", topic: str = "ketones"):
    return SimpleNamespace(
        id=uuid4(),
        plan_id=PLAN.id,
        student_id="student-1",
        topic_id=topic,
        activity="error_review",
        start_at=start,
        duration_min=duration,
        status="planned",
        reason="",
        reason_details={"topic": "Carbonyl compounds", "sub_topic": "Ketones"},
        steps=[],
        replanned_from=None,
        actual_duration_min=None,
        timer_state=timer_state,
        started_at=None,
        paused_at=None,
        paused_total_sec=0,
    )


class Scalars:
    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def all(self) -> list[Any]:
        return self.values

    def first(self) -> Any:
        return self.values[0] if self.values else None


class FakeSession:
    """Stores records in memory; queries are answered by entity, filters applied in code."""

    def __init__(self, *tasks: SimpleNamespace, preferences: Any = None) -> None:
        self.tasks = list(tasks)
        self.notifications: list[Any] = []
        self.logs: list[Any] = []
        self.preferences = preferences
        self.commits = 0

    def get(self, model: type, key: Any) -> Any:
        if model is StudyPlan:
            return PLAN if key == PLAN.id else None
        if model is StudyTask:
            return next((task for task in self.tasks if task.id == key), None)
        if model is Notification:
            return next((item for item in self.notifications if item.id == key), None)
        if model is NotificationPreferences:
            return self.preferences
        return None

    def scalars(self, statement: Any) -> Scalars:
        description = statement.column_descriptions[0]
        entity = description["entity"]
        if entity is Notification and description["name"] == "dedupe_key":
            return Scalars([item.dedupe_key for item in self.notifications])
        if entity is Notification:
            unread = [item for item in self.notifications if item.read_at is None]
            return Scalars(sorted(unread, key=lambda item: item.created_at, reverse=True))
        if entity is StudyTask:
            return Scalars(
                [task for task in self.tasks if task.status == "planned" and task.timer_state == "idle"]
            )
        if entity is StudyPlan:
            return Scalars([PLAN])
        return Scalars([])

    def add(self, record: Any) -> None:
        if isinstance(record, Notification):
            record.id = record.id or uuid4()
            record.read_at = None
            self.notifications.append(record)
        elif isinstance(record, ReplanLog):
            self.logs.append(record)
        elif isinstance(record, NotificationPreferences):
            self.preferences = record

    def flush(self) -> None:
        return None

    def commit(self) -> None:
        self.commits += 1


@pytest.fixture
def replanner(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Stand-in for the existing re-planner; places the missed topic tomorrow at 17:00 Colombo."""
    calls: dict[str, Any] = {"count": 0, "new_start": datetime(2026, 10, 21, 11, 30, tzinfo=UTC)}

    def fake_generate(_session: Any, _student_id: str, _plan_id: Any, **kwargs: Any) -> ScheduleResponse:
        calls["count"] += 1
        calls["kwargs"] = kwargs
        tasks = (
            [
                ScheduledTaskResponse(
                    topic_id=topic_id,
                    activity="error_review",
                    start_at=calls["new_start"],
                    duration_min=60,
                    reason="",
                )
                for topic_id in kwargs["duration_overrides"]
            ]
            if calls["new_start"] is not None
            else []
        )
        return ScheduleResponse(
            tasks=tasks,
            infeasible=not tasks,
            shortfall_minutes=0,
            unscheduled_minutes={},
        )

    monkeypatch.setattr(notifications, "generate_plan_schedule", fake_generate)
    return calls


def test_reminder_is_created_once_within_the_lead_time(replanner: dict[str, Any]) -> None:
    soon = make_task(NOW + timedelta(minutes=8))
    later = make_task(NOW + timedelta(minutes=25))
    session = FakeSession(soon, later)

    first = list_notifications(session, "student-1", now=NOW)  # type: ignore[arg-type]
    second = list_notifications(session, "student-1", now=NOW + timedelta(minutes=1))  # type: ignore[arg-type]

    assert [item.type for item in first.notifications] == ["reminder"]
    assert first.notifications[0].task_id == soon.id
    assert "Ketones starts at 4:08 PM" in first.notifications[0].message
    assert second.unread_count == 1  # dedupe: no second reminder for the same session
    assert len(session.notifications) == 1
    assert replanner["count"] == 0


def test_reminders_are_cleared_once_the_session_starts() -> None:
    task = make_task(NOW + timedelta(minutes=5))
    session = FakeSession(task)
    list_notifications(session, "student-1", now=NOW)  # type: ignore[arg-type]

    after_start = list_notifications(session, "student-1", now=NOW + timedelta(minutes=6))  # type: ignore[arg-type]

    assert after_start.unread_count == 0
    assert session.notifications[0].read_at is not None


def test_untouched_overdue_session_is_marked_missed_rescheduled_and_explained(
    replanner: dict[str, Any],
) -> None:
    task = make_task(NOW - timedelta(minutes=91))  # ended 31 minutes ago
    session = FakeSession(task)

    result = list_notifications(session, "student-1", now=NOW)  # type: ignore[arg-type]

    assert task.status == "missed"
    assert replanner["kwargs"]["duration_overrides"] == {"ketones": 60}
    assert replanner["kwargs"]["replanned_from"] == {"ketones": task.id}
    assert replanner["kwargs"]["priority_overrides"] == {"ketones": pytest.approx(0.85)}
    alert = result.notifications[0]
    assert alert.type == "missed"
    assert alert.message == (
        "No worries, you missed Ketones at 2:29 PM. We've moved it to Wed 21 Oct at 5:00 PM."
    )
    assert alert.action is not None and alert.action.kind == "open_plan"
    assert len(session.logs) == 1

    list_notifications(session, "student-1", now=NOW + timedelta(minutes=1))  # type: ignore[arg-type]
    assert len(session.notifications) == 1 and replanner["count"] == 1


def test_missed_session_without_a_free_slot_offers_one_click_reschedule(
    replanner: dict[str, Any],
) -> None:
    replanner["new_start"] = None
    session = FakeSession(make_task(NOW - timedelta(minutes=120)))

    alert = list_notifications(session, "student-1", now=NOW).notifications[0]  # type: ignore[arg-type]

    assert "no free slot" in alert.message
    assert alert.action is not None
    assert alert.action.kind == "reschedule" and alert.action.plan_id == PLAN.id


def test_session_within_grace_or_with_timer_used_is_not_missed(replanner: dict[str, Any]) -> None:
    recent = make_task(NOW - timedelta(minutes=80))  # ended 20 minutes ago, inside the grace period
    timed = make_task(NOW - timedelta(minutes=200), timer_state="finished")
    session = FakeSession(recent, timed)

    list_notifications(session, "student-1", now=NOW)  # type: ignore[arg-type]

    assert recent.status == "planned" and timed.status == "planned"
    assert replanner["count"] == 0


def test_old_overdue_sessions_are_marked_missed_without_an_alert(replanner: dict[str, Any]) -> None:
    old = make_task(NOW - timedelta(days=3))
    session = FakeSession(old)

    result = list_notifications(session, "student-1", now=NOW)  # type: ignore[arg-type]

    assert old.status == "missed"
    assert result.unread_count == 0
    assert replanner["count"] == 1


def test_quiet_hours_create_nothing_and_defer_missed_processing(replanner: dict[str, Any]) -> None:
    late_night = datetime(2026, 10, 20, 17, 45, tzinfo=UTC)  # 23:15 in Colombo
    overdue = make_task(late_night - timedelta(hours=2))
    starting = make_task(late_night + timedelta(minutes=5))
    session = FakeSession(overdue, starting)

    result = list_notifications(session, "student-1", now=late_night)  # type: ignore[arg-type]

    assert result.quiet_hours_active
    assert result.unread_count == 0
    assert overdue.status == "planned" and replanner["count"] == 0


@pytest.mark.parametrize(
    ("local", "start", "end", "quiet"),
    [
        (time(23, 0), time(22, 0), time(6, 0), True),
        (time(5, 59), time(22, 0), time(6, 0), True),
        (time(6, 0), time(22, 0), time(6, 0), False),
        (time(13, 0), time(12, 0), time(14, 0), True),
        (time(14, 0), time(12, 0), time(14, 0), False),
        (time(23, 0), time(22, 0), time(22, 0), False),
    ],
)
def test_quiet_hours_window(local: time, start: time, end: time, quiet: bool) -> None:
    preferences = DEFAULT_PREFERENCES.model_copy(update={"quiet_hours_start": start, "quiet_hours_end": end})

    assert in_quiet_hours(local, preferences) is quiet


def test_at_most_three_unread_alerts_are_shown_newest_first() -> None:
    session = FakeSession()
    for index in range(5):
        session.add(
            Notification(
                student_id="student-1",
                type="info",
                title=f"Info {index}",
                message="Weekly summary.",
                dedupe_key=f"info:{index}",
                created_at=NOW - timedelta(hours=5 - index),
            )
        )

    result = list_notifications(session, "student-1", now=NOW)  # type: ignore[arg-type]

    assert result.unread_count == 5
    assert [item.title for item in result.notifications] == ["Info 4", "Info 3", "Info 2"]


def test_disabled_notifications_still_keep_the_plan_up_to_date(replanner: dict[str, Any]) -> None:
    preferences = SimpleNamespace(
        reminder_lead_minutes=10,
        quiet_hours_start=time(22, 0),
        quiet_hours_end=time(6, 0),
        enabled=False,
    )
    overdue = make_task(NOW - timedelta(minutes=120))
    session = FakeSession(overdue, make_task(NOW + timedelta(minutes=5)), preferences=preferences)

    result = list_notifications(session, "student-1", now=NOW)  # type: ignore[arg-type]

    assert result.unread_count == 0
    assert overdue.status == "missed" and replanner["count"] == 1


def test_mark_read_only_for_own_notifications() -> None:
    session = FakeSession()
    session.add(
        Notification(
            student_id="student-1",
            type="info",
            title="Hi",
            message="Hi",
            dedupe_key="info:1",
            created_at=NOW,
        )
    )
    notification_id = session.notifications[0].id

    result = mark_read(session, "student-1", notification_id, now=NOW)  # type: ignore[arg-type]

    assert result.read_at == NOW
    with pytest.raises(NotFound):
        mark_read(session, "student-2", notification_id, now=NOW)  # type: ignore[arg-type]


def test_preferences_default_and_update() -> None:
    session = FakeSession()

    assert get_preferences(session, "student-1") == DEFAULT_PREFERENCES  # type: ignore[arg-type]
    updated = update_preferences(  # type: ignore[arg-type]
        session,
        "student-1",
        NotificationPreferencesUpdate(
            reminder_lead_minutes=20,
            quiet_hours_start=time(21, 30),
            quiet_hours_end=time(7, 0),
            enabled=True,
        ),
    )

    assert updated.reminder_lead_minutes == 20
    assert updated.quiet_hours_start == time(21, 30)
    with pytest.raises(ValueError):
        NotificationPreferencesUpdate(reminder_lead_minutes=500)


def test_notification_routes_are_registered() -> None:
    paths = app.openapi()["paths"]

    assert "/api/v1/notifications" in paths
    assert "/api/v1/notifications/{notification_id}/read" in paths
    assert {"get", "put"}.issubset(paths["/api/v1/notifications/preferences"])
