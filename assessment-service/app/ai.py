"""Builds the AI judge described by the settings."""

from app.config import Settings
from app.errors import ConfigurationError
from app.services.judge import (
    PROVIDERS,
    AnswerJudge,
    ProviderName,
    gemini_judge,
    openai_compatible_judge,
)


def build_judge(settings: Settings) -> AnswerJudge | None:
    """The configured judge, or None when no key is set (written answers then stay pending)."""
    if settings.ai_provider == ProviderName.GEMINI:
        if not settings.gemini_api_key:
            return None
        return gemini_judge(settings.gemini_api_key, settings.gemini_model)

    base_url, default_model, needs_key = _openai_compatible_target(settings)
    if needs_key and not settings.ai_api_key:
        return None
    return openai_compatible_judge(settings.ai_api_key, base_url, settings.ai_model or default_model)


def _openai_compatible_target(settings: Settings) -> tuple[str, str, bool]:
    if settings.ai_provider == ProviderName.CUSTOM:
        if not settings.ai_base_url or not settings.ai_model:
            raise ConfigurationError("AI_PROVIDER=custom needs both AI_BASE_URL and AI_MODEL")
        return settings.ai_base_url, settings.ai_model, True

    provider = PROVIDERS[settings.ai_provider]
    return settings.ai_base_url or provider.base_url, provider.default_model, provider.needs_key
