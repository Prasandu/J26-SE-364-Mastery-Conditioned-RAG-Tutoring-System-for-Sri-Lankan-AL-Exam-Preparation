from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
TEST_STUDENT = "test-student-questions-api"


def test_list_questions_includes_seeded_question():
    response = client.get("/api/v1/questions")
    assert response.status_code == 200
    codes = [q["question_code"] for q in response.json()]
    assert "CHEM-U3-Q001" in codes


def test_get_question_by_code():
    response = client.get("/api/v1/questions/CHEM-U3-Q001")
    assert response.status_code == 200
    assert "water" in response.json()["question_text"].lower()


def test_get_unknown_question_returns_404():
    response = client.get("/api/v1/questions/DOES-NOT-EXIST")
    assert response.status_code == 404


def test_hint_level_1_on_first_request():
    response = client.post(
        "/api/v1/questions/CHEM-U3-Q001/hint",
        json={
            "student_id": TEST_STUDENT,
            "attempts": 0,
            "hints_used": 0,
            "requested_full_solution": False,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["level"] == 1
    assert data["level_name"] == "Hint"


def test_hint_full_solution_when_requested():
    response = client.post(
        "/api/v1/questions/CHEM-U3-Q001/hint",
        json={
            "student_id": TEST_STUDENT,
            "attempts": 0,
            "hints_used": 0,
            "requested_full_solution": True,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["level"] == 5
    assert "0.5" in data["content"]


def test_check_correct_answer():
    response = client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": TEST_STUDENT, "submitted_answer": "0.5"},
    )
    assert response.status_code == 200
    assert response.json()["correct"] is True


def test_check_incorrect_answer():
    response = client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": TEST_STUDENT, "submitted_answer": "5"},
    )
    assert response.status_code == 200
    assert response.json()["correct"] is False
