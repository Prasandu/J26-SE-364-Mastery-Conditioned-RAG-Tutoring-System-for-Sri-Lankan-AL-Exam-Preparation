from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import app.api.dashboard as dashboard_api
from app.api.dashboard import router
from app.schemas.dashboard import DashboardResponse, WhatIfInput
from app.services.dashboard import get_dashboard, project_what_if
from app.services.predictions import MINIMUM_ASSESSED_TOPICS


class FakeResults:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class FakeDashboardSession:
    def __init__(self) -> None:
        now = datetime(2026, 10, 12, tzinfo=UTC)
        self.plan = SimpleNamespace(
            student_id="student-1",
            exam_date=(now + timedelta(days=30)).date(),
            target_grade="A",
            updated_at=now,
        )
        self.topics = [
            SimpleNamespace(id="chem-1", name="Organic chemistry", parent_id=None),
            SimpleNamespace(id="chem-2", name="Bonding", parent_id="chem-1"),
        ]
        self.tasks = [
            SimpleNamespace(
                student_id="student-1",
                duration_min=120,
                actual_duration_min=80,
                status="completed",
            ),
            SimpleNamespace(
                student_id="student-1",
                duration_min=60,
                actual_duration_min=15,
                status="partial",
            ),
        ]
        self.states = [
            SimpleNamespace(topic_id="chem-1", mastery=0.72, trend=0.12, weak_score=0.38),
            SimpleNamespace(topic_id="chem-2", mastery=0.41, trend=-0.08, weak_score=0.74),
        ]
        self.predictions = [
            SimpleNamespace(student_id="student-1", topic_id=None, predicted_score=0.71),
        ]
        self.evidence = []

    def scalars(self, statement):
        sql = str(statement)
        if "study_plans" in sql and "student_id" in sql:
            return FakeResults([self.plan])
        if "study_tasks" in sql and "student_id" in sql:
            return FakeResults(self.tasks)
        if "topics" in sql:
            return FakeResults(self.topics)
        if "learner_topic_state" in sql:
            return FakeResults(self.states)
        if "topic_evidence" in sql:
            return FakeResults(self.evidence)
        if "predictions" in sql:
            return FakeResults(self.predictions)
        return FakeResults([])


def test_dashboard_summary_has_required_fields() -> None:
    session = FakeDashboardSession()

    response = get_dashboard(session, "student-1")

    assert response.exam_countdown_days >= 0
    assert response.adherence > 0.0
    assert response.predicted_grade in {"A", "B", "C", "S", "F"}
    assert response.target_grade == "A"
    assert response.readiness_score > 0.0
    assert response.weak_topics
    assert response.has_exam_plan
    assert response.has_adherence_data
    assert response.has_mastery_data
    assert response.has_prediction


def test_empty_dashboard_marks_unavailable_metrics_without_placeholder_topics() -> None:
    class EmptySession:
        def scalars(self, _statement):
            return FakeResults([])

    response = get_dashboard(EmptySession(), "student-empty")

    assert not response.has_exam_plan
    assert not response.has_adherence_data
    assert not response.has_mastery_data
    assert not response.has_prediction
    assert response.mastery_trend == []
    assert response.mastery_history == []
    assert response.weak_topics == []


def test_on_demand_prediction_does_not_require_an_exam_plan() -> None:
    class EmptySession:
        def scalars(self, _statement):
            return FakeResults([])

    response = get_dashboard(
        EmptySession(),
        "student-without-plan",
        prediction_score=0.72,
    )

    assert response.has_prediction
    assert not response.has_exam_plan
    assert response.predicted_score == 0.72
    assert response.target_grade == "B"


def test_dashboard_builds_weekly_mastery_history_from_assessment_evidence() -> None:
    session = FakeDashboardSession()
    session.evidence = [
        SimpleNamespace(
            topic_id="chem-1",
            score=4,
            max_score=10,
            difficulty=0.5,
            confidence=0.8,
            observed_at=datetime(2026, 10, 1, tzinfo=UTC),
        ),
        SimpleNamespace(
            topic_id="chem-1",
            score=9,
            max_score=10,
            difficulty=0.5,
            confidence=0.9,
            observed_at=datetime(2026, 10, 12, tzinfo=UTC),
        ),
    ]

    response = get_dashboard(session, "student-1", as_of=datetime(2026, 10, 14, tzinfo=UTC))

    assert [point.week_start for point in response.mastery_history] == [
        "2026-09-28",
        "2026-10-12",
    ]
    assert response.mastery_history[0].mastery != response.mastery_history[1].mastery


def test_what_if_projection_never_drops_below_current_prediction() -> None:
    session = FakeDashboardSession()

    response = project_what_if(session, "student-1", WhatIfInput(extra_hours_per_week=8, mastery_gain=0.2))

    assert response.estimate is True
    assert response.projected_prediction >= response.current_prediction
    assert response.projected_grade in {"A", "B", "C", "S", "F"}


def test_dashboard_endpoint_has_routes() -> None:
    endpoints = [route.path for route in router.routes]

    assert "/api/v1/dashboard" in endpoints
    assert "/api/v1/whatif" in endpoints


def test_dashboard_generates_prediction_when_minimum_assessed_topics_exist(
    monkeypatch,
) -> None:
    class EvidenceSession:
        def scalar(self, _statement):
            return MINIMUM_ASSESSED_TOPICS

    prediction = SimpleNamespace(overall_predicted_score=0.77)
    calls = {}
    monkeypatch.setattr(dashboard_api, "predict_student", lambda *_args: prediction)

    def fake_dashboard(_session, student_id, *, prediction_score=None):
        calls.update(student_id=student_id, prediction_score=prediction_score)
        return SimpleNamespace(has_prediction=True)

    monkeypatch.setattr(dashboard_api, "get_dashboard", fake_dashboard)

    response = dashboard_api.dashboard_overview(EvidenceSession(), "student-1")

    assert response.has_prediction
    assert calls == {"student_id": "student-1", "prediction_score": 0.77}


def test_dashboard_does_not_predict_below_minimum_evidence(monkeypatch) -> None:
    class EvidenceSession:
        def scalar(self, _statement):
            return MINIMUM_ASSESSED_TOPICS - 1

    calls = {"predictions": 0, "dashboard": 0}

    def fail_if_called(*_args):
        calls["predictions"] += 1
        raise AssertionError("prediction should not run below the evidence threshold")

    def fake_dashboard(_session, student_id):
        calls["dashboard"] += 1
        return DashboardResponse(
            minimum_assessed_topics=MINIMUM_ASSESSED_TOPICS,
            exam_countdown_days=0,
            has_exam_plan=False,
            adherence=0,
            adherence_pct=0,
            has_adherence_data=False,
            mastery_trend=[],
            mastery_history=[],
            has_mastery_data=False,
            weak_topics=[],
            predicted_grade="C",
            target_grade="B",
            gap_to_target=-0.15,
            grade_gap_to_target=-0.15,
            predicted_score=0.5,
            readiness_score=0.5,
            current_prediction=0.5,
            has_prediction=False,
        )

    monkeypatch.setattr(dashboard_api, "predict_student", fail_if_called)
    monkeypatch.setattr(dashboard_api, "get_dashboard", fake_dashboard)

    response = dashboard_api.dashboard_overview(EvidenceSession(), "student-1")

    assert not response.has_prediction
    assert response.minimum_assessed_topics == 1
    assert calls == {"predictions": 0, "dashboard": 1}
