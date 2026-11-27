"""SEC-008: machine callers authenticate with their own key on X-Integration-Key.

- /api/v1/events/*: a component key (lab, assessment, tutor) or the operator key.
- operator-only routes (finalized-mark pull, quarantine): only INGEST_API_KEY.
- the old X-API-Key header still carries the operator key for one release.
- a student's browser token is never a service credential; wrong/missing key 401,
  nothing configured 503. Auth runs before the body is read, so a 422 proves auth passed.
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, settings
from app.main import app

LAB, ASSESS, TUTOR = "lab-component-key-123456", "assessment-component-key", "tutor-component-key-1234"
OPERATOR = "operator-ingest-key-123456"
EVENTS = "/api/v1/events/assessment"
OPERATOR_ROUTE = "/api/v1/integration/assessment/quarantine"


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(settings, "ingest_api_key", OPERATOR)
    monkeypatch.setattr(settings, "integration_key_component1", LAB)
    monkeypatch.setattr(settings, "integration_key_component2", ASSESS)
    monkeypatch.setattr(settings, "integration_key_component4", TUTOR)
    return TestClient(app)


@pytest.mark.parametrize("key", [LAB, ASSESS, TUTOR, OPERATOR])
def test_each_component_key_is_accepted_on_the_event_api(api, key):
    response = api.post(EVENTS, json={}, headers={"X-Integration-Key": key})

    assert response.status_code == 422  # authenticated; the empty body is then refused


def test_the_old_header_still_carries_the_operator_key(api):
    assert api.post(EVENTS, json={}, headers={"X-API-Key": OPERATOR}).status_code == 422


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"X-Integration-Key": "not-a-real-key-at-all"},
        {"Authorization": "Bearer a-students-browser-token"},
        {"X-Integration-Key": LAB[:-1]},
    ],
)
def test_no_valid_key_is_401(api, headers):
    assert api.post(EVENTS, json={}, headers=headers).status_code == 401


@pytest.mark.parametrize("key", [LAB, ASSESS, TUTOR])
def test_a_component_key_cannot_use_operator_routes(api, key):
    assert api.get(OPERATOR_ROUTE, headers={"X-Integration-Key": key}).status_code == 401


def test_nothing_configured_fails_closed(api, monkeypatch):
    for name in (
        "ingest_api_key",
        "integration_key_component1",
        "integration_key_component2",
        "integration_key_component4",
    ):
        monkeypatch.setattr(settings, name, "")

    assert api.post(EVENTS, json={}, headers={"X-Integration-Key": LAB}).status_code == 503


def test_short_component_keys_are_refused_at_startup():
    with pytest.raises(ValidationError, match="INTEGRATION_KEY_COMPONENT2"):
        Settings(
            _env_file=None, database_url="sqlite://", ingest_api_key="x", integration_key_component2="short"
        )
