"""SEC-004 startup rules: durable sessions need a database and Supabase owners, and
production refuses in-memory sessions (lost on restart)."""

import pytest

from app.settings import ConfigurationError
from tests.conftest import make_settings

JWKS = "https://example.supabase.co/auth/v1/.well-known/jwks.json"


def test_postgres_sessions_need_a_database_url() -> None:
    with pytest.raises(ConfigurationError, match="LAB_DATABASE_URL"):
        make_settings(
            repository="postgres", principal_provider="supabase_jwt", supabase_jwks_url=JWKS
        ).validate_for_startup()


def test_postgres_sessions_need_supabase_owners() -> None:
    with pytest.raises(ConfigurationError, match="supabase_jwt"):
        make_settings(
            repository="postgres", database_url="postgresql://x@127.0.0.1/lab"
        ).validate_for_startup()


def test_production_refuses_in_memory_sessions() -> None:
    settings = make_settings(
        environment="production",
        principal_provider="supabase_jwt",
        supabase_jwks_url=JWKS,
        fixed_seed=None,
        repository="memory",
    )
    with pytest.raises(ConfigurationError, match="LAB_REPOSITORY=postgres"):
        settings.validate_for_startup()


def test_production_with_postgres_and_supabase_passes_these_rules() -> None:
    settings = make_settings(
        environment="production",
        principal_provider="supabase_jwt",
        supabase_jwks_url=JWKS,
        fixed_seed=None,
        repository="postgres",
        database_url="postgresql://x@127.0.0.1/lab",
    )
    try:
        settings.validate_for_startup()
    except ConfigurationError as exc:  # other production rules may still apply - not these
        assert "LAB_REPOSITORY" not in str(exc) and "LAB_DATABASE_URL" not in str(exc)
