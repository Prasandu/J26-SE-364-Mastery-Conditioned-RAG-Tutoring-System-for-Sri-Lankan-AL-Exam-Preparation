from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    supabase_jwt_secret: str = ""
    supabase_url: str = ""
    supabase_jwks_url: str = ""
    ingest_api_key: str
    demo_mode: bool = False
    demo_student_ids: str = ""
    model_dir: Path = Path("models")
    assessment_service_url: AnyHttpUrl | None = None
    assessment_service_api_key: str | None = None
    hybrid_model_enabled: bool = False
    hybrid_model_stacking_weight: float = 0.35
    hybrid_model_max_history: int = 24
    # Minutes after a session ends before an untouched task counts as missed.
    # Set e.g. MISSED_GRACE_MINUTES=0.5 to demo the missed flow live.
    missed_grace_minutes: float = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    @property
    def allowed_demo_student_ids(self) -> set[str]:
        return {student_id.strip() for student_id in self.demo_student_ids.split(",") if student_id.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
