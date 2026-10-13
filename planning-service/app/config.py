from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    supabase_jwt_secret: str
    ingest_api_key: str
    model_dir: Path = Path("models")
    assessment_service_url: AnyHttpUrl | None = None
    assessment_service_api_key: str | None = None
    hybrid_model_enabled: bool = False
    hybrid_model_stacking_weight: float = 0.35
    hybrid_model_max_history: int = 24

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
