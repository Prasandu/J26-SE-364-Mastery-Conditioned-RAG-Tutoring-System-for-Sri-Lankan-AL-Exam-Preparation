"""R06: production refuses demo mode (demo routes take a student id from the URL)."""

import pytest
from pydantic import ValidationError

from app.config import Settings

REQUIRED = {"database_url": "sqlite://", "ingest_api_key": "test-key"}


def test_demo_mode_is_refused_in_production():
    with pytest.raises(ValidationError, match="DEMO_MODE"):
        Settings(_env_file=None, environment="production", demo_mode=True, **REQUIRED)


@pytest.mark.parametrize("environment", ["development", "test"])
def test_demo_mode_is_allowed_outside_production(environment):
    assert Settings(_env_file=None, environment=environment, demo_mode=True, **REQUIRED).demo_mode


def test_production_without_demo_mode_starts():
    assert not Settings(_env_file=None, environment="production", **REQUIRED).demo_mode
