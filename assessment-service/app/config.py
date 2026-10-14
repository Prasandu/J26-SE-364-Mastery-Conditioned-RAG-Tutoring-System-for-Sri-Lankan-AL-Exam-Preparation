from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class ProviderName(StrEnum):
    """Which AI service to call. The base URLs live in app/ai/judge.py."""

    GEMINI = "gemini"
    GROQ = "groq"
    OPENROUTER = "openrouter"
    CEREBRAS = "cerebras"
    GITHUB = "github"
    OLLAMA = "ollama"
    CUSTOM = "custom"  # any other OpenAI-compatible service; set AI_BASE_URL yourself


class Settings(BaseSettings):
    """App settings. Values come from environment variables or the .env file."""

    # env_ignore_empty: "DATABASE_URL=" (empty) falls back to the default below.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    app_name: str = "Assessment Service"
    app_env: str = "development"
    database_url: str = "sqlite:///./assessment.db"

    # Signs login tokens (see app/services/auth.py). Empty = /auth is switched off,
    # and with it every /admin and /review route, which now need a real signed-in
    # account of the right role - there is no shared-key fallback any more. A real
    # deployment sets a long random value and never changes it without expecting
    # every signed-in user to be logged out - changing it invalidates every token
    # already issued.
    jwt_secret: str | None = Field(default=None, min_length=32)
    jwt_expires_minutes: int = Field(default=60 * 24, ge=1)  # a day, so a student is not logged out mid-paper

    # The /integration routes: read-only endpoints the other three components of
    # this group project (J26-SE-364) call to get a student's marks, topic
    # performance and error categories from this one. Not a human login - each
    # teammate's own service holds one of these keys, so a key can be revoked for
    # one component without affecting the others. Empty = that component's calls
    # are rejected (see app/security.py's require_integration_caller).
    integration_key_component1: str | None = Field(default=None, min_length=16)  # Virtual Chem. Laboratory
    integration_key_component3: str | None = Field(default=None, min_length=16)  # Analytics & Exam Planning
    integration_key_component4: str | None = Field(default=None, min_length=16)  # AI Cognitive Support

    # AI judge for written answers. Without a key, written answers stay "pending".
    ai_provider: ProviderName = ProviderName.GEMINI
    # AI decisions below this confidence go to teacher review instead of counting.
    ai_min_confidence: float = Field(default=0.7, ge=0, le=1)
    # Also ask the AI about points the checker decided. Disagreement -> teacher.
    ai_cross_check: bool = True

    # Google Gemini (ai_provider=gemini)
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"  # a fixed version, so research results are repeatable

    # Every other provider (Groq, OpenRouter, Cerebras, GitHub Models, Ollama, custom)
    ai_api_key: str | None = None
    ai_model: str | None = None  # empty = the provider's default model
    ai_base_url: str | None = None  # only needed when ai_provider=custom

    # Reading handwriting. Needs a model that can see images.
    vision_provider: ProviderName = ProviderName.GEMINI
    vision_model: str | None = None  # empty = the provider's default

    # Backup reader, tried only if the primary one fails (busy, rate limited, quota
    # used up) - an upload then still succeeds instead of failing outright.
    # None = no fallback. A provider's own default model is rarely vision-capable
    # (e.g. Groq's is a text model), so set VISION_FALLBACK_MODEL explicitly too.
    vision_fallback_provider: ProviderName | None = None
    vision_fallback_model: str | None = None

    # A second, independent backup - tried only if both the primary and the first
    # fallback fail. Exists because a free tier's own limit can be too small for a
    # whole page's structured output (seen on Groq's per-minute output-token cap on
    # a dense exam page), not just unavailable outright. Its own key, since it is
    # typically a different provider from AI_API_KEY above (e.g. an OpenRouter
    # token, not a Groq one).
    vision_fallback_2_provider: ProviderName | None = None
    vision_fallback_2_model: str | None = None
    vision_fallback_2_api_key: str | None = None

    # Resource retrieval (RAG). Always Gemini: Groq has no embedding endpoint.
    # 768, not the model's default 3072, after measuring both (see docs/rag-resources.md).
    embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = Field(default=768, gt=0, le=3072)
    # Below this cosine similarity a passage is not relevant enough to ground a
    # question with - excluded, not padded in as a low-quality result.
    resource_min_similarity: float = Field(default=0.5, ge=0, le=1)
    resource_passages_per_topic: int = Field(default=2, ge=0, le=10)
    resources_dir: Path = Path("resources")  # original PDFs; never served to a browser
    max_resource_upload_mb: float = Field(default=40.0, gt=0, le=200)
    upload_dir: Path = Path("uploads")
    max_upload_mb: float = Field(default=8.0, gt=0, le=50)

    # Verifying a generated question. The deterministic validators always run; this
    # only decides whether a second model is also asked to critique it, which costs
    # another call per question out of the same small free quota.
    verify_with_ai: bool = False
    # How many times a section may be asked for again when questions are rejected.
    # Bounded on purpose: a bad run must end with a clear error, not a loop.
    generate_max_attempts: int = Field(default=2, ge=1, le=5)

    # Practice papers a student may generate per day. The AI quota is shared and
    # small, so one person cannot use it all up.
    practice_papers_per_day: int = Field(default=3, ge=0, le=50)
    practice_questions_at_once: int = Field(default=15, ge=1, le=60)
    # A whole-service ceiling as well. The per student cap is keyed on a name the
    # caller chooses, so on its own it stops an honest student, not a determined one.
    practice_papers_per_day_total: int = Field(default=40, ge=0, le=1000)

    # Browsers only let these origins call the API. Comma separated, never "*",
    # because the admin and teacher keys travel in headers.
    # NoDecode: read CORS_ORIGINS as plain text, not as JSON, so split_origins can see it.
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5180",
        "http://127.0.0.1:5180",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        """CORS_ORIGINS in .env is one line: "http://a, http://b"."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("ai_provider", mode="before")
    @classmethod
    def accept_any_capitalisation(cls, value: object) -> object:
        """ "Groq" and "GROQ" in .env mean the same as "groq"."""
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, url: str) -> str:
        """Supabase gives 'postgresql://...'. SQLAlchemy needs the driver name in the URL."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url.removeprefix(prefix)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
