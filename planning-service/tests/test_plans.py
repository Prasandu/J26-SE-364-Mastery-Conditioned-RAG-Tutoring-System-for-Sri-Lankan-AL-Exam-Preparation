from collections.abc import Generator
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from app.models import AvailabilitySlot, LearnerTopicState, ReplanLog, StudyPlan, StudyTask, Topic
from app.schemas.tasks import ScheduledTaskResponse, ScheduleResponse
from app.security import get_student_id


class Result:
    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def all(self) -> list[Any]:
        return self.values


class FakeSession:
    def __init__(self, shared: "FakeSession | None" = None) -> None:
        self.topics = shared.topics if shared else {
            "chem-u1": SimpleNamespace(id="chem-u1", exam_weight=0.6),
            "chem-u2": SimpleNamespace(id="chem-u2", exam_weight=0.8),
        }
        self.plans = shared.plans if shared else {}
        self.states = shared.states if shared else []
        self.slots = shared.slots if shared else []
        self.logs = shared.logs if shared else []
        self.tasks = shared.tasks if shared else []
        self.plan_queries = shared.plan_queries if shared else []
        self.commits = 0

    def get(self, model: type, key: Any) -> Any:
        if model is Topic:
            return self.topics.get(key)
        if model is StudyPlan:
            return self.plans.get(key)
        if model is StudyTask:
            return next((task for task in self.tasks if task.id == key), None)
        return None

    def add(self, record: Any) -> None:
        if isinstance(record, StudyPlan):
            record.id = record.id or uuid4()
            record.created_at = record.created_at or datetime.now(UTC)
            self.plans[record.id] = record
        elif isinstance(record, AvailabilitySlot):
            self.slots.append(record)
        elif isinstance(record, ReplanLog):
            self.logs.append(record)
        elif isinstance(record, StudyTask):
            self.tasks.append(record)

    def flush(self) -> None:
        return None

    def scalars(self, statement: Any) -> Result:
        model = statement.column_descriptions[0]["entity"]
        if model is StudyPlan:
            self.plan_queries.append(statement)
            plans = [plan for plan in self.plans.values() if plan.student_id == "student-1"]
            return Result(sorted(plans, key=lambda plan: (plan.created_at, str(plan.id)), reverse=True))
        if model is LearnerTopicState:
            return Result([state for state in self.states if state.student_id == "student-1"])
        if model is AvailabilitySlot:
            return Result(list(self.slots))
        if model is StudyTask:
            return Result(
                sorted(
                    (task for task in self.tasks if task.student_id == "student-1"),
                    key=lambda task: (task.start_at, str(task.id)),
                )
            )
        return Result([])

    def delete(self, record: Any) -> None:
        self.slots.remove(record)

    def commit(self) -> None:
        self.commits += 1


@pytest.fixture
def session() -> FakeSession:
    return FakeSession()


@pytest.fixture
def client(session: FakeSession) -> Generator[TestClient]:
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_student_id] = lambda: "student-1"
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def valid_plan(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "mode": "manual",
        "exam_date": (date.today() + timedelta(days=60)).isoformat(),
        "target_grade": "A",
        "topics": ["chem-u1"],
        "availability_windows": [
            {"weekday": 1, "start_time": "16:00", "end_time": "18:00"},
            {"weekday": 5, "start_time": "09:00", "end_time": "11:00"},
        ],
        "max_session_minutes": 60,
        "max_daily_minutes": 120,
        "preferred_times": ["16:00"],
        "fixed_commitments": [
            {
                "label": "Tuition",
                "start_at": datetime.now(UTC).replace(hour=18, minute=0).isoformat(),
                "end_at": datetime.now(UTC).replace(hour=19, minute=0).isoformat(),
            }
        ],
        "priorities": [{"topic_id": "chem-u1", "priority": 0.8}],
    }
    data.update(overrides)
    return data


def test_create_plan_persists_constraints_slots_and_audit_log(
    client: TestClient,
    session: FakeSession,
) -> None:
    response = client.post("/api/v1/plans", json=valid_plan())

    assert response.status_code == 201
    assert response.json()["mode"] == "manual"
    assert response.json()["constraints"]["priorities"] == [
        {
            "topic_id": "chem-u1",
            "priority": 0.8,
            "reason": "Manually prioritized by the student.",
        }
    ]
    assert len(session.slots) == 2
    assert len(session.logs) == 1
    assert session.commits == 1
    assert response.json()["achievability"]["status"] in {
        "on_track",
        "stretch",
        "out_of_reach",
    }
    assert response.json()["achievability"]["message"].startswith("Estimate:")


def test_manual_mode_uses_only_selected_topics(client: TestClient) -> None:
    response = client.post(
        "/api/v1/plans",
        json=valid_plan(topics=["chem-u2"], priorities=[]),
    )

    assert response.status_code == 201
    assert response.json()["constraints"]["priorities"] == [
        {
            "topic_id": "chem-u2",
            "priority": 0.5,
            "reason": "Manually prioritized by the student.",
        }
    ]


def test_predicted_mode_uses_stored_mastery(
    client: TestClient,
    session: FakeSession,
) -> None:
    session.states.append(
        LearnerTopicState(
            student_id="student-1",
            topic_id="chem-u1",
            mastery=0.4,
            trend=-0.2,
            error_rate=0.6,
            weak_score=0.7,
        )
    )
    response = client.post(
        "/api/v1/plans",
        json=valid_plan(mode="predicted", topics=["chem-u1"], priorities=[]),
    )

    assert response.status_code == 201
    priority = response.json()["constraints"]["priorities"][0]
    assert priority["topic_id"] == "chem-u1"
    assert priority["mastery"] == 0.4
    assert priority["priority"] > 0
    assert priority["reason"]


def test_predicted_mode_requires_mastery_data(client: TestClient) -> None:
    response = client.post(
        "/api/v1/plans",
        json=valid_plan(mode="predicted", priorities=[]),
    )

    assert response.status_code == 409


def test_unknown_topic_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/plans",
        json=valid_plan(topics=["chem-unknown"], priorities=[]),
    )

    assert response.status_code == 422
    assert "Unknown topic_ids" in response.json()["detail"]


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"exam_date": date.today().isoformat()}, "future"),
        ({"max_session_minutes": 10}, "max_session_minutes"),
        (
            {
                "availability_windows": [
                    {"weekday": 1, "start_time": "16:00", "end_time": "18:00"},
                    {"weekday": 1, "start_time": "17:00", "end_time": "19:00"},
                ]
            },
            "overlap",
        ),
        (
            {
                "topics": ["chem-u1"],
                "priorities": [{"topic_id": "chem-u2", "priority": 0.7}],
            },
            "only refer to selected topics",
        ),
    ],
)
def test_invalid_plan_inputs_are_rejected(
    client: TestClient,
    overrides: dict[str, Any],
    message: str,
) -> None:
    response = client.post("/api/v1/plans", json=valid_plan(**overrides))

    assert response.status_code == 422
    assert message in str(response.json())


def test_get_lists_only_authenticated_students_plans(
    client: TestClient,
    session: FakeSession,
) -> None:
    created = client.post("/api/v1/plans", json=valid_plan())
    session.plans[UUID(created.json()["id"])].student_id = "other-student"

    response = client.get("/api/v1/plans")

    assert response.status_code == 200
    assert response.json() == {"plans": []}


def test_new_request_returns_latest_created_plan_first(
    client: TestClient,
    session: FakeSession,
) -> None:
    def create_new_session() -> Generator[FakeSession]:
        yield FakeSession(session)

    app.dependency_overrides[get_db] = create_new_session
    older = client.post("/api/v1/plans", json=valid_plan())
    newer = client.post(
        "/api/v1/plans",
        json=valid_plan(target_grade="B"),
    )
    older_plan = session.plans[UUID(older.json()["id"])]
    newer_plan = session.plans[UUID(newer.json()["id"])]
    older_plan.created_at = datetime(2026, 10, 15, tzinfo=UTC)
    newer_plan.created_at = datetime(2026, 10, 16, tzinfo=UTC)

    response = client.get("/api/v1/plans")

    assert response.status_code == 200
    assert [plan["id"] for plan in response.json()["plans"]] == [
        newer.json()["id"],
        older.json()["id"],
    ]
    assert response.json()["plans"][0]["target_grade"] == "B"
    assert "ORDER BY planning.study_plans.created_at DESC" in str(session.plan_queries[-1])


def test_generated_schedule_is_available_in_a_new_session(
    client: TestClient,
    session: FakeSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created = client.post("/api/v1/plans", json=valid_plan())
    plan_id = UUID(created.json()["id"])
    task_id = uuid4()
    start_at = datetime(2026, 10, 17, 16, 0, tzinfo=UTC)

    def generate_schedule(
        db_session: FakeSession,
        student_id: str,
        selected_plan_id: UUID,
        *,
        horizon_days: int,
    ) -> ScheduleResponse:
        assert student_id == "student-1"
        assert selected_plan_id == plan_id
        assert horizon_days == 14
        db_session.add(
            StudyTask(
                id=task_id,
                plan_id=plan_id,
                student_id=student_id,
                topic_id="chem-u1",
                activity="practice",
                start_at=start_at,
                duration_min=45,
                status="planned",
                reason="Review this topic.",
            )
        )
        db_session.commit()
        return ScheduleResponse(
            tasks=[
                ScheduledTaskResponse(
                    id=task_id,
                    topic_id="chem-u1",
                    activity="practice",
                    start_at=start_at,
                    duration_min=45,
                    status="planned",
                    reason="Review this topic.",
                    priority=0.8,
                )
            ],
            infeasible=False,
            shortfall_minutes=0,
            unscheduled_minutes={},
        )

    monkeypatch.setattr("app.api.plans.generate_and_commit_schedule", generate_schedule)
    generated = client.post(
        f"/api/v1/plans/{plan_id}/generate",
        json={"horizon_days": 14},
    )
    assert generated.status_code == 200
    assert generated.json()["tasks"][0]["id"] == str(task_id)

    app.dependency_overrides[get_db] = lambda: FakeSession(session)
    restored_schedule = client.get(f"/api/v1/plans/{plan_id}/schedule")

    assert restored_schedule.status_code == 200
    assert [task["id"] for task in restored_schedule.json()["tasks"]] == [str(task_id)]
    assert restored_schedule.json()["tasks"][0]["priority"] == 0.8


def test_update_plan_logs_constraint_edits(
    client: TestClient,
    session: FakeSession,
) -> None:
    created = client.post("/api/v1/plans", json=valid_plan())
    plan_id = created.json()["id"]
    updated = client.put(
        f"/api/v1/plans/{plan_id}",
        json=valid_plan(target_grade="B", max_session_minutes=90),
    )

    assert updated.status_code == 200
    assert updated.json()["target_grade"] == "B"
    assert len(session.logs) == 2
    assert session.logs[-1].changes
    assert session.logs[-1].reason == "Study plan constraints updated."
    assert session.commits == 2


def test_student_cannot_read_another_students_plan(
    client: TestClient,
    session: FakeSession,
) -> None:
    created = client.post("/api/v1/plans", json=valid_plan())
    session.plans[UUID(created.json()["id"])].student_id = "other-student"

    response = client.get(f"/api/v1/plans/{created.json()['id']}")

    assert response.status_code == 404
