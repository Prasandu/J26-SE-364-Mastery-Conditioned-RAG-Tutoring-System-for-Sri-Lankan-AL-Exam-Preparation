from collections.abc import Generator
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from app.models import Paper, Question, RawEvent, Topic, TopicEvidence
from app.security import get_student_id, require_api_key


class FakeSession:
    def __init__(self) -> None:
        self.events: dict[str, RawEvent] = {}
        self.topics = {"chem-u1", "chem-u2"}
        self.evidence: list[TopicEvidence] = []
        self.questions: dict[str, Question] = {}
        self.papers: dict[str, Paper] = {}
        self.commits = 0

    def get(self, model: type, key: Any) -> Any:
        if model is RawEvent:
            return self.events.get(key)
        if model is Topic:
            return Topic(id=key, name=key) if key in self.topics else None
        if model is Question:
            return self.questions.get(key)
        if model is Paper:
            return self.papers.get(key)
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

    def execute(self, _statement: Any) -> Any:
        rows = []
        for evidence in self.evidence:
            question = self.questions.get(evidence.question_id)
            event = self.events[evidence.event_id]
            paper_id = question.paper_id if question is not None else event.paper_id
            rows.append(
                (
                    SimpleNamespace(
                        attempt_id=getattr(evidence, "id", None),
                        student_id=evidence.student_id,
                        question_id=evidence.question_id,
                        topic_id=evidence.topic_id,
                        marks=evidence.score,
                        max_marks=evidence.max_score,
                        attempted_at=evidence.observed_at,
                        paper_id=event.paper_id,
                        paper_year=event.paper_year,
                    ),
                    question,
                    self.papers.get(paper_id),
                )
            )
        return SimpleNamespace(all=lambda: rows)


@pytest.fixture
def session() -> FakeSession:
    return FakeSession()


@pytest.fixture
def client(session: FakeSession) -> Generator[TestClient]:
    app.dependency_overrides[require_api_key] = lambda: None
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_student_id] = lambda: "mock-student-01"
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
    question_id: str | None = None,
    paper_id: str | None = None,
) -> dict[str, Any]:
    evidence = {
        "topic_id": topic_id,
        "score": 7,
        "max_score": 10,
        "difficulty": 0.7,
        "confidence": 0.8,
    }
    if question_id is not None:
        evidence["question_id"] = question_id
    return {
        "event_id": event_id,
        "student_id": "mock-student-01",
        "paper_id": paper_id,
        "occurred_at": datetime(2026, 10, 12, 9, 0, tzinfo=UTC).isoformat(),
        "evidence": [evidence],
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
        "unknown_question_ids": [],
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


def test_unknown_question_is_accepted_and_flagged(
    client: TestClient,
    session: FakeSession,
) -> None:
    response = client.post(
        "/api/v1/events/assessment",
        json=assessment_payload(question_id="not-in-bank", paper_id="AL-CHEM-2024-P1"),
    )

    assert response.status_code == 202
    assert response.json()["accepted"] is True
    assert response.json()["unknown_question_ids"] == ["not-in-bank"]
    assert session.evidence[0].question_id is None
    assert session.events["paper-001"].paper_id == "AL-CHEM-2024-P1"


def test_known_question_links_paper_year_and_allows_multiple_questions_per_topic(
    client: TestClient,
    session: FakeSession,
) -> None:
    session.papers["AL-CHEM-2023-P1"] = SimpleNamespace(
        paper_id="AL-CHEM-2023-P1",
        year=2023,
    )
    for question_id, question_no in (("q-1", "1"), ("q-2", "2")):
        session.questions[question_id] = SimpleNamespace(
            question_id=question_id,
            paper_id="AL-CHEM-2023-P1",
            topic_id="chem-u1",
            question_no=question_no,
            max_marks=10,
        )
    payload = assessment_payload(paper_id="AL-CHEM-2023-P1")
    payload["evidence"].append(
        {
            **payload["evidence"][0],
            "question_id": "q-1",
        }
    )
    payload["evidence"][0]["question_id"] = "q-2"

    response = client.post("/api/v1/events/assessment", json=payload)

    assert response.status_code == 202
    assert response.json()["unknown_question_ids"] == []
    assert [item.question_id for item in session.evidence] == ["q-2", "q-1"]
    assert session.events["paper-001"].paper_year == 2023


def test_topic_history_lists_attempts_across_papers_in_date_order(
    client: TestClient,
    session: FakeSession,
) -> None:
    for year, month in ((2022, 3), (2023, 4), (2024, 5)):
        paper_id = f"paper-{year}"
        question_id = f"question-{year}"
        session.papers[paper_id] = SimpleNamespace(paper_id=paper_id, year=year)
        session.questions[question_id] = SimpleNamespace(
            question_id=question_id,
            paper_id=paper_id,
            question_no="1",
            max_marks=10,
        )
        event_id = f"event-{year}"
        session.events[event_id] = SimpleNamespace(paper_id=paper_id, paper_year=year)
        session.evidence.append(
            SimpleNamespace(
                student_id="mock-student-01",
                topic_id="chem-u1",
                event_id=event_id,
                question_id=question_id,
                score=year - 2015,
                max_score=10,
                observed_at=datetime(year, month, 10, tzinfo=UTC),
            )
        )

    response = client.get("/api/v1/students/me/topic-history/chem-u1")

    assert response.status_code == 200
    attempts = response.json()["attempts"]
    assert [attempt["year"] for attempt in attempts] == [2022, 2023, 2024]
    assert [attempt["paper_id"] for attempt in attempts] == [
        "paper-2022",
        "paper-2023",
        "paper-2024",
    ]
    assert [attempt["marks_awarded"] for attempt in attempts] == [7, 8, 9]
    assert all(attempt["max_marks"] == 10 for attempt in attempts)


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
