from abc import ABC, abstractmethod

from app.config import settings


class LLMProvider(ABC):
    """Common interface so the LLM backend can be swapped without touching callers."""

    @abstractmethod
    def generate_response(self, system_prompt: str, user_message: str) -> str:
        raise NotImplementedError


class GroqProvider(LLMProvider):
    MODEL = "openai/gpt-oss-120b"

    def __init__(self, api_key: str):
        from groq import Groq

        self._client = Groq(api_key=api_key)

    def generate_response(self, system_prompt: str, user_message: str) -> str:
        completion = self._client.chat.completions.create(
            model=self.MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            # Low (not zero — Groq doesn't guarantee fully deterministic
            # output even at temperature=0) to reduce inconsistent
            # answer-vs-abstain behavior on borderline-grounded questions.
            # See docs/DEVELOPMENT_PROGRESS.md: the same question phrased
            # two ways answered once and abstained once at temperature=0.3.
            temperature=0.1,
            # Raised from 800 after the correctness benchmark review found
            # several detailed answers (worked examples, multi-part
            # explanations) cut off mid-sentence at the old limit. See
            # docs/DEVELOPMENT_PROGRESS.md Step 16 (continued).
            max_tokens=1500,
        )
        return completion.choices[0].message.content


def get_llm_provider() -> LLMProvider:
    if settings.llm_provider == "groq":
        return GroqProvider(api_key=settings.groq_api_key)
    raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
