"""Builds the AI judge and the handwriting reader described by the settings."""

from app.config import Settings
from app.errors import ConfigurationError
from app.services.judge import (
    PROVIDERS,
    AnswerJudge,
    Provider,
    ProviderName,
    gemini_judge,
    openai_compatible_judge,
)
from app.services.reader import AnswerReader, VisionAnswerReader
from app.services.vision import VisionModel, gemini_vision, openai_compatible_vision


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


def build_reader(settings: Settings) -> AnswerReader | None:
    """The handwriting reader, or None when no vision model is configured."""
    model = build_vision_model(settings)
    return VisionAnswerReader(model) if model else None


def build_vision_model(settings: Settings) -> VisionModel | None:
    """The configured model that can see images, or None when no key is set."""
    if settings.vision_provider == ProviderName.GEMINI:
        if not settings.gemini_api_key:
            return None
        return gemini_vision(settings.gemini_api_key, settings.vision_model or settings.gemini_model)

    provider = _provider(settings.vision_provider, settings)
    if provider.needs_key and not settings.ai_api_key:
        return None
    base_url = settings.ai_base_url or provider.base_url
    return openai_compatible_vision(
        settings.ai_api_key, base_url, settings.vision_model or provider.default_model
    )


def _provider(name: ProviderName, settings: Settings) -> Provider:
    if name != ProviderName.CUSTOM:
        return PROVIDERS[name]
    if not settings.ai_base_url:
        raise ConfigurationError("A custom provider needs AI_BASE_URL")
    return Provider(settings.ai_base_url, settings.ai_model or "", needs_key=True)
