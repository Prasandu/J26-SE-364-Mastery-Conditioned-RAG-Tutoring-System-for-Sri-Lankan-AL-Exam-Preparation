"""OpenAI generation provider (Responses API, strict JSON-schema structured output).

* Explicitly selected only (`LAB_LLM_PROVIDER=openai`); the model comes from `LAB_LLM_MODEL`.
* No tools are declared, so web search, file search, code execution and function calls cannot
  run. `store=False`, no `previous_response_id`: one stateless turn, no conversation history.
* The SDK's automatic retries are disabled; there is never a fallback to another model or
  provider. Errors are mapped to safe categories without provider bodies or credentials.
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
REFUSAL = {"decision": "refuse", "answer": "", "claims": []}


def _usage(response: Any) -> tuple[int | None, int | None, int | None]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None, None, None
    details = getattr(usage, "output_tokens_details", None)
    return (
        getattr(usage, "input_tokens", None),
        getattr(usage, "output_tokens", None),
        getattr(details, "reasoning_tokens", None) if details is not None else None,
    )


def _model_refused(response: Any) -> bool:
    """The model's own safety refusal (a `refusal` content part instead of output text)."""
    for item in getattr(response, "output", None) or []:
        for part in getattr(item, "content", None) or []:
            if getattr(part, "type", None) == "refusal":
                return True
    return False


class OpenAIGenerationProvider:
    name = "openai"

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        reasoning_effort: str = "low",
        max_output_tokens: int = 512,
        timeout_seconds: float = 20.0,
        client: Any = None,
    ) -> None:
        self._model = model
        self._effort = reasoning_effort
        self._max_output_tokens = max_output_tokens
        self._client = client or openai.OpenAI(
            api_key=api_key, timeout=timeout_seconds, max_retries=0
        )

    @property
    def model(self) -> str:
        return self._model

    def request_kwargs(self, request: GenerationRequest) -> dict[str, Any]:
        """The complete request sent to the provider (exposed so tests can audit the boundary)."""
        instructions, user = build_prompt(request)
        return {
            "model": self._model,
            "instructions": instructions,
            "input": [{"role": "user", "content": [{"type": "input_text", "text": user}]}],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": SCHEMA_NAME,
                    "schema": response_json_schema(),
                    "strict": True,
                }
            },
            "reasoning": {"effort": self._effort},
            "max_output_tokens": self._max_output_tokens,
            "store": False,
        }

    def generate(
        self, request: GenerationRequest, timeout: float | None = None
    ) -> GenerationResult:
        started = time.perf_counter()
        kwargs = self.request_kwargs(request)
        if timeout is not None:
            kwargs["timeout"] = timeout  # per-call budget (failover deadline)
        try:
            response = self._client.responses.create(**kwargs)
        except openai.OpenAIError as exc:
            raise classify(exc) from exc
        latency = int((time.perf_counter() - started) * 1000)
        input_tokens, output_tokens, reasoning_tokens = _usage(response)
        meta = GenerationMeta(
            attempted=(self.name,),
            provider=self.name,
            model=self._model,
            model_returned=getattr(response, "model", None),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            reasoning_tokens=reasoning_tokens,
            latency_ms=latency,
        )
        if _model_refused(response):
            return GenerationResult(dict(REFUSAL), meta)
        if getattr(response, "status", "completed") != "completed":
            raise GenerationInvalid("provider response incomplete")
        text = getattr(response, "output_text", None)
        if not isinstance(text, str) or not text.strip():
            raise GenerationInvalid("provider returned no structured output")
        return GenerationResult(text, meta)
