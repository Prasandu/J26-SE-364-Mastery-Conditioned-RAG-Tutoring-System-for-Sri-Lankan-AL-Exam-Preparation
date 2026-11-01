"""Best-effort retrieval-query translation for Sinhala questions.

The approved knowledge chunks are English-only, and the lightweight multilingual embedding
model's cross-lingual alignment is not strong enough to reliably match a Sinhala question to the
right English chunk (see docs/SOURCE_MAP.md on the M1 embedding baseline). Translating the
question to English before it is embedded keeps retrieval in one language, where the embedding
model performs best; the student's original Sinhala question, and the Sinhala answer generated
from the retrieved evidence, are untouched. Never on the critical path: any failure here just
means retrieval embeds the original text, exactly as it did before this existed.
"""

import os
from typing import TYPE_CHECKING, Any, Protocol

import openai

if TYPE_CHECKING:
    from app.settings import Settings

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
_INSTRUCTIONS = (
    "Translate the student's Sinhala chemistry-lab question to English. "
    "Reply with only the English translation, nothing else."
)


class Translator(Protocol):
    def to_english(self, text: str) -> str | None: ...


class QueryTranslator:
    """One plain completion call; not the structured grounded-answer pipeline."""

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        base_url: str | None = None,
        timeout_seconds: float = 8.0,
        client: Any = None,
    ) -> None:
        self._model = model
        self._client = client or openai.OpenAI(
            api_key=api_key, base_url=base_url, timeout=timeout_seconds, max_retries=0
        )

    def to_english(self, text: str) -> str | None:
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": _INSTRUCTIONS},
                    {"role": "user", "content": text},
                ],
                max_tokens=200,
                temperature=0,
            )
        except Exception:  # noqa: BLE001 - best-effort only, never blocks the real answer
            return None
        translated = (response.choices[0].message.content or "").strip()
        return translated or None


def _secret(value: object) -> str | None:
    getter = getattr(value, "get_secret_value", None)
    return getter() if callable(getter) else None


def build_query_translator(settings: "Settings") -> Translator | None:
    """Use only the selected remote provider; disabled/local/offline modes stay local."""
    if os.environ.get("LAB_EVAL_OFFLINE") == "1":
        return None
    order = (
        settings.llm_failover_order
        if settings.llm_provider == "failover"
        else [settings.llm_provider]
    )
    for kind in order:
        if kind == "groq":
            key = _secret(settings.groq_api_key)
            if key and settings.groq_model:
                return QueryTranslator(
                    model=settings.groq_model, api_key=key, base_url=GROQ_BASE_URL
                )
        elif kind == "openai":
            key = _secret(settings.openai_api_key)
            if key and settings.llm_model:
                return QueryTranslator(model=settings.llm_model, api_key=key)
    return None
