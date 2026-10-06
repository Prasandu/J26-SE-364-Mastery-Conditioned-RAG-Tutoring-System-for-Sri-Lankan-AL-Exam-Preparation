from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings. Values come from environment variables or the .env file."""

    # env_ignore_empty: "DATABASE_URL=" (empty) falls back to the default below.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    app_name: str = "Assessment Service"
    app_env: str = "development"
    database_url: str = "sqlite:///./assessment.db"
    # Key for the /admin endpoints. Empty = admin endpoints are switched off.
    admin_api_key: str | None = Field(default=None, min_length=16)

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
