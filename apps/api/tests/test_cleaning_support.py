"""Cleaning-question regressions with synthetic evidence and mocked provider SDKs."""

import hashlib
from dataclasses import replace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.rag.assistant import AssistantService
from app.rag.embeddings import FakeEmbeddingProvider
from app.rag.groq_provider import GroqGenerationProvider
from app.rag.openai_provider import OpenAIGenerationProvider
from app.rag.repository import InMemoryKnowledgeRepository, KnowledgeVersion
from app.rag.retrieval import MAX_CANDIDATES, MAX_EVIDENCE, Retriever
from app.rag.topics import focus_evidence, lab_topic, topic_matches, topic_query
from app.rag.translate import build_query_translator
from tests.conftest import build_app, make_settings, start
from tests.test_assistant import REFUSALS, make_chunks
from tests.test_groq_provider import MockGroqClient, completion
from tests.test_groq_provider import payload_of as groq_payload
from tests.test_openai_provider import MockClient, payload_of, response

REASON = "Use clean glassware and items in the laboratory to ensure accurate results."
RINSING = "Transfer the washings into the volumetric flask."


def test_why_question_gets_an_exact_reason_excerpt_instead_of_a_cleaning_recipe() -> None:
    passage = f"Introduction:\n{REASON} More detailed cleaning instructions follow."
    assert focus_evidence("why all the instruments should wash there", passage) == REASON
    assert REASON in passage
    assert focus_evidence("How should I clean glassware?", passage) == passage
    assert focus_evidence("Why wash hands?", passage) == passage


def cleaning_repository(embeddings: FakeEmbeddingProvider) -> InMemoryKnowledgeRepository:
    chunks = make_chunks(embeddings)
    for index, (text, in_scope) in enumerate(
        [(REASON, True), (RINSING, True), (REASON + " NOT APPROVED", False)]
    ):
        [vector] = embeddings.embed_passages([text])
        chunks.append(
            replace(
                chunks[0],
                chunk_id="kc_" + hashlib.sha256(f"cleaning-{index}".encode()).hexdigest()[:20],
                text=text,
                embedding=vector,
                text_sha256=hashlib.sha256(text.encode()).hexdigest(),
                heading="Introduction:",
                headings=("Introduction:",),
                pdf_page=25 + index,
                in_scope=in_scope,
            )
        )
    repo = InMemoryKnowledgeRepository()
    repo.ingest(
        KnowledgeVersion(
            "kb-test", embeddings.model_id, embeddings.revision, 384, len(chunks), "e" * 64
        ),
        chunks,
    )
    repo.set_active("kb-test")
    return repo


@pytest.mark.parametrize(
    "question",
    [
        "why all the instruments should wash there",
        "Why should instruments be washed?",
        "Why clean glassware before the experiment?",
        "උපකරණ පිරිසිදු කළ යුත්තේ ඇයි?",
    ],
)
def test_cleaning_reason_is_retrieved_before_generic_instructions(question: str) -> None:
    embeddings = FakeEmbeddingProvider()
    result = Retriever(cleaning_repository(embeddings), embeddings).retrieve(question)
    assert result.evidence[0].chunk.text == REASON
    assert all(c.chunk.in_scope for c in result.candidates)
    assert len(result.candidates) <= MAX_CANDIDATES
    assert len(result.evidence) <= MAX_EVIDENCE
    assert len({c.chunk.chunk_id for c in result.candidates}) == len(result.candidates)


def test_rinsing_and_unrelated_questions_do_not_use_the_cleaning_override() -> None:
    embeddings = FakeEmbeddingProvider()
    repo = cleaning_repository(embeddings)
    question = "Why wash the funnel and transfer washings?"
    assert lab_topic(question) == "quantitative_rinsing"
    assert Retriever(repo, embeddings).retrieve(question).evidence[0].chunk.text == RINSING
    for unrelated in ["Why wash hands?", "Set up the instruments", "What is concentration?"]:
        assert lab_topic(unrelated) is None
        assert topic_query(unrelated) == unrelated
        assert topic_matches(unrelated, repo.chunks("kb-test")) == []


@pytest.mark.parametrize("kind", ["openai", "groq"])
def test_reported_question_returns_validated_source_citation_through_both_adapters(
    kind: str,
) -> None:
    def answer(kwargs: dict[str, Any]) -> Any:
        body = payload_of(kwargs) if kind == "openai" else groq_payload(kwargs)
        assert body["studentQuestion"] == "why all the instruments should wash there"
        evidence = body["evidence"][0]
        assert evidence["text"] == REASON
        output = {
            "decision": "answer",
            "answer": REASON,
            "claims": [
                {
                    "text": REASON,
                    "citedChunkIds": [evidence["chunkId"]],
                    "supportingSpans": [{"chunkId": evidence["chunkId"], "text": REASON}],
                }
            ],
        }
        return response(output) if kind == "openai" else completion(output)

    mock = MockClient(answer) if kind == "openai" else MockGroqClient(answer)
    provider = (
        OpenAIGenerationProvider(model="test-model", api_key="test-only", client=mock)
        if kind == "openai"
        else GroqGenerationProvider(model="test-model", api_key="test-only", client=mock)
    )
    embeddings = FakeEmbeddingProvider()
    service = AssistantService(
        Retriever(cleaning_repository(embeddings), embeddings), provider, REFUSALS
    )
    with TestClient(build_app(assistant=service)) as client:
        sid = start(client)["session"]["sessionId"]
        result = client.post(
            "/assistant/ask",
            json={
                "sessionId": sid,
                "question": "why all the instruments should wash there",
                "locale": "en",
            },
        )
    assert result.status_code == 200
    assert result.json()["status"] == "grounded"
    assert result.json()["answer"] == REASON
    assert result.json()["citations"][0]["pdfPage"] == 25
    assert len(mock.calls) == 1


@pytest.mark.parametrize("kind", ["disabled", "fake", "ollama", "openai"])
def test_translation_does_not_contact_unselected_providers_or_run_offline(
    monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    def forbidden(**kwargs: Any) -> None:
        pytest.fail("No remote translation client should be constructed")

    monkeypatch.setattr("app.rag.translate.openai.OpenAI", forbidden)
    if kind == "openai":
        monkeypatch.setenv("LAB_EVAL_OFFLINE", "1")
    else:
        monkeypatch.delenv("LAB_EVAL_OFFLINE", raising=False)
    settings = make_settings(
        llm_provider=kind,
        llm_model="test-openai",
        groq_model="test-groq",
        OPENAI_API_KEY="test-openai-only",
        GROQ_API_KEY="test-groq-only",
    )
    assert build_query_translator(settings) is None


@pytest.mark.parametrize("kind", ["openai", "groq", "failover"])
def test_translation_uses_the_selected_provider(monkeypatch: pytest.MonkeyPatch, kind: str) -> None:
    monkeypatch.delenv("LAB_EVAL_OFFLINE", raising=False)
    calls: list[dict[str, Any]] = []

    def capture(**kwargs: Any) -> object:
        calls.append(kwargs)
        return object()

    monkeypatch.setattr("app.rag.translate.openai.OpenAI", capture)
    settings = make_settings(
        llm_provider=kind,
        llm_model="test-openai",
        groq_model="test-groq",
        llm_failover_order=["openai", "groq"],
        OPENAI_API_KEY="test-openai-only",
        GROQ_API_KEY="test-groq-only",
    )
    assert build_query_translator(settings) is not None
    assert calls[0]["api_key"] == ("test-groq-only" if kind == "groq" else "test-openai-only")
