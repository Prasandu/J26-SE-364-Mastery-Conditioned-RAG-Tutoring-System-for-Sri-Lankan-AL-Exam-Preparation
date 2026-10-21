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


def test_empty_history_for_fresh_student():
    student_id = _unique_student_id("hist-fresh")
    response = client.get(f"/api/v1/students/{student_id}/intervention-history")
    assert response.status_code == 200
    assert response.json() == []


def test_intervention_gets_logged_to_history():
    student_id = _unique_student_id("hist-logged")
    _submit_incorrect(student_id, "CHEM-U3-Q001", 2)

    # triggers the rule AND records it
    client.get(f"/api/v1/students/{student_id}/interventions")

    history = client.get(f"/api/v1/students/{student_id}/intervention-history").json()
    rules = [h["rule"] for h in history]
    assert "simpler_explanation" in rules


def test_repeated_calls_do_not_duplicate_history_entries():
    student_id = _unique_student_id("hist-dedup")
    _submit_incorrect(student_id, "CHEM-U3-Q001", 2)

    client.get(f"/api/v1/students/{student_id}/interventions")
    client.get(f"/api/v1/students/{student_id}/interventions")
    client.get(f"/api/v1/students/{student_id}/interventions")

    history = client.get(f"/api/v1/students/{student_id}/intervention-history").json()
    simpler_explanation_entries = [h for h in history if h["rule"] == "simpler_explanation"]
    assert len(simpler_explanation_entries) == 1


def test_break_suggested_after_many_attempts():
    student_id = _unique_student_id("hist-break")
    for code in [
        "CHEM-U3-Q001",
        "CHEM-U3-Q002",
        "CHEM-U3-Q003",
        "CHEM-U3-Q004",
        "CHEM-U3-Q005",
        "CHEM-U1-Q001",
        "CHEM-U1-Q002",
        "CHEM-U2-Q001",
    ]:
        client.post(
            f"/api/v1/questions/{code}/check",
            json={"student_id": student_id, "submitted_answer": "WRONG", "hints_used": 0},
        )

    interventions = client.get(f"/api/v1/students/{student_id}/interventions").json()
    rules = [i["rule"] for i in interventions]
    assert "suggest_break" in rules


def test_escalation_suggested_across_many_struggling_questions():
    student_id = _unique_student_id("hist-escalate")
    for code in ["CHEM-U3-Q001", "CHEM-U3-Q002", "CHEM-U3-Q003"]:
        client.post(
            f"/api/v1/questions/{code}/check",
            json={"student_id": student_id, "submitted_answer": "WRONG", "hints_used": 0},
        )

    interventions = client.get(f"/api/v1/students/{student_id}/interventions").json()
    rules = [i["rule"] for i in interventions]
    assert "escalate_to_human_support" in rules


def test_no_escalation_for_a_single_struggling_question():
    student_id = _unique_student_id("hist-no-escalate")
    _submit_incorrect(student_id, "CHEM-U3-Q001", 2)

    interventions = client.get(f"/api/v1/students/{student_id}/interventions").json()
    rules = [i["rule"] for i in interventions]
    assert "escalate_to_human_support" not in rules
