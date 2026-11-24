import uuid

from fastapi.testclient import TestClient

import app.services.reports.wivarana_report as report_module
from app.main import app

client = TestClient(app)


def _unique_student_id(label: str) -> str:
    return f"test-{label}-{uuid.uuid4().hex[:8]}"


class FakeProvider:
    def generate_response(self, system_prompt: str, user_message: str) -> str:
        return (
            "This student shows independent mastery on CHEM-U3-Q001 "
            "and is still building confidence elsewhere."
        )


def test_report_empty_for_fresh_student():
    student_id = _unique_student_id("report-fresh")
    response = client.get(f"/api/v1/students/{student_id}/wivarana-report")
    assert response.status_code == 200
    data = response.json()
    assert data["question_evidence"] == []
    assert data["total_attempts"] == 0
    assert "no practice activity" in data["narrative"].lower()


def test_report_classifies_independent_question_correctly():
    student_id = _unique_student_id("report-independent")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 0},
    )

    response = client.get(f"/api/v1/students/{student_id}/wivarana-report")
    data = response.json()
    evidence = next(e for e in data["question_evidence"] if e["question_code"] == "CHEM-U3-Q001")
    assert evidence["status"] == "independent"
    assert "independent mastery" in evidence["explanation"].lower()


def test_report_classifies_assisted_question_correctly():
    student_id = _unique_student_id("report-assisted")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/hint",
        json={"student_id": student_id, "attempts": 0, "hints_used": 0},
    )
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 1},
    )

    response = client.get(f"/api/v1/students/{student_id}/wivarana-report")
    data = response.json()
    evidence = next(e for e in data["question_evidence"] if e["question_code"] == "CHEM-U3-Q001")
    assert evidence["status"] == "assisted"


def test_report_classifies_struggling_question_correctly():
    student_id = _unique_student_id("report-struggling")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "999", "hints_used": 0},
    )

    response = client.get(f"/api/v1/students/{student_id}/wivarana-report")
    data = response.json()
    evidence = next(e for e in data["question_evidence"] if e["question_code"] == "CHEM-U3-Q001")
    assert evidence["status"] == "struggling"


def test_report_includes_intervention_summary():
    student_id = _unique_student_id("report-intervention")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "999", "hints_used": 0},
    )
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "888", "hints_used": 0},
    )
    client.get(f"/api/v1/students/{student_id}/interventions")

    response = client.get(f"/api/v1/students/{student_id}/wivarana-report")
    data = response.json()
    assert len(data["intervention_summary"]) > 0


def test_corrected_answers_includes_wrong_answer_and_solution():
    student_id = _unique_student_id("report-corrected")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "999", "hints_used": 0},
    )

    response = client.get(f"/api/v1/students/{student_id}/wivarana-report")
    data = response.json()
    corrected = next(c for c in data["corrected_answers"] if c["question_code"] == "CHEM-U3-Q001")
    assert "999" in corrected["wrong_answers"]
    assert "water" in corrected["question_text"].lower()
    assert len(corrected["theory_explanation"]) > 0
    assert len(corrected["worked_solution"]) > 0
    assert "0.5" in corrected["final_answer"]


def test_corrected_answers_dedupes_repeated_wrong_answer():
    student_id = _unique_student_id("report-corrected-dedupe")
    for _ in range(3):
        client.post(
            "/api/v1/questions/CHEM-U3-Q001/check",
            json={"student_id": student_id, "submitted_answer": "999", "hints_used": 0},
        )

    response = client.get(f"/api/v1/students/{student_id}/wivarana-report")
    data = response.json()
    corrected = next(c for c in data["corrected_answers"] if c["question_code"] == "CHEM-U3-Q001")
    assert corrected["wrong_answers"] == ["999"]


def test_corrected_answers_empty_when_always_correct():
    student_id = _unique_student_id("report-no-corrections")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 0},
    )

    response = client.get(f"/api/v1/students/{student_id}/wivarana-report")
    data = response.json()
    assert data["corrected_answers"] == []


def test_report_narrative_generated_with_fake_llm(monkeypatch):
    monkeypatch.setattr(report_module, "get_llm_provider", lambda: FakeProvider())

    student_id = _unique_student_id("report-narrative")
    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_id, "submitted_answer": "0.5", "hints_used": 0},
    )

    response = client.get(f"/api/v1/students/{student_id}/wivarana-report")
    data = response.json()
    assert "CHEM-U3-Q001" in data["narrative"]
