from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.api.predictions import router
from app.errors import NotFound
from app.services import predictions
from app.services.predictions import predict_student


class FakeResults:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def all(self) -> list[object]:
        return self.rows


class FakeSession:
    def __init__(self) -> None:
        current = datetime(2026, 10, 12, tzinfo=UTC)
        self.results = [
            [
                SimpleNamespace(
                    topic_id="chem-1",
                    score=8,
                    max_score=10,
                    difficulty=0.6,
                    observed_at=current - timedelta(days=14),
                ),
                SimpleNamespace(
                    topic_id="chem-1",
                    score=9,
                    max_score=10,
                    difficulty=0.5,
                    observed_at=current - timedelta(days=7),
                ),
            ],
            [],
            [],
            [SimpleNamespace(id="chem-1", exam_weight=0.7)],
        ]
        self.added: list[object] = []
        self.committed = False

    def scalars(self, _statement: object) -> FakeResults:
        return FakeResults(self.results.pop(0))

    def add_all(self, rows: list[object]) -> None:
        self.added.extend(rows)

    def execute(self, statement: object) -> None:
        self.executed = getattr(self, "executed", []) + [statement]

    def commit(self) -> None:
        self.committed = True


def test_prediction_service_uses_logged_rule_fallback_and_persists(tmp_path) -> None:
    session = FakeSession()

    response = predict_student(
        session,  # type: ignore[arg-type]
        "student-1",
        "student-1",
        model_dir=tmp_path,
        as_of=datetime(2026, 10, 12, tzinfo=UTC),
    )

    assert response.prediction_source == "rule-based"
    assert response.model_version == "rule-based-fallback-v1"
    assert response.overall_predicted_grade in {"A", "B", "C", "S", "F"}
    assert response.topics[0].topic_id == "chem-1"
    assert response.topics[0].contributing_factors
    assert len(session.added) == 2
    assert session.added[-1].topic_id is None
    assert session.committed


def test_prediction_service_does_not_allow_another_students_id() -> None:
    with pytest.raises(NotFound):
        predict_student(
            FakeSession(),  # type: ignore[arg-type]
            "student-1",
            "student-2",
        )


def test_prediction_service_falls_back_when_loaded_model_fails(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        predictions, "_load_models_with_fallback", lambda _path: (object(), object(), "broken")
    )

    def fail_inference(*_args: object) -> tuple[float, float, list]:
        raise ValueError("corrupt model output")

    monkeypatch.setattr(predictions, "predict_with_model", fail_inference)
    response = predict_student(
        FakeSession(),  # type: ignore[arg-type]
        "student-1",
        "student-1",
        model_dir=tmp_path,
        as_of=datetime(2026, 10, 12, tzinfo=UTC),
    )

    assert response.prediction_source == "rule-based-fallback"
    assert response.model_version == "rule-based-fallback-v1"


def test_prediction_endpoint_has_student_path() -> None:
    endpoints = [route.path for route in router.routes]

    assert "/api/v1/predictions/{student_id}" in endpoints
