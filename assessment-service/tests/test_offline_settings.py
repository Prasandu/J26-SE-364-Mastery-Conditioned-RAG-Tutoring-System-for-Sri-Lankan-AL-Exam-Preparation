"""Guard for conftest.py's promise: tests never see the developer's .env, so no real
database URL or AI/Supabase key can reach a test (and no paid API can be called)."""

from app.config import Settings, get_settings


def test_settings_ignore_the_developers_env_file():
    for settings in (Settings(), get_settings()):
        assert settings.database_url == "sqlite://"
        assert settings.gemini_api_key is None
        assert settings.ai_api_key is None
        assert settings.vision_fallback_2_api_key is None
        assert settings.supabase_url is None
        assert settings.jwt_secret is None
