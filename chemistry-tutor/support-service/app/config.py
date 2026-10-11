from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Chemistry Tutor API"
    environment: str = "development"

    # Supabase (filled in later step)
    supabase_url: str = ""
    supabase_key: str = ""
    db_schema: str = "support"

    # LLM provider (filled in later step)
    llm_provider: str = "groq"
    groq_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
