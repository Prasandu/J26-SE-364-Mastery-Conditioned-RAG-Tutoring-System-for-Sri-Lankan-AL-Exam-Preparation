from collections.abc import Generator
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from app.models import AvailabilitySlot, LearnerTopicState, ReplanLog, StudyPlan, Topic
from app.security import get_student_id


class Result:
    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def all(self) -> list[Any]:
        return self.values


class FakeSession:
    def __init__(self) -> None:
        self.topics = {
            "chem-u1": SimpleNamespace(id="chem-u1", exam_weight=0.6),
            "chem-u2": SimpleNamespace(id="chem-u2", exam_weight=0.8),
        }
        self.plans: dict[UUID, StudyPlan] = {}
        self.states: list[LearnerTopicState] = []
        self.slots: list[AvailabilitySlot] = []
        self.logs: list[ReplanLog] = []
        self.commits = 0

    def get(self, model: type, key: Any) -> Any:
        if model is Topic:
            return self.topics.get(key)
        if model is StudyPlan:
            return self.plans.get(key)
        return None

    def add(self, record: Any) -> None:
        if isinstance(record, StudyPlan):
            record.id = record.id or uuid4()
            self.plans[record.id] = record
        elif isinstance(record, AvailabilitySlot):
            self.slots.append(record)
        elif isinstance(record, ReplanLog):
            self.logs.append(record)

    def flush(self) -> None:
        return None

    def scalars(self, statement: Any) -> Result:
        model = statement.column_descriptions[0]["entity"]
        if model is StudyPlan:
            return Result([plan for plan in self.plans.values() if plan.student_id == "student-1"])
        if model is LearnerTopicState:
            return Result([state for state in self.states if state.student_id == "student-1"])
        if model is AvailabilitySlot:
            return Result(list(self.slots))
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
