"""Security/abuse checks per the roadmap: no fabricated citations, no
cross-student data leakage, graceful handling of unsupported questions and
unavailable AI services. Prompt-injection resistance against the live LLM
is tested manually (see docs/DEVELOPMENT_PROGRESS.md) since it needs a
real judgment call on model output, not a deterministic assertion.
"""

import uuid

from fastapi.testclient import TestClient

import app.api.tutor as tutor_module
import app.services.tutoring.grounded_answer as grounded_module
from app.main import app
from app.services.rag.retrieval import RetrievedChunk

client = TestClient(app)


def _unique_student_id(label: str) -> str:
    return f"test-{label}-{uuid.uuid4().hex[:8]}"


class FakeProvider:
    def generate_response(self, system_prompt: str, user_message: str) -> str:
        # Simulate the LLM inventing a citation-like claim in its prose.
        # The important thing is that the *structured* citations field
        # never includes this fabricated source — it only ever lists what
        # was actually retrieved.
        return "According to Unit 9, page 500 (Advanced Quantum Chemistry), the answer is X."


def fake_search_chunks(db, query, top_k=5):
    return [
        RetrievedChunk(
            content="real retrieved content",
            unit="3",
            section="The mole concept",
            page_number=99,
            document_title="Grade 12 Chemistry Resource Book",
            similarity=0.6,
        )
    ]


def test_citations_only_reflect_real_retrieved_chunks_not_llm_claims(monkeypatch):
    """The LLM's prose can say anything, but the structured citations list
    must only ever come from what was actually retrieved by search, never
    parsed or trusted from the model's free-text output.
    """
    monkeypatch.setattr(grounded_module, "search_chunks", fake_search_chunks)
    monkeypatch.setattr(grounded_module, "get_llm_provider", lambda: FakeProvider())

    app.dependency_overrides[tutor_module.get_db] = lambda: iter([None])
    try:
        response = client.post("/api/v1/tutor/ask", json={"question": "What is a mole?"})
    finally:
        app.dependency_overrides.clear()

    data = response.json()
    assert len(data["citations"]) == 1
    assert data["citations"][0]["page_number"] == 99
    assert data["citations"][0]["document_title"] == "Grade 12 Chemistry Resource Book"
    # The fabricated "Unit 9, page 500" the model mentioned in prose must
    # not appear anywhere in the structured citations.
    for citation in data["citations"]:
        assert citation["page_number"] != 500
        assert citation["document_title"] != "Advanced Quantum Chemistry"


def test_student_dashboard_does_not_leak_other_students_data():
    student_a = _unique_student_id("secA")
    student_b = _unique_student_id("secB")

    client.post(
        "/api/v1/questions/CHEM-U3-Q001/check",
        json={"student_id": student_a, "submitted_answer": "0.5", "hints_used": 0},
    )
    client.post(
        "/api/v1/questions/CHEM-U3-Q002/check",
        json={"student_id": student_b, "submitted_answer": "58.5", "hints_used": 0},
    )

    dashboard_a = client.get(f"/api/v1/students/{student_a}/dashboard").json()
    dashboard_b = client.get(f"/api/v1/students/{student_b}/dashboard").json()

    codes_a = {q["question_code"] for q in dashboard_a["per_question"]}
    codes_b = {q["question_code"] for q in dashboard_b["per_question"]}

    assert "CHEM-U3-Q001" in codes_a
    assert "CHEM-U3-Q002" not in codes_a
    assert "CHEM-U3-Q002" in codes_b
    assert "CHEM-U3-Q001" not in codes_b


def test_unknown_question_code_returns_404_not_500():
    response = client.post(
        "/api/v1/questions/DOES-NOT-EXIST/check",
        json={"student_id": "test-student", "submitted_answer": "anything"},
    )
    assert response.status_code == 404


def test_empty_question_still_handled_without_crash(monkeypatch):
    monkeypatch.setattr(grounded_module, "search_chunks", lambda db, query, top_k=5: [])

    app.dependency_overrides[tutor_module.get_db] = lambda: iter([None])
    try:
        response = client.post("/api/v1/tutor/ask", json={"question": ""})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["grounded"] is False
