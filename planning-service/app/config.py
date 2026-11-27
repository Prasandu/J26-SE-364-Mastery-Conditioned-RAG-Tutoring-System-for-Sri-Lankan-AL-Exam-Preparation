from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    supabase_jwt_secret: str = ""
    supabase_url: str = ""
    supabase_jwks_url: str = ""
    ingest_api_key: str
    # development | test | production. Production refuses demo mode (below).
    environment: str = "development"
    # Demo routes take a student id from the URL (gated by INGEST_API_KEY and an
    # allowlist): for local demonstrations only, never in production.
    demo_mode: bool = False
    # Comma-separated frontend origins allowed to call the API (CORS),
    # e.g. "http://localhost:5173,https://alstudyhub.example.lk".
    cors_origins: str = "http://localhost:5173"
    demo_student_ids: str = ""
    model_dir: Path = Path("models")
    assessment_service_url: AnyHttpUrl | None = None
    assessment_service_api_key: str | None = None
    # DAT-010 finalized-mark pull: pages per run and events per page (the producer caps at 2000).
    assessment_feed_max_pages: int = Field(default=20, ge=1, le=200)
    assessment_feed_page_size: int = Field(default=500, ge=1, le=2000)
    hybrid_model_enabled: bool = False
    hybrid_model_stacking_weight: float = 0.35
    hybrid_model_max_history: int = 24
    # Minutes after a session ends before an untouched task counts as missed.
    # Set e.g. MISSED_GRACE_MINUTES=0.5 to demo the missed flow live.
    missed_grace_minutes: float = 30
    # Daily motivation messages. Defaults to shared/contracts/motivation_messages.json
    # in the repository; in Docker, mount that folder and point this at it.
    motivation_messages_path: Path | None = None
    # Optional well-being hook ("package.module:function"). The function gets a
    # student ID and returns True when the student is flagged as highly
    # stressed; the motivation card is then skipped.
    motivation_stress_hook: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    @model_validator(mode="after")
    def _no_demo_mode_in_production(self) -> "Settings":
        if self.demo_mode and self.environment.strip().lower() == "production":
            raise ValueError("DEMO_MODE must not be true when ENVIRONMENT=production")
        return self

    @property
    def allowed_cors_origins(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_demo_student_ids(self) -> set[str]:
        return {student_id.strip() for student_id in self.demo_student_ids.split(",") if student_id.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
