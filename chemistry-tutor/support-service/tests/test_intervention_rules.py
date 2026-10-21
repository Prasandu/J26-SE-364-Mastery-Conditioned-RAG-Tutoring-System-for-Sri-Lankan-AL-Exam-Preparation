import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _unique_student_id(label: str) -> str:
    return f"test-{label}-{uuid.uuid4().hex[:8]}"


def _submit_incorrect(student_id: str, question_code: str, n: int) -> None:
    for _ in range(n):
        client.post(
            f"/api/v1/questions/{question_code}/check",
            json={"student_id": student_id, "submitted_answer": "WRONG", "hints_used": 0},
        )


def test_no_interventions_for_fresh_student():
    student_id = _unique_student_id("fresh")
    response = client.get(f"/api/v1/students/{student_id}/interventions")
    assert response.status_code == 200
    assert response.json() == []


def test_two_incorrect_attempts_triggers_simpler_explanation():
    student_id = _unique_student_id("two-wrong")
    _submit_incorrect(student_id, "CHEM-U3-Q001", 2)

    interventions = client.get(f"/api/v1/students/{student_id}/interventions").json()
    rules = [i["rule"] for i in interventions]
    assert "simpler_explanation" in rules
    assert "guided_worked_steps" not in rules


def test_three_incorrect_attempts_triggers_guided_steps_not_simpler():
    student_id = _unique_student_id("three-wrong")
    _submit_incorrect(student_id, "CHEM-U3-Q001", 3)

    interventions = client.get(f"/api/v1/students/{student_id}/interventions").json()
    rules = [i["rule"] for i in interventions]
    assert "guided_worked_steps" in rules
    assert "simpler_explanation" not in rules


def test_solved_question_does_not_trigger_struggle_rules():
    student_id = _unique_student_id("solved-after-struggle")
    _submit_incorrect(student_id, "CHEM-U3-Q001", 3)
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 0},
    )

    interventions = client.get(f"/api/v1/students/{student_id}/interventions").json()
    assert interventions == []


def test_hints_on_multiple_unit3_questions_triggers_prerequisite_review():
    student_id = _unique_student_id("hints-multi")
    for code in ["CHEM-U3-Q001", "CHEM-U3-Q002"]:
        client.post(
            f"/api/v1/questions/{code}/hint",
            json={"student_id": student_id, "attempts": 0, "hints_used": 0},
        )

    interventions = client.get(f"/api/v1/students/{student_id}/interventions").json()
    rules = [i["rule"] for i in interventions]
    assert "prerequisite_revision" in rules


def test_hint_on_single_question_does_not_trigger_prerequisite_review():
    student_id = _unique_student_id("hints-single")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/hint",
        json={"student_id": student_id, "attempts": 0, "hints_used": 0},
    )

    interventions = client.get(f"/api/v1/students/{student_id}/interventions").json()
    rules = [i["rule"] for i in interventions]
    assert "prerequisite_revision" not in rules
