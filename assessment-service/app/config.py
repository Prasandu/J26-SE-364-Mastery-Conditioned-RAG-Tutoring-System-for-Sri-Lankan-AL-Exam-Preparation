from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.services.judge import ProviderName


class Settings(BaseSettings):
    """App settings. Values come from environment variables or the .env file."""

    # env_ignore_empty: "DATABASE_URL=" (empty) falls back to the default below.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    app_name: str = "Assessment Service"
    app_env: str = "development"
    database_url: str = "sqlite:///./assessment.db"
    # Key for the /admin endpoints. Empty = admin endpoints are switched off.
    admin_api_key: str | None = Field(default=None, min_length=16)
    # Key for the /review endpoints used by teachers. Empty = teacher review is switched off.
    teacher_api_key: str | None = Field(default=None, min_length=16)

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

    # Reading handwriting. Needs a model that can see images (Groq's cannot).
    vision_provider: ProviderName = ProviderName.GEMINI
    vision_model: str | None = None  # empty = the provider's default
    upload_dir: Path = Path("uploads")
    max_upload_mb: float = Field(default=8.0, gt=0, le=50)

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
