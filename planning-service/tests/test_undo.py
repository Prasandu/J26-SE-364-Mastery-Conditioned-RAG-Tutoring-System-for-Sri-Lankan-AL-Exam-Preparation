from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest

from app.errors import Conflict, NotFound
from app.main import app
from app.models import Notification, ReplanLog, StudyPlan, StudyTask
from app.services.task_outcomes import undo_task_outcome
from app.services.task_views import scheduled_task_response

NOW = datetime(2026, 10, 20, 12, 0, tzinfo=UTC)
PLAN = SimpleNamespace(id=uuid4(), constraints={"priorities": [{"topic_id": "ketones", "priority": 0.6}]})


def make_task(status: str = "missed", *, recorded_hours_ago: float | None = 1, **overrides: Any):
    values: dict[str, Any] = {
        "id": uuid4(),
        "plan_id": PLAN.id,
        "student_id": "student-1",
        "topic_id": "ketones",
        "activity": "error_review",
        "start_at": NOW - timedelta(hours=3),
        "duration_min": 60,
        "status": status,
        "reason": "",
        "reason_details": None,
        "steps": [],
        "replanned_from": None,
        "actual_duration_min": 40 if status == "partial" else None,
        "score_before": None,
        "score_after": None,
        "timer_state": "idle",
        "started_at": None,
        "paused_at": None,
        "paused_total_sec": 0,
        "outcome_recorded_at": (
            NOW - timedelta(hours=recorded_hours_ago) if recorded_hours_ago is not None else None
        ),
        "undone_at": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class Scalars:
    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def all(self) -> list[Any]:
        return self.values


class FakeSession:
    def __init__(self, *tasks: Any, notifications: list[Any] | None = None) -> None:
        self.tasks = list(tasks)
        self.notifications = notifications or []
        self.deleted: list[Any] = []
        self.logs: list[Any] = []
        self.commits = 0

    def get(self, model: type, key: Any) -> Any:
        if model is StudyTask:
            return next((task for task in self.tasks if task.id == key), None)
        if model is StudyPlan:
            return PLAN
        return None

    def scalars(self, statement: Any) -> Scalars:
        entity = statement.column_descriptions[0]["entity"]
        if entity is StudyTask:
            return Scalars(
                [task for task in self.tasks if task.replanned_from is not None and task.status == "planned"]
            )
        if entity is Notification:
            return Scalars([item for item in self.notifications if item.read_at is None])
        return Scalars([])

    def delete(self, record: Any) -> None:
        self.deleted.append(record)

    def add(self, record: Any) -> None:
        if isinstance(record, ReplanLog):
            self.logs.append(record)

    def commit(self) -> None:
        self.commits += 1


def test_undo_returns_a_missed_session_to_planned_and_removes_its_makeup() -> None:
    missed = make_task("missed")
    makeup = make_task(
        "planned",
        replanned_from=missed.id,
        start_at=NOW + timedelta(days=1),
        recorded_hours_ago=None,
    )
    alert = SimpleNamespace(task_id=missed.id, read_at=None)
    session = FakeSession(missed, makeup, notifications=[alert])

    result = undo_task_outcome(session, "student-1", missed.id, now=NOW)  # type: ignore[arg-type]

    assert missed.status == "planned"
    assert missed.undone_at == NOW and missed.outcome_recorded_at is None
    assert result.removed_task_ids == [makeup.id]
    assert session.deleted == [makeup]
    assert alert.read_at == NOW
    assert result.task.status == "planned" and not result.task.can_undo
    assert session.logs[0].changes[0]["previous_status"] == "missed"


def test_undo_clears_recorded_minutes_and_scores() -> None:
    partial = make_task("partial", score_before=0.4, score_after=0.6)

    undo_task_outcome(FakeSession(partial), "student-1", partial.id, now=NOW)  # type: ignore[arg-type]

    assert partial.actual_duration_min is None
    assert partial.score_before is None and partial.score_after is None


def test_makeup_session_already_being_timed_is_kept() -> None:
    missed = make_task("missed")
    makeup = make_task(
        "planned",
        replanned_from=missed.id,
        timer_state="running",
        recorded_hours_ago=None,
    )
    session = FakeSession(missed, makeup)

    result = undo_task_outcome(session, "student-1", missed.id, now=NOW)  # type: ignore[arg-type]

    assert result.removed_task_ids == [] and session.deleted == []


def test_undo_is_only_allowed_within_24_hours_for_own_recorded_sessions() -> None:
    old = make_task("completed", recorded_hours_ago=25)
    planned = make_task("planned", recorded_hours_ago=None)
    other = make_task("missed", student_id="student-2")
    session = FakeSession(old, planned, other)

    with pytest.raises(Conflict, match="24 hours"):
        undo_task_outcome(session, "student-1", old.id, now=NOW)  # type: ignore[arg-type]
    with pytest.raises(Conflict, match="no recorded outcome"):
        undo_task_outcome(session, "student-1", planned.id, now=NOW)  # type: ignore[arg-type]
    with pytest.raises(NotFound):
        undo_task_outcome(session, "student-1", other.id, now=NOW)  # type: ignore[arg-type]
    assert old.status == "completed" and session.commits == 0


def test_can_undo_flag_follows_the_window() -> None:
    assert scheduled_task_response(make_task("missed", recorded_hours_ago=2), 0.6, now=NOW).can_undo
    assert not scheduled_task_response(make_task("missed", recorded_hours_ago=30), 0.6, now=NOW).can_undo
    assert not scheduled_task_response(make_task("planned", recorded_hours_ago=None), 0.6, now=NOW).can_undo
    # Older rows without a recorded time fall back to the session end (2 hours ago here).
    assert scheduled_task_response(make_task("completed", recorded_hours_ago=None), 0.6, now=NOW).can_undo


def test_undo_route_is_registered() -> None:
    assert "/api/v1/tasks/{task_id}/undo" in app.openapi()["paths"]


def test_task_response_reports_the_minutes_actually_studied() -> None:
    partial = scheduled_task_response(make_task("partial"), 0.6, now=NOW)
    planned = scheduled_task_response(make_task("planned", recorded_hours_ago=None), 0.6, now=NOW)

    assert partial.actual_duration_min == 40 and partial.duration_min == 60
    assert planned.actual_duration_min is None
