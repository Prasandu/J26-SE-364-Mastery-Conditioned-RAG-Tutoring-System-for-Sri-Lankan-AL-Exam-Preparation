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
            temperature=0.3,
            max_tokens=800,
        )
        return completion.choices[0].message.content


def get_llm_provider() -> LLMProvider:
    if settings.llm_provider == "groq":
        return GroqProvider(api_key=settings.groq_api_key)
    raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
