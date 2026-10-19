"""Local Ollama generation provider (OpenAI-compatible Chat Completions on this machine).

* Runs against a model served by Ollama on loopback (settings refuse any other host), so the
  question and the retrieved evidence never leave the computer.
* Same single stateless turn, instructions, untrusted-data block and JSON schema as the Groq and
  OpenAI adapters; the output goes through the shared post-validation, so a local model gets no
  extra trust (citations, spans, numbers, formulas and language are all checked).
* No API key is needed; the OpenAI SDK requires a placeholder string, which is not a secret.
"""

import time
from typing import Any

import openai

from app.rag.generation import (
    GenerationInvalid,
    GenerationMeta,
    GenerationRequest,
    GenerationResult,
    build_prompt,
    response_json_schema,
)
from app.rag.provider_errors import classify

SCHEMA_NAME = "grounded_answer"
#: The SDK insists on a key; Ollama ignores it.
LOCAL_PLACEHOLDER_KEY = "ollama-local"


class OllamaGenerationProvider:
    name = "ollama"

    def __init__(
        self,
        *,
        model: str,
        base_url: str,
        max_output_tokens: int = 512,
        timeout_seconds: float = 60.0,
        client: Any = None,
    ) -> None:
        self._model = model
        self._max_output_tokens = max_output_tokens
        self._client = client or openai.OpenAI(
            api_key=LOCAL_PLACEHOLDER_KEY,
            base_url=base_url,
            timeout=timeout_seconds,
            max_retries=0,
        )

    @property
    def model(self) -> str:
        return self._model

    def request_kwargs(self, request: GenerationRequest) -> dict[str, Any]:
        """The complete request sent to the local server (exposed so tests can audit it)."""
        instructions, user = build_prompt(request)
        return {
            "model": self._model,
            "messages": [
                {"role": "system", "content": instructions},
                {"role": "user", "content": user},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": SCHEMA_NAME, "schema": response_json_schema()},
            },
            "max_tokens": self._max_output_tokens,
            "temperature": 0,
        }

    def generate(
        self, request: GenerationRequest, timeout: float | None = None
    ) -> GenerationResult:
        started = time.perf_counter()
        kwargs = self.request_kwargs(request)
        if timeout is not None:
            kwargs["timeout"] = timeout
        try:
            completion = self._client.chat.completions.create(**kwargs)
        except openai.OpenAIError as exc:
            raise classify(exc) from exc
        usage = getattr(completion, "usage", None)
        meta = GenerationMeta(
            provider=self.name,
            model=self._model,
            model_returned=getattr(completion, "model", None),
            input_tokens=getattr(usage, "prompt_tokens", None),
            output_tokens=getattr(usage, "completion_tokens", None),
            reasoning_tokens=None,
            latency_ms=int((time.perf_counter() - started) * 1000),
            attempted=(self.name,),
        )
        choices = getattr(completion, "choices", None) or []
        if not choices:
            raise GenerationInvalid("local model returned no choices")
        choice = choices[0]
        if getattr(choice, "finish_reason", "stop") != "stop":
            raise GenerationInvalid("local model response incomplete")
        content = getattr(getattr(choice, "message", None), "content", None)
        if not isinstance(content, str) or not content.strip():
            raise GenerationInvalid("local model returned no structured output")
        return GenerationResult(content, meta)
