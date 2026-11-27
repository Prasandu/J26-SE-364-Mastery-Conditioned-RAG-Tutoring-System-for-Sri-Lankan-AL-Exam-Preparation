from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Chemistry Tutor API"
    environment: str = "development"

    # Supabase
    supabase_url: str = ""
    supabase_key: str = ""
    db_schema: str = "support"
    database_url: str = ""

    # LLM provider (filled in later step)
    llm_provider: str = "groq"
    groq_api_key: str = ""

    # Sinhala speech-to-text only (app/services/speech/transcription.py) —
    # English STT stays on Groq Whisper.
    gemini_api_key: str = ""

    # POST /tutor/ask-raw is an UNGROUNDED model call kept only to compare against
    # the grounded /tutor/ask during development. Off unless explicitly enabled,
    # and never allowed in production (checked below, so the service refuses to start).
    enable_raw_tutor: bool = False

    # Service-to-service credentials for machine ingestion (POST
    # /practice/flagged-questions), one per calling component, sent as
    # X-Integration-Key - the same scheme as assessment-service's /integration API.
    # Empty = that component cannot call in. Never an end-user token.
    integration_key_component2: str = ""  # assessment (reports wrong answers)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def _raw_tutor_never_in_production(self) -> "Settings":
        if self.enable_raw_tutor and self.environment.strip().lower() == "production":
            raise ValueError("ENABLE_RAW_TUTOR must not be true when ENVIRONMENT=production")
        if self.integration_key_component2 and len(self.integration_key_component2) < 16:
            raise ValueError("INTEGRATION_KEY_COMPONENT2 must be at least 16 characters")
        return self


settings = Settings()
