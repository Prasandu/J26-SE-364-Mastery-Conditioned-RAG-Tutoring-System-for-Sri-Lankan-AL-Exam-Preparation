"""GroqCloud generation provider (OpenAI-compatible Chat Completions, strict JSON schema).

* Groq's documented strict structured-output path is Chat Completions with
  `response_format={"type": "json_schema", "json_schema": {..., "strict": true}}`; Groq lists
  `qwen/qwen3.8-27b` as a strict-mode model. Tools and streaming are not used (Groq does not
  support them with structured outputs, and this adapter never sends them).
* One stateless turn: the same instructions and untrusted-data JSON block as every provider; no
  history, no storage parameter, no browsing. The SDK's automatic retries are disabled.
* Output is the exact shared Answer/Refusal schema and passes the shared post-validation.
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

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
SCHEMA_NAME = "grounded_answer"
REFUSAL = {"decision": "refuse", "answer": "", "claims": []}


class GroqGenerationProvider:
    name = "groq"

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        max_output_tokens: int = 512,
        timeout_seconds: float = 12.0,
        client: Any = None,
    ) -> None:
        self._model = model
        self._max_output_tokens = max_output_tokens
        self._client = client or openai.OpenAI(
            api_key=api_key, base_url=GROQ_BASE_URL, timeout=timeout_seconds, max_retries=0
        )

    @property
    def model(self) -> str:
        return self._model

    def request_kwargs(self, request: GenerationRequest) -> dict[str, Any]:
        """The complete request sent to Groq (exposed so tests can audit the boundary)."""
        instructions, user = build_prompt(request)
        return {
            "model": self._model,
            "messages": [
                {"role": "system", "content": instructions},
                {"role": "user", "content": user},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": SCHEMA_NAME,
                    "schema": response_json_schema(),
                    "strict": True,
                },
            },
            "max_completion_tokens": self._max_output_tokens,
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
        details = getattr(usage, "completion_tokens_details", None)
        meta = GenerationMeta(
            provider=self.name,
            model=self._model,
            model_returned=getattr(completion, "model", None),
            input_tokens=getattr(usage, "prompt_tokens", None),
            output_tokens=getattr(usage, "completion_tokens", None),
            reasoning_tokens=getattr(details, "reasoning_tokens", None) if details else None,
            latency_ms=int((time.perf_counter() - started) * 1000),
            attempted=(self.name,),
        )
        choices = getattr(completion, "choices", None) or []
        if not choices:
            raise GenerationInvalid("provider returned no choices")
        choice = choices[0]
        message = getattr(choice, "message", None)
        if getattr(message, "refusal", None):
            return GenerationResult(dict(REFUSAL), meta)
        if getattr(choice, "finish_reason", "stop") != "stop":
            raise GenerationInvalid("provider response incomplete")
        content = getattr(message, "content", None)
        if not isinstance(content, str) or not content.strip():
            raise GenerationInvalid("provider returned no structured output")
        return GenerationResult(content, meta)
