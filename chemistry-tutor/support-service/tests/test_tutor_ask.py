from fastapi.testclient import TestClient

import app.api.tutor as tutor_module
import app.services.tutoring.grounded_answer as grounded_module
from app.main import app
from app.services.rag.retrieval import RetrievedChunk

client = TestClient(app)


class FakeProvider:
    def generate_response(self, system_prompt: str, user_message: str) -> str:
        return "A mole is the SI unit for amount of substance."


class FailingProvider:
    def generate_response(self, system_prompt: str, user_message: str) -> str:
        raise RuntimeError("connection refused: api.groq.com unreachable (fake, for testing)")


def fake_search_chunks(db, query, top_k=5):
    return [
        RetrievedChunk(
            content="A mole is...",
            unit="3",
            section="The mole concept",
            page_number=99,
            document_title="Grade 12 Chemistry Resource Book",
            similarity=0.6,
        )
    ]


def fake_search_chunks_no_match(db, query, top_k=5):
    return [
        RetrievedChunk(
            content="unrelated",
            unit="1",
            section="unrelated",
            page_number=1,
            document_title="doc",
            similarity=0.05,
        )
    ]


def fake_search_chunks_borderline(db, query, top_k=5):
    # Regression case: a real unrelated question ("capital of France") scored
    # 0.32-0.35 against our corpus, which an earlier (too loose) threshold of
    # 0.3 let through as if it were relevant.
    return [
        RetrievedChunk(
            content="unrelated but similar-sounding text",
            unit="1",
            section="unrelated",
            page_number=17,
            document_title="doc",
            similarity=0.35,
        )
    ]


def test_ask_returns_grounded_answer_with_citations(monkeypatch):
    monkeypatch.setattr(grounded_module, "search_chunks", fake_search_chunks)
    monkeypatch.setattr(grounded_module, "get_llm_provider", lambda: FakeProvider())

    app.dependency_overrides[tutor_module.get_db] = lambda: iter([None])
    try:
        response = client.post("/api/v1/tutor/ask", json={"question": "What is a mole?"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["grounded"] is True
    assert len(data["citations"]) == 1
    assert data["citations"][0]["page_number"] == 99


def test_ask_abstains_when_no_relevant_evidence(monkeypatch):
    monkeypatch.setattr(grounded_module, "search_chunks", fake_search_chunks_no_match)

    app.dependency_overrides[tutor_module.get_db] = lambda: iter([None])
    try:
        response = client.post("/api/v1/tutor/ask", json={"question": "What is quantum tunnelling?"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["grounded"] is False
    assert data["citations"] == []


def test_ask_handles_llm_failure_gracefully(monkeypatch):
    monkeypatch.setattr(grounded_module, "search_chunks", fake_search_chunks)
    monkeypatch.setattr(grounded_module, "get_llm_provider", lambda: FailingProvider())

    app.dependency_overrides[tutor_module.get_db] = lambda: iter([None])
    try:
        response = client.post("/api/v1/tutor/ask", json={"question": "What is a mole?"})
    finally:
        app.dependency_overrides.clear()

    # Must not 500, and must never leak the raw exception message (could
    # contain internal details) to the client.
    assert response.status_code == 200
    data = response.json()
    assert data["grounded"] is False
    assert "groq.com" not in data["answer"]
    assert "unavailable" in data["answer"].lower()


def test_ask_abstains_on_borderline_similarity(monkeypatch):
    monkeypatch.setattr(grounded_module, "search_chunks", fake_search_chunks_borderline)

    app.dependency_overrides[tutor_module.get_db] = lambda: iter([None])
    try:
        response = client.post("/api/v1/tutor/ask", json={"question": "What is the capital of France?"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["grounded"] is False
    assert data["citations"] == []
