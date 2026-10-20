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
from app.ai.classify import TopicClassifier, openai_compatible_classifier
from app.ai.critic import QuestionCritic, gemini_critic, openai_compatible_critic
from app.ai.embeddings import EmbeddingModel, local_embedding
from app.ai.judge import (
    PROVIDERS,
    AnswerJudge,
    Provider,
    gemini_judge,
    openai_compatible_judge,
)
from app.ai.vision import FallbackVisionModel, VisionModel, gemini_vision, openai_compatible_vision
from app.config import ProviderName, Settings
from app.errors import ConfigurationError
from app.services.drawing_judge import DrawingJudge, VisionDrawingJudge
from app.services.reader import AnswerReader, FallbackReader, VisionAnswerReader


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


def build_classifier(settings: Settings) -> TopicClassifier | None:
    """The model that suggests syllabus topics for a question.

    An evaluation task like judging, not an authoring one, so it follows AI_PROVIDER
    the same way build_judge does - Groq's openai/gpt-oss-120b in this project's own
    .env. Gemini is not supported here: classification only needs plain structured
    text output, and keeping it on the same provider as judging keeps one quota
    shared between the two instead of two providers to configure.
    """
    if settings.ai_provider == ProviderName.GEMINI:
        return None
    base_url, default_model, needs_key = _openai_compatible_target(settings)
    if needs_key and not settings.ai_api_key:
        return None
    return openai_compatible_classifier(settings.ai_api_key, base_url, settings.ai_model or default_model)


def build_embedding_model(settings: Settings) -> EmbeddingModel | None:
    """The model that turns text into vectors for resource retrieval.

    Local only, via sentence-transformers - not an API call, so there is no key to
    check and no provider choice to follow the way the judge and author do. The first
    call loads the model's weights (a few seconds); local_embedding() caches the
    instance so that only happens once per process. None if that load itself fails
    (the package is not installed, the model cannot be found/downloaded) - resource
    embedding and search then answer 503 instead of the whole app failing to start.
    """
    try:
        return local_embedding(settings.embedding_model)
    except Exception:  # noqa: BLE001 - any load failure, not just the ones above
        return None


def build_reader(settings: Settings) -> AnswerReader | None:
    """The handwriting reader, or None when no vision model is configured.

    With a fallback provider set, a primary model that fails (busy, rate limited,
    quota used up) falls through to the second one instead of failing the upload,
    and from there to the second fallback (see build_second_fallback_vision_model).
    """
    readers = [VisionAnswerReader(model) for model in _vision_models_in_order(settings)]
    if not readers:
        return None
    return readers[0] if len(readers) == 1 else FallbackReader(readers)


def build_drawing_judge(settings: Settings) -> DrawingJudge | None:
    """The vision model that judges a drawn answer, or None when no vision model is
    configured (drawing points then always go to a teacher, as before this existed).

    Reuses the same provider/fallback chain as build_reader - this just wraps it to
    judge instead of transcribe.
    """
    model = build_vision_model_with_fallback(settings)
    return VisionDrawingJudge(model) if model else None


def build_vision_model(settings: Settings) -> VisionModel | None:
    """The configured model that can see images, or None when no key is set."""
    return _build_vision_model(settings.vision_provider, settings.vision_model, settings)


def build_vision_model_with_fallback(settings: Settings) -> VisionModel | None:
    """The configured vision model, falling back to the backup providers (if set)
    when the primary one is busy, rate limited or has used up its quota.

    Same resilience build_reader already gives the handwriting reader, but for any
    other caller of VisionModel.ask directly - e.g. the past-paper importer, which
    needs a plain VisionModel rather than an AnswerReader.
    """
    models = _vision_models_in_order(settings)
    if not models:
        return None
    return models[0] if len(models) == 1 else FallbackVisionModel(models)


def _vision_models_in_order(settings: Settings) -> list[VisionModel]:
    primary = build_vision_model(settings)
    fallback = build_fallback_vision_model(settings)
    second_fallback = build_second_fallback_vision_model(settings)
    return [model for model in (primary, fallback, second_fallback) if model is not None]


def build_fallback_vision_model(settings: Settings) -> VisionModel | None:
    """The backup vision model, or None when no fallback provider is configured."""
    if settings.vision_fallback_provider is None:
        return None
    return _build_vision_model(settings.vision_fallback_provider, settings.vision_fallback_model, settings)


def build_second_fallback_vision_model(settings: Settings) -> VisionModel | None:
    """A third vision model, tried only if both the primary and the first fallback
    fail. Exists because a free tier's own limit can itself be too small for a
    whole exam page's structured output (seen on Groq's per-minute output-token
    cap), not just unavailable outright - a different provider's own key, set
    separately from AI_API_KEY above (e.g. an OpenRouter token, not a Groq one).
    Needs its own key even for a provider AI_API_KEY already covers: reusing that
    key here would not add any real resilience, since it is the same quota the
    first fallback already just used up.
    """
    if settings.vision_fallback_2_provider is None or not settings.vision_fallback_2_api_key:
        return None
    return _build_vision_model(
        settings.vision_fallback_2_provider,
        settings.vision_fallback_2_model,
        settings,
        api_key=settings.vision_fallback_2_api_key,
    )


_NO_OVERRIDE = object()  # distinguishes "use settings.ai_api_key" from "use this key, even if falsy"


def _build_vision_model(
    provider_name: ProviderName,
    model_override: str | None,
    settings: Settings,
    api_key: str | None | object = _NO_OVERRIDE,
) -> VisionModel | None:
    if provider_name == ProviderName.GEMINI:
        if not settings.gemini_api_key:
            return None
        return gemini_vision(settings.gemini_api_key, model_override or settings.gemini_model)

    key = settings.ai_api_key if api_key is _NO_OVERRIDE else api_key
    provider = _provider(provider_name, settings)
    if provider.needs_key and not key:
        return None
    base_url = settings.ai_base_url or provider.base_url
    return openai_compatible_vision(key, base_url, model_override or provider.default_model)


def _provider(name: ProviderName, settings: Settings) -> Provider:
    if name != ProviderName.CUSTOM:
        return PROVIDERS[name]
    if not settings.ai_base_url:
        raise ConfigurationError("A custom provider needs AI_BASE_URL")
    return Provider(settings.ai_base_url, settings.ai_model or "", needs_key=True)
