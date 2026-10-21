import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _unique_student_id(label: str) -> str:
    # Tests write to the real Supabase database (no transaction rollback
    # across separate HTTP requests), so each test run needs a fresh id or
    # counts accumulate across repeated pytest runs.
    return f"test-{label}-{uuid.uuid4().hex[:8]}"


def test_correct_answer_with_no_hints_is_independent():
    student_id = _unique_student_id("independent")
    response = client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["correct"] is True
    assert data["independent_success"] is True


def test_correct_answer_with_hints_is_assisted_not_independent():
    student_id = _unique_student_id("assisted")
    response = client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 3},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["correct"] is True
    assert data["independent_success"] is False


def test_hint_request_records_event_visible_in_progress():
    student_id = _unique_student_id("hint-progress")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/hint",
        json={"student_id": student_id, "attempts": 0, "hints_used": 0},
    )

    progress = client.get(f"/api/v1/students/{student_id}/progress").json()
    q1 = next(p for p in progress if p["question_code"] == "CHEM-U3-Q001")
    assert q1["hints_used_total"] == 1


def test_student_progress_tracks_independent_and_assisted_separately():
    student_id = _unique_student_id("full-flow")

    # one independent success
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 0},
    )
    # one assisted success (different question, after a hint)
    client.post(
        "/api/v1/questions/CHEM-U3-Q002/check",
        json={"student_id": student_id, "submitted_answer": "58.5", "hints_used": 2},
    )

    progress = client.get(f"/api/v1/students/{student_id}/progress").json()
    by_code = {p["question_code"]: p for p in progress}

    assert by_code["CHEM-U3-Q001"]["independent_successes"] == 1
    assert by_code["CHEM-U3-Q001"]["assisted_successes"] == 0
    assert by_code["CHEM-U3-Q002"]["independent_successes"] == 0
    assert by_code["CHEM-U3-Q002"]["assisted_successes"] == 1
