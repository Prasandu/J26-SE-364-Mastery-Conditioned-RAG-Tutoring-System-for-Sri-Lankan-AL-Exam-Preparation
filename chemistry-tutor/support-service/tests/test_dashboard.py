import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _unique_student_id(label: str) -> str:
    return f"test-{label}-{uuid.uuid4().hex[:8]}"


def test_dashboard_empty_for_fresh_student():
    student_id = _unique_student_id("dashboard-fresh")
    response = client.get(f"/api/v1/students/{student_id}/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert data["total_attempts"] == 0
    assert data["total_correct"] == 0
    assert data["independent_rate"] == 0.0
    assert data["per_question"] == []


def test_dashboard_aggregates_independent_and_assisted_correctly():
    student_id = _unique_student_id("dashboard-flow")

    # independent success
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 0},
    )
    # assisted success (used 2 hints first)
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/hint",
        json={"student_id": student_id, "attempts": 0, "hints_used": 0},
    )
    client.post(
        "/api/v1/questions/CHEM-U3-Q002/check",
        json={"student_id": student_id, "submitted_answer": "58.5", "hints_used": 2},
    )

    response = client.get(f"/api/v1/students/{student_id}/dashboard")
    assert response.status_code == 200
    data = response.json()

    assert data["total_attempts"] == 2
    assert data["total_correct"] == 2
    assert data["total_independent"] == 1
    assert data["total_assisted"] == 1
    assert data["total_hints_used"] == 1
    assert data["independent_rate"] == 0.5
    assert len(data["per_question"]) == 2
