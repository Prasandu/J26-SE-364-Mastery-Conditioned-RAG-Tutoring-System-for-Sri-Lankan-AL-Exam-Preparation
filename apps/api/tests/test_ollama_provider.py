"""Local Ollama adapter with a mocked OpenAI-compatible client. No network call is ever made."""

import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx2 as httpx
import openai
import pytest

from app.rag.generation import GenerationInvalid, GenerationUnavailable, validate_result
from app.rag.ollama_provider import OllamaGenerationProvider
from app.rag.providers import build_configured_provider, service_timeout
from tests.test_admin_access import admin_settings
from tests.test_assistant import answer_of
from tests.test_groq_provider import REQUEST, MockGroqClient, _raise, completion

MODEL = "qwen3:8b"
LOCAL = "http://127.0.0.1:11434/v1"


def provider(
    behaviour: Callable[[dict[str, Any]], Any],
) -> tuple[OllamaGenerationProvider, MockGroqClient]:
    client = MockGroqClient(behaviour)
    return OllamaGenerationProvider(model=MODEL, base_url=LOCAL, client=client), client


def test_request_is_one_structured_turn_to_the_local_model() -> None:
    local, client = provider(lambda kw: completion(answer_of("Weigh 26.5 g of Na₂CO₃.")))
    local.generate(REQUEST, timeout=30)
    [kwargs] = client.calls
    assert set(kwargs) == {
        "model", "messages", "response_format", "max_tokens", "temperature", "timeout",
    }  # fmt: skip
    assert kwargs["model"] == MODEL and kwargs["temperature"] == 0
    assert kwargs["response_format"]["type"] == "json_schema"
    assert [m["role"] for m in kwargs["messages"]] == ["system", "user"]
    for absent in ("tools", "stream", "store", "user"):
        assert absent not in kwargs


def test_local_output_gets_the_same_post_validation_as_cloud_models() -> None:
    local, _ = provider(lambda kw: completion(answer_of("Weigh 26.5 g of Na₂CO₃.")))
    result = local.generate(REQUEST)
    assert result.meta.provider == "ollama" and result.meta.attempted == ("ollama",)
    assert validate_result(result, REQUEST, time.perf_counter()).verdict.grounded is True
    # A local model that invents a quantity is refused exactly like a cloud model would be.
    invented, _ = provider(lambda kw: completion(answer_of("Weigh 30 g of Na₂CO₃.")))
    verdict = validate_result(invented.generate(REQUEST), REQUEST, time.perf_counter()).verdict
    assert verdict.grounded is False and verdict.category is not None
    truncated, _ = provider(lambda kw: completion("{", finish="length"))
    with pytest.raises(GenerationInvalid):
        truncated.generate(REQUEST)


def test_unreachable_local_server_is_a_technical_failure() -> None:
    request = httpx.Request("POST", f"{LOCAL}/chat/completions")
    local, _ = provider(_raise(openai.APIConnectionError(request=request)))
    with pytest.raises(GenerationUnavailable):
        local.generate(REQUEST)


def test_real_client_targets_loopback_without_retries(tmp_path: Path) -> None:
    settings = admin_settings(tmp_path, llm_provider="ollama", ollama_model=MODEL)
    built = build_configured_provider(settings)
    assert isinstance(built, OllamaGenerationProvider)
    assert str(built._client.base_url).rstrip("/") == LOCAL and built._client.max_retries == 0
    assert service_timeout(settings) == settings.ollama_timeout_seconds
