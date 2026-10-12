"""Clients for the outside AI models, kept apart from the marking logic.

judge:  text models that judge a written answer
author: text models that write questions and their marking points
critic: text models that read back a question another model wrote
vision: models that can see images (handwriting, past-paper pages)
tuning: how every call is tuned (temperature, retries, timeouts)

This file is the only place that reads the settings and decides which provider to
build, so swapping a provider never touches a service.
"""

from app.ai.author import QuestionAuthor, gemini_author, openai_compatible_author
from app.ai.critic import QuestionCritic, gemini_critic, openai_compatible_critic
from app.ai.embeddings import EmbeddingModel, gemini_embedding
from app.ai.judge import (
    PROVIDERS,
    AnswerJudge,
    Provider,
    gemini_judge,
    openai_compatible_judge,
)
from app.ai.vision import VisionModel, gemini_vision, openai_compatible_vision
from app.config import ProviderName, Settings
from app.errors import ConfigurationError
from app.services.reader import AnswerReader, VisionAnswerReader


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


def build_author(settings: Settings) -> QuestionAuthor | None:
    """The model that writes questions, or None when no key is set."""
    if settings.ai_provider == ProviderName.GEMINI:
        if not settings.gemini_api_key:
            return None
        return gemini_author(settings.gemini_api_key, settings.gemini_model)

    base_url, default_model, needs_key = _openai_compatible_target(settings)
    if needs_key and not settings.ai_api_key:
        return None
    return openai_compatible_author(settings.ai_api_key, base_url, settings.ai_model or default_model)


def build_critic(settings: Settings) -> QuestionCritic | None:
    """The model that critiques a generated question, or None when it is switched off.

    Off by default: the deterministic validators cost nothing and prove more, and the
    free quota is better spent writing questions than second-guessing them.
    """
    if not settings.verify_with_ai:
        return None

    if settings.ai_provider == ProviderName.GEMINI:
        if not settings.gemini_api_key:
            return None
        return gemini_critic(settings.gemini_api_key, settings.gemini_model)

    base_url, default_model, needs_key = _openai_compatible_target(settings)
    if needs_key and not settings.ai_api_key:
        return None
    return openai_compatible_critic(settings.ai_api_key, base_url, settings.ai_model or default_model)


def build_embedding_model(settings: Settings) -> EmbeddingModel | None:
    """The model that turns text into vectors for resource retrieval.

    Gemini only: Groq (the configured judge/author provider) has no embedding
    endpoint, so this never follows ai_provider the way the judge and author do.
    """
    if not settings.gemini_api_key:
        return None
    return gemini_embedding(settings.gemini_api_key, settings.embedding_model, settings.embedding_dimensions)


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
