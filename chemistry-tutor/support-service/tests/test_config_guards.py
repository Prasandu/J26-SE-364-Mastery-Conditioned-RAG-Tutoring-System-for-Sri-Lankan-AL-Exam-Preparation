"""R06 and SEC-007c configuration guards (no app import, so this runs without the
service's model dependencies: `pytest --noconftest tests/test_config_guards.py`)."""

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_refuse_the_raw_tutor_in_production():
    with pytest.raises(ValidationError, match="ENABLE_RAW_TUTOR"):
        Settings(_env_file=None, environment="production", enable_raw_tutor=True)


def test_raw_tutor_is_off_by_default_and_allowed_only_outside_production():
    assert not Settings(_env_file=None).enable_raw_tutor
    assert Settings(_env_file=None, environment="development", enable_raw_tutor=True).enable_raw_tutor


def test_short_integration_keys_are_refused():
    with pytest.raises(ValidationError, match="INTEGRATION_KEY_COMPONENT2"):
        Settings(_env_file=None, integration_key_component2="short")
    assert Settings(_env_file=None, integration_key_component2="k" * 16).integration_key_component2
