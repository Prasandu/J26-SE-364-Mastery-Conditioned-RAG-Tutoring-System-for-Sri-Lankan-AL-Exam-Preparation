from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, settings
from app.main import app
from app.models import (
    LearnerTopicState,
    Prediction,
    RawEvent,
    StudyPlan,
    StudyTask,
    Topic,
    TopicEvidence,
)
from app.schemas.events import AssessmentEvent
from app.services.event_ingestion import ingest_assessment_event

DEMO_STUDENT_ID = "c75c747b-a322-4bd3-9d03-6a2d3c95d916"


class FakeResults:
    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def all(self) -> list[Any]:
        return self.values


class DemoSession:
    def __init__(self) -> None:
        self.topic = Topic(id="chem-u1", name="Chemical calculations", exam_weight=0.8)
        self.events: dict[str, RawEvent] = {}
        self.evidence: list[TopicEvidence] = []
        self.states: dict[tuple[str, str], LearnerTopicState] = {}
        self.predictions: list[Prediction] = []

    def get(self, model: type, key: Any) -> Any:
        if model is RawEvent:
            return self.events.get(key)
        if model is Topic:
            return self.topic if key == self.topic.id else None
        if model is LearnerTopicState:
            return self.states.get(key)
        return None

    def add(self, record: Any) -> None:
        if isinstance(record, RawEvent):
            self.events[record.event_id] = record
        elif isinstance(record, TopicEvidence):
            self.evidence.append(record)
        elif isinstance(record, LearnerTopicState):
            self.states[(record.student_id, record.topic_id)] = record
        elif isinstance(record, Prediction):
            self.predictions.append(record)

    def execute(self, _statement: Any) -> None:
        return None

    def add_all(self, records: list[Any]) -> None:
        for record in records:
            self.add(record)

    def scalars(self, statement: Any) -> FakeResults:
        model = statement.column_descriptions[0]["entity"]
        values = {
            Topic: [self.topic],
            TopicEvidence: self.evidence,
            LearnerTopicState: list(self.states.values()),
            Prediction: self.predictions,
            StudyPlan: [],
            StudyTask: [],
        }.get(model, [])
        return FakeResults(values)

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        pass

    def rollback(self) -> None:
        pass


def _assessment(event_id: str, score: float, occurred_at: datetime) -> AssessmentEvent:
    return AssessmentEvent(
        event_id=event_id,
        student_id=DEMO_STUDENT_ID,
        occurred_at=occurred_at,
        evidence=[
            {
                "topic_id": "chem-u1",
                "score": score,
                "max_score": 100,
                "difficulty": 0.5,
                "confidence": 0.9,
            }
        ],
    )


def test_demo_routes_are_hidden_when_demo_mode_is_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "demo_mode", False)
    monkeypatch.setattr(settings, "ingest_api_key", "demo-test-key")
    client = TestClient(app)

    missing_key = client.get(f"/api/v1/demo/students/{DEMO_STUDENT_ID}/summary")
    bad_key = client.get(
        f"/api/v1/demo/students/{DEMO_STUDENT_ID}/summary",
        headers={"X-API-Key": "wrong"},
    )
    disabled = client.get(
        f"/api/v1/demo/students/{DEMO_STUDENT_ID}/summary",
        headers={"X-API-Key": "demo-test-key"},
    )

    assert missing_key.status_code == 401
    assert bad_key.status_code == 401
    assert disabled.status_code == 404


def test_demo_mode_defaults_to_disabled() -> None:
    config = Settings(
        _env_file=None,
        database_url="postgresql://localhost/test",
        ingest_api_key="test-key",
    )

    assert config.demo_mode is False


def test_demo_routes_reject_students_not_in_allow_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "demo_mode", True)
    monkeypatch.setattr(settings, "demo_student_ids", DEMO_STUDENT_ID)
    monkeypatch.setattr(settings, "ingest_api_key", "demo-test-key")

    response = TestClient(app).get(
        "/api/v1/demo/students/not-allowed/summary",
        headers={"X-API-Key": "demo-test-key"},
    )

    assert response.status_code == 403


def test_low_mark_ingestion_changes_demo_mastery_and_prediction(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api.demo import student_summary

    session = DemoSession()
    current = datetime.now(UTC)
    monkeypatch.setattr(settings, "demo_student_ids", DEMO_STUDENT_ID)
    monkeypatch.setattr(settings, "model_dir", tmp_path)
    monkeypatch.setattr("app.services.predictions._load_models_with_fallback", lambda _path: None)

    ingest_assessment_event(session, _assessment("high-mark", 95, current - timedelta(days=2)))  # type: ignore[arg-type]
    before = student_summary(DEMO_STUDENT_ID, session)  # type: ignore[arg-type]

    ingest_assessment_event(session, _assessment("low-mark", 5, current))  # type: ignore[arg-type]
    after = student_summary(DEMO_STUDENT_ID, session)  # type: ignore[arg-type]

    assert after.mastery_by_topic[0].mastery < before.mastery_by_topic[0].mastery
    assert after.predicted_overall_grade != before.predicted_overall_grade
    assert before.gap_to_target == pytest.approx(before.predicted_overall_score - 0.65)
    assert after.gap_to_target == pytest.approx(after.predicted_overall_score - 0.65)
