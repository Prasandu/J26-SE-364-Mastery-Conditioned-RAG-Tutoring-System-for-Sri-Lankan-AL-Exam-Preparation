"""Groq adapter with a mocked OpenAI-compatible SDK client. No network call is ever made."""

import json
from collections.abc import Callable
from types import SimpleNamespace
from typing import Any

import httpx2 as httpx
import openai
import pytest
from fastapi.testclient import TestClient

from app.rag.assistant import AssistantService
from app.rag.embeddings import FakeEmbeddingProvider
from app.rag.generation import (
    GenerationFailure,
    GenerationInvalid,
    GenerationRateLimited,
    GenerationRequest,
)
from app.rag.groq_provider import GROQ_BASE_URL, GroqGenerationProvider
from app.rag.retrieval import Retriever
from tests.conftest import build_app, start
from tests.test_assistant import EVIDENCE, PASSAGES, REFUSALS, answer_of, knowledge

GROQ_MODEL = "qwen/qwen3.8-27b"
FAKE_GROQ_KEY = "gsk_test_NEVER_REAL_0000"
REQ = httpx.Request("POST", f"{GROQ_BASE_URL}/chat/completions")


def completion(
    content: Any, *, finish: str = "stop", refusal: str | None = None, model: str = GROQ_MODEL
) -> Any:
    text = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
    return SimpleNamespace(
        model=model,
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=text, refusal=refusal), finish_reason=finish
            )
        ],
        usage=SimpleNamespace(
            prompt_tokens=800, completion_tokens=90, completion_tokens_details=None
        ),
    )


class MockGroqClient:
    def __init__(self, behaviour: Callable[[dict[str, Any]], Any]) -> None:
        self.calls: list[dict[str, Any]] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        self._behaviour = behaviour

    def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return self._behaviour(kwargs)


def payload_of(kwargs: dict[str, Any]) -> dict[str, Any]:
    text = kwargs["messages"][1]["content"]
    body: dict[str, Any] = json.loads(text.split("\n", 1)[1].rsplit("\n", 1)[0])
    return body


def first_chunk_answer(kwargs: dict[str, Any], must_contain: str = "") -> Any:
    evidence = payload_of(kwargs)["evidence"]
    chunk = next((e for e in evidence if must_contain in e["text"]), evidence[0])
    line = chunk["text"].split("\n")[1]
    return completion(
        {
            "decision": "answer",
            "answer": line,
            "claims": [
                {
                    "text": line,
                    "citedChunkIds": [chunk["chunkId"]],
                    "supportingSpans": [{"chunkId": chunk["chunkId"], "text": line}],
                }
            ],
        }
    )


def provider(
    behaviour: Callable[[dict[str, Any]], Any],
) -> tuple[GroqGenerationProvider, MockGroqClient]:
    client = MockGroqClient(behaviour)
    return GroqGenerationProvider(model=GROQ_MODEL, api_key=FAKE_GROQ_KEY, client=client), client


REQUEST = GenerationRequest(question="How much Na₂CO₃ is weighed?", locale="en", evidence=EVIDENCE)


def test_request_uses_strict_json_schema_chat_completions_and_nothing_else() -> None:
    groq, client = provider(lambda kw: completion(answer_of("Weigh 26.5 g of Na₂CO₃.")))
    groq.generate(REQUEST, timeout=7.5)
    [kwargs] = client.calls
    assert set(kwargs) == {
        "model", "messages", "response_format", "max_completion_tokens", "temperature", "timeout",
    }  # fmt: skip
    assert kwargs["model"] == GROQ_MODEL and kwargs["timeout"] == 7.5
    assert kwargs["max_completion_tokens"] == 2048
    fmt = kwargs["response_format"]
    assert fmt["type"] == "json_schema" and fmt["json_schema"]["strict"] is True
    assert set(fmt["json_schema"]["schema"]["required"]) == {"decision", "answer", "claims"}
    for absent in ("tools", "tool_choice", "stream", "store", "previous_response_id", "user"):
        assert absent not in kwargs
    assert [m["role"] for m in kwargs["messages"]] == ["system", "user"]
    assert GROQ_BASE_URL == "https://api.groq.com/openai/v1"


def test_real_client_targets_groq_base_url_without_retries() -> None:
    groq = GroqGenerationProvider(model=GROQ_MODEL, api_key=FAKE_GROQ_KEY)
    client = groq._client
    assert str(client.base_url).rstrip("/") == GROQ_BASE_URL and client.max_retries == 0


def test_answer_refusal_and_incomplete_parsing() -> None:
    groq, _ = provider(lambda kw: completion(answer_of("Weigh 26.5 g of Na₂CO₃.")))
    result = groq.generate(REQUEST)
    assert json.loads(result.raw)["decision"] == "answer"
    assert result.meta.provider == "groq" and result.meta.model == GROQ_MODEL
    assert result.meta.input_tokens == 800 and result.meta.attempted == ("groq",)
    refusing, _ = provider(lambda kw: completion("", refusal="cannot help"))
    assert refusing.generate(REQUEST).raw["decision"] == "refuse"
    truncated, _ = provider(lambda kw: completion("{", finish="length"))
    with pytest.raises(GenerationInvalid):
        truncated.generate(REQUEST)


def _raise(exc: Exception) -> Callable[[dict[str, Any]], Any]:
    def behaviour(kwargs: dict[str, Any]) -> Any:
        raise exc

    return behaviour


def status_error(
    cls: type[openai.APIStatusError], code: int, body: Any = None, headers: Any = None
) -> Any:
    return cls(
        "provider says secret",
        response=httpx.Response(code, request=REQ, headers=headers),
        body=body,
    )


@pytest.mark.parametrize(
    ("exc", "kind", "fallback"),
    [
        (
            status_error(openai.RateLimitError, 429, headers={"retry-after": "7"}),
            "rate_limited",
            True,
        ),
        (openai.APITimeoutError(request=REQ), "timeout", True),
        (openai.APIConnectionError(request=REQ), "connection", True),
        (status_error(openai.InternalServerError, 503), "server_error", True),
        (status_error(openai.NotFoundError, 404), "model_unavailable", True),
        (
            status_error(openai.BadRequestError, 400, body={"code": "model_decommissioned"}),
            "model_unavailable",
            True,
        ),
        (status_error(openai.BadRequestError, 400), "bad_request", False),
        (status_error(openai.UnprocessableEntityError, 422), "bad_request", False),
        (status_error(openai.AuthenticationError, 401), "auth", False),
        (status_error(openai.PermissionDeniedError, 403), "auth", False),
    ],
)
def test_error_classification(exc: Exception, kind: str, fallback: bool) -> None:
    groq, _ = provider(_raise(exc))
    with pytest.raises(GenerationFailure) as caught:
        groq.generate(REQUEST)
    assert caught.value.kind == kind and caught.value.fallback_allowed is fallback
    assert "secret" not in str(caught.value)
    if kind == "rate_limited":
        assert isinstance(caught.value, GenerationRateLimited) and caught.value.retry_after == 7.0


def test_groq_through_the_assistant_is_validated_and_private() -> None:
    groq, client = provider(lambda kw: first_chunk_answer(kw, "26.5"))
    embeddings = FakeEmbeddingProvider()
    service = AssistantService(Retriever(knowledge(embeddings), embeddings), groq, REFUSALS)
    with TestClient(build_app(assistant=service)) as http:
        sid = start(http)["session"]["sessionId"]
        body = http.post(
            "/assistant/ask",
            json={
                "sessionId": sid,
                "question": "How many grams of Na₂CO₃ should be weighed?",
                "locale": "en",
            },
        ).json()
        kmno4 = http.post(
            "/assistant/ask",
            json={
                "sessionId": sid,
                "question": "How do I standardise KMnO4 with oxalic acid?",
                "locale": "en",
            },
        ).json()
    assert body["status"] == "grounded" and kmno4["status"] == "refused"
    raw = json.dumps(client.calls[0], ensure_ascii=False)
    for forbidden in (sid, '"seed"', "ownerId", "massG", "score", "notebook", FAKE_GROQ_KEY):
        assert forbidden not in raw, forbidden
    body0 = payload_of(client.calls[0])
    assert len(body0["evidence"]) <= 4
    nuclear = next(f"{h}\n{t}" for h, _, scope, t in PASSAGES if not scope)
    assert nuclear not in raw
