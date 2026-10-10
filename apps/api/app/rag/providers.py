"""Build the configured generation provider from settings (exactly one routing mode)."""

from typing import TYPE_CHECKING

from app.rag.generation import GenerationProvider, build_generation_provider

if TYPE_CHECKING:
    from app.settings import Settings


def _key(value: object) -> str | None:
    secret = getattr(value, "get_secret_value", None)
    return secret() if callable(secret) else None


def openai_provider(settings: "Settings", timeout: float) -> GenerationProvider:
    from app.rag.openai_provider import OpenAIGenerationProvider

    return OpenAIGenerationProvider(
        model=settings.llm_model or "",
        api_key=_key(settings.openai_api_key) or "",
        reasoning_effort=settings.llm_reasoning_effort,
        max_output_tokens=settings.llm_max_output_tokens,
        timeout_seconds=timeout,
    )


def groq_provider(settings: "Settings", timeout: float) -> GenerationProvider:
    from app.rag.groq_provider import GroqGenerationProvider

    return GroqGenerationProvider(
        model=settings.groq_model or "",
        api_key=_key(settings.groq_api_key) or "",
        max_output_tokens=settings.llm_max_output_tokens,
        timeout_seconds=timeout,
    )


def build_configured_provider(settings: "Settings") -> GenerationProvider:
    kind = settings.llm_provider
    if kind == "groq":
        return groq_provider(settings, settings.llm_timeout_seconds)
    if kind == "failover":
        from app.rag.failover import FailoverGenerationProvider

        builders = {"groq": groq_provider, "openai": openai_provider}
        order = settings.llm_failover_order
        timeouts = [settings.llm_primary_timeout_seconds, settings.llm_fallback_timeout_seconds]
        return FailoverGenerationProvider(
            [builders[name](settings, timeouts[min(i, 1)]) for i, name in enumerate(order)],
            primary_timeout=settings.llm_primary_timeout_seconds,
            fallback_timeout=settings.llm_fallback_timeout_seconds,
            total_deadline=settings.llm_total_deadline_seconds,
            cooldown_seconds=settings.llm_circuit_cooldown_seconds,
            fallback_daily_limit=settings.openai_fallback_daily_request_limit,
        )
    return build_generation_provider(
        kind,
        model=settings.llm_model,
        api_key=_key(settings.openai_api_key),
        reasoning_effort=settings.llm_reasoning_effort,
        max_output_tokens=settings.llm_max_output_tokens,
        timeout_seconds=settings.llm_timeout_seconds,
    )


def service_timeout(settings: "Settings") -> float:
    if settings.llm_provider == "failover":
        return settings.llm_total_deadline_seconds
    return settings.llm_timeout_seconds
