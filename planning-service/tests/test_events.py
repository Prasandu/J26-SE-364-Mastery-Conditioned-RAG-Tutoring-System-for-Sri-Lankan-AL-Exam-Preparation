from collections.abc import Generator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from app.models import RawEvent, Topic, TopicEvidence
from app.security import require_api_key


class FakeSession:
    def __init__(self) -> None:
        self.events: dict[str, RawEvent] = {}
        self.topics = {"chem-u1", "chem-u2"}
        self.evidence: list[TopicEvidence] = []
        self.commits = 0

    def get(self, model: type, key: Any) -> Any:
        if model is RawEvent:
            return self.events.get(key)
        if model is Topic:
            return Topic(id=key, name=key) if key in self.topics else None
        return None

    def add(self, record: Any) -> None:
        if isinstance(record, RawEvent):
            self.events[record.event_id] = record
        elif isinstance(record, TopicEvidence):
            self.evidence.append(record)

    def flush(self) -> None:
        return None

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        return None


@pytest.fixture
def session() -> FakeSession:
    return FakeSession()


@pytest.fixture
def client(session: FakeSession) -> Generator[TestClient]:
    app.dependency_overrides[require_api_key] = lambda: None
    app.dependency_overrides[get_db] = lambda: session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def skip_mastery_recompute(monkeypatch: pytest.MonkeyPatch) -> list[tuple[Any, ...]]:
    calls: list[tuple[Any, ...]] = []
    monkeypatch.setattr(
        "app.services.event_ingestion.recompute_for",
        lambda *args: calls.append(args),
    )
    return calls


def assessment_payload(
    *,
    event_id: str = "paper-001",
    topic_id: str = "chem-u1",
) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "student_id": "mock-student-01",
        "occurred_at": datetime(2026, 10, 12, 9, 0, tzinfo=UTC).isoformat(),
        "evidence": [
            {
                "topic_id": topic_id,
                "score": 7,
                "max_score": 10,
                "difficulty": 0.7,
                "confidence": 0.8,
            }
        ],
    }


def test_assessment_event_is_persisted_with_evidence(
    client: TestClient,
    session: FakeSession,
    skip_mastery_recompute: list[tuple[Any, ...]],
) -> None:
    response = client.post(
        "/api/v1/events/assessment",
        json=assessment_payload(),
    )

    assert response.status_code == 202
    assert response.json() == {
        "event_id": "paper-001",
        "accepted": True,
        "duplicate": False,
        "evidence_count": 1,
    }
    assert session.events["paper-001"].event_type == "assessment"
    assert len(session.evidence) == 1
    assert session.commits == 1
    assert skip_mastery_recompute == [(session, "mock-student-01", ["chem-u1"])]


def test_duplicate_assessment_event_is_idempotent(client: TestClient, session: FakeSession) -> None:
    payload = assessment_payload()
    first = client.post("/api/v1/events/assessment", json=payload)
    duplicate = client.post("/api/v1/events/assessment", json=payload)

    assert first.status_code == 202
    assert duplicate.status_code == 202
    assert duplicate.json()["duplicate"] is True
    assert len(session.events) == 1
    assert len(session.evidence) == 1
    assert session.commits == 1


def test_event_id_cannot_be_reused_for_different_payload(client: TestClient) -> None:
    client.post("/api/v1/events/assessment", json=assessment_payload())
    response = client.post(
        "/api/v1/events/assessment",
        json=assessment_payload(topic_id="chem-u2"),
    )

    assert response.status_code == 409


def test_unknown_topic_is_rejected(client: TestClient, session: FakeSession) -> None:
    response = client.post(
        "/api/v1/events/assessment",
        json=assessment_payload(topic_id="CHEM.UNKNOWN"),
    )

    assert response.status_code == 422
    assert "Unknown topic_ids" in response.json()["detail"]
    assert session.events == {}


def test_module_completion_creates_evidence(client: TestClient, session: FakeSession) -> None:
    response = client.post(
        "/api/v1/events/module-completion",
        json={
            "event_id": "module-001",
            "student_id": "mock-student-01",
            "topic_id": "chem-u1",
            "completed_at": datetime(2026, 10, 12, 10, 0, tzinfo=UTC).isoformat(),
        },
    )

    assert response.status_code == 202
    assert session.events["module-001"].event_type == "module_completion"
    assert len(session.evidence) == 1
    assert session.evidence[0].score == 1
    assert session.evidence[0].max_score == 1


def test_missing_api_key_is_rejected() -> None:
    response = TestClient(app).post(
        "/api/v1/events/assessment",
        json=assessment_payload(),
    )

    assert response.status_code == 401


def test_bad_api_key_is_rejected() -> None:
    app.dependency_overrides.clear()
    response = TestClient(app).post(
        "/api/v1/events/assessment",
        headers={"X-API-Key": "incorrect"},
        json=assessment_payload(),
    )

    assert response.status_code == 401


def test_invalid_evidence_is_rejected_by_schema(client: TestClient) -> None:
    payload = assessment_payload()
    payload["evidence"][0]["score"] = 11
    response = client.post("/api/v1/events/assessment", json=payload)

    assert response.status_code == 422
    assert "score must not exceed max_score" in str(response.json())


def test_non_finite_score_is_rejected_by_schema(client: TestClient) -> None:
    payload = assessment_payload()
    payload["evidence"][0]["score"] = "NaN"
    response = client.post("/api/v1/events/assessment", json=payload)

    assert response.status_code == 422
