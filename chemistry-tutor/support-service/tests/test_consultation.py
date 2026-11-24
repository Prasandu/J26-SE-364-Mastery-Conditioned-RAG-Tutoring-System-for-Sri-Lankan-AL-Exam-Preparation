import uuid

from fastapi.testclient import TestClient

import app.services.consultation.recommendation as consultation_module
from app.main import app

client = TestClient(app)


def _unique_student_id(label: str) -> str:
    return f"test-{label}-{uuid.uuid4().hex[:8]}"


class FakeProvider:
    def generate_response(self, system_prompt: str, user_message: str) -> str:
        return "Focus on Unit 3 (moles) first, then Unit 1. Practice past papers regularly."


def test_consultation_has_no_data_for_fresh_student():
    student_id = _unique_student_id("consult-fresh")
    response = client.get(f"/api/v1/students/{student_id}/consultation")
    assert response.status_code == 200
    data = response.json()
    assert data["has_data"] is False
    assert data["weak_topics"] == []
    assert len(data["wellness_tips"]) > 0


def test_weak_topic_identified_after_incorrect_attempt():
    student_id = _unique_student_id("consult-incorrect")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "999", "hints_used": 0},
    )

    response = client.get(f"/api/v1/students/{student_id}/consultation")
    data = response.json()
    assert data["has_data"] is True
    codes = [wt["question_code"] for wt in data["weak_topics"]]
    assert "CHEM-U3-Q001" in codes


def test_weak_topic_includes_prerequisite_from_concept_graph():
    # CHEM-U3-Q002 has topic_id "U03-MOLAR-MASS", which the seeded concept
    # graph says requires "U03-MOLE" ("The mole concept").
    student_id = _unique_student_id("consult-prereq")
    client.post(
        "/api/v1/questions/CHEM-U3-Q002/check",
        json={"student_id": student_id, "submitted_answer": "999", "hints_used": 0},
    )

    response = client.get(f"/api/v1/students/{student_id}/consultation")
    data = response.json()
    weak = next(wt for wt in data["weak_topics"] if wt["question_code"] == "CHEM-U3-Q002")
    assert "The mole concept" in weak["prerequisite_names"]


def test_solved_independently_is_not_a_weak_topic():
    student_id = _unique_student_id("consult-solved")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 0},
    )

    response = client.get(f"/api/v1/students/{student_id}/consultation")
    data = response.json()
    assert data["has_data"] is False


def test_assisted_only_success_is_a_weak_topic():
    student_id = _unique_student_id("consult-assisted")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/hint",
        json={"student_id": student_id, "attempts": 0, "hints_used": 0},
    )
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 1},
    )

    response = client.get(f"/api/v1/students/{student_id}/consultation")
    data = response.json()
    assert data["has_data"] is True
    codes = [wt["question_code"] for wt in data["weak_topics"]]
    assert "CHEM-U3-Q001" in codes


def test_consultation_generates_revision_plan_with_fake_llm(monkeypatch):
    monkeypatch.setattr(consultation_module, "get_llm_provider", lambda: FakeProvider())

    student_id = _unique_student_id("consult-plan")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "999", "hints_used": 0},
    )

    response = client.get(f"/api/v1/students/{student_id}/consultation")
    data = response.json()
    assert len(data["revision_plan"]) > 0
    # Wellness tips must be generic advice, never claim to have detected an
    # emotional/stress state (no emotion signal exists to detect from).
    for tip in data["wellness_tips"]:
        assert "detect" not in tip.lower()
        assert "you seem" not in tip.lower()
        assert "you are stressed" not in tip.lower()
