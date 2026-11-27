"""Shared test setup for the assessment service.

The original conftest.py was never committed (a `tests/` rule in the root .gitignore,
added in 2f7f981, kept every test except test_health.py out of git), so the `client`
fixture test_health.py expects did not exist. This restores it.

Every test runs offline. The developer's .env is NOT read at all: Settings uses
env_ignore_empty=True, so blanking a key in the environment would silently fall back
to the real key in .env. With .env switched off, the app gets a throwaway SQLite
database and no AI provider, reader or Supabase project - nothing here can reach a
real service or spend a paid API quota.
"""

import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["APP_ENV"] = "test"

from app.config import Settings  # noqa: E402  (light: no app modules imported yet)

Settings.model_config["env_file"] = None

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
