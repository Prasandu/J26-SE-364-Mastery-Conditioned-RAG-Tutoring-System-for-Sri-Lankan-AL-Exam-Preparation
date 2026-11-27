"""DAT-010 consumer, no database: the v1 event schema, the feed client's credential /
timeout / retry behaviour, the service-only routes, and parity with the shared contract."""

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.adapters.assessment_feed import AssessmentFeedClient, UpstreamAuthError
from app.config import settings
from app.errors import ServiceUnavailable, UpstreamServiceError
from app.schemas.finalized_marks import EVENT_NAMESPACE, FinalizedMarkEvent, event_id_for

CONTRACTS = Path(__file__).resolve().parents[2] / "shared" / "contracts"
CONTRACT = CONTRACTS / "assessment-criterion-finalized.v1.json"
KEY = "planner-integration-key-for-tests"
STUDENT = "6f1c0d2e-8b3a-4c5d-9e7f-0a1b2c3d4e5f"
ATTEMPT = "0ad4ab23-0a22-4546-8027-1293a67fb020"


def event(**overrides):
    entity = overrides.pop("source_entity_id", f"attempt/{ATTEMPT}/point/P1")
    version = overrides.pop("source_version", 0)
    body = {
        "schema_version": "1.0.0",
        "event_id": event_id_for(entity, version),
        "event_type": "assessment.criterion.finalized",
        "producer": "assessment-service",
        "subject_user_id": STUDENT,
        "source_entity_id": entity,
        "source_version": version,
        "source_topic_codes": ["U03_5"],
        "status": "final",
        "evidence_class": "deterministic",
        "score": {"awarded": 2, "maximum": 3},
        "paper_id": 7,
        "assessed_at": "2026-11-20T08:00:00Z",
        "occurred_at": "2026-11-20T09:00:00Z",
    }
    body.update(overrides)
    return body


def page(events=(), **overrides):
    return {"schema_version": "1.0.0", "as_of": "2026-11-27T00:00:00Z", "events": list(events), **overrides}


# --- schema -------------------------------------------------------------------------------


def test_a_valid_event_parses_and_normalises_times_to_utc():
    parsed = FinalizedMarkEvent.model_validate(
        event(occurred_at="2026-11-20T14:30:00+05:30", future_field="ignored")
    )

    assert parsed.occurred_at == datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
    assert parsed.subject_user_id == uuid.UUID(STUDENT)


@pytest.mark.parametrize(
    "overrides",
    [
        {"schema_version": "2.0.0"},
        {"event_id": str(uuid.uuid4())},  # not the contract's derived id
        {"source_version": 1},  # id derived for version 0, claims version 1
        {"subject_user_id": "student@example.com"},
        {"source_entity_id": "attempt/x/point/P1"},
        {"status": "provisional"},
        {"producer": "someone-else"},
        {"score": {"awarded": 4, "maximum": 3}},
        {"score": {"awarded": 1, "maximum": 0}},
        {"assessed_at": "2026-11-20T08:00:00"},  # no timezone
    ],
)
def test_malformed_events_are_refused(overrides):
    body = event()
    body.update(overrides)
    with pytest.raises(ValidationError):
        FinalizedMarkEvent.model_validate(body)


def test_the_schema_matches_the_shared_contract():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    assert set(contract["required"]) == set(FinalizedMarkEvent.model_fields)
    assert contract["x-eventIdNamespace"] == str(EVENT_NAMESPACE)
    assert set(contract["properties"]["evidence_class"]["enum"]) == {"deterministic", "teacher_verified"}


# --- feed client --------------------------------------------------------------------------


def client(handler, sleeps=None, **kwargs):
    return AssessmentFeedClient(
        "https://assessment.internal",
        KEY,
        transport=httpx.MockTransport(handler),
        sleep=(sleeps.append if sleeps is not None else lambda _: None),
        **kwargs,
    )


@pytest.mark.parametrize("url,key", [("", KEY), ("https://assessment.internal", ""), ("x", "   ")])
def test_missing_url_or_key_fails_closed_before_any_request(url, key):
    with pytest.raises(ServiceUnavailable):
        AssessmentFeedClient(url, key, transport=httpx.MockTransport(lambda r: pytest.fail("called")))


def test_settings_without_a_key_fail_closed(monkeypatch):
    monkeypatch.setattr(settings, "assessment_service_url", "https://assessment.internal")
    monkeypatch.setattr(settings, "assessment_service_api_key", None)
    with pytest.raises(ServiceUnavailable, match="ASSESSMENT_SERVICE_API_KEY"):
        AssessmentFeedClient.from_settings()


def test_the_request_carries_the_service_key_and_no_user_token():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=page([event()], next_cursor="c1", has_more=False))

    since = datetime(2026, 11, 1, tzinfo=UTC)
    result = client(handler).fetch_page(since=since, after="c0", limit=50)

    request = seen[0]
    assert request.url.path == "/integration/events"
    assert request.headers["X-Integration-Key"] == KEY
    assert "authorization" not in {name.lower() for name in request.headers}
    assert request.url.params["since"] == since.isoformat()
    assert request.url.params["after"] == "c0" and request.url.params["limit"] == "50"
    assert result.next_cursor == "c1" and len(result.events) == 1


@pytest.mark.parametrize("status", [401, 403])
def test_a_refused_key_is_not_retried_and_not_echoed(status):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, json={"detail": "Invalid integration key"})

    with pytest.raises(UpstreamAuthError) as info:
        client(handler).fetch_page(since=None, after=None, limit=10)

    assert len(calls) == 1
    assert KEY not in str(info.value)


def test_transient_failures_are_retried_with_exponential_backoff():
    responses = iter([httpx.Response(503), httpx.Response(502), httpx.Response(200, json=page())])
    sleeps = []

    result = client(lambda request: next(responses), sleeps).fetch_page(since=None, after=None, limit=10)

    assert result.events == []
    assert sleeps == [0.5, 1.0]


def test_retries_are_bounded_and_retry_after_is_capped():
    calls, sleeps = [], []

    def handler(request):
        calls.append(request)
        return httpx.Response(429, headers={"Retry-After": "3600"})

    with pytest.raises(UpstreamServiceError, match="after 3 attempts"):
        client(handler, sleeps).fetch_page(since=None, after=None, limit=10)

    assert len(calls) == 3
    assert sleeps == [30.0, 30.0]


def test_connection_errors_are_retried_then_reported_without_the_key():
    calls = []

    def handler(request):
        calls.append(request)
        raise httpx.ConnectTimeout("timed out", request=request)

    with pytest.raises(UpstreamServiceError) as info:
        client(handler).fetch_page(since=None, after=None, limit=10)

    assert len(calls) == 3
    assert "ConnectTimeout" in str(info.value) and KEY not in str(info.value)


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(404),
        httpx.Response(302, headers={"Location": "https://elsewhere.example/steal"}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"events": "nope", "schema_version": "1.0.0"}),
        httpx.Response(200, json=page(schema_version="2.0.0")),
    ],
)
def test_other_failures_are_not_retried(response):
    calls = []

    def handler(request):
        calls.append(request)
        return response

    with pytest.raises(UpstreamServiceError):
        client(handler).fetch_page(since=None, after=None, limit=10)

    assert len(calls) == 1  # and a redirect is never followed with the key


def test_the_client_never_shows_its_key():
    assert KEY not in repr(client(lambda request: httpx.Response(200)))


# --- service-only routes ------------------------------------------------------------------


@pytest.fixture
def api():
    from app.main import app

    return TestClient(app)


@pytest.mark.parametrize(
    "method,path",
    [
        ("post", "/api/v1/integration/assessment/pull"),
        ("get", "/api/v1/integration/assessment/quarantine"),
        ("post", "/api/v1/integration/assessment/quarantine/release"),
    ],
)
@pytest.mark.parametrize(
    "headers",
    [{}, {"X-API-Key": "wrong-key"}, {"Authorization": "Bearer a-students-browser-token"}],
)
def test_integration_routes_need_the_planner_service_key(api, method, path, headers):
    response = getattr(api, method)(path, headers=headers)

    assert response.status_code == 401


def test_pull_fails_closed_without_the_assessment_key(api, monkeypatch):
    monkeypatch.setattr(settings, "assessment_service_url", "https://assessment.internal")
    monkeypatch.setattr(settings, "assessment_service_api_key", "")

    response = api.post("/api/v1/integration/assessment/pull", headers={"X-API-Key": settings.ingest_api_key})

    assert response.status_code == 503
    assert "ASSESSMENT_SERVICE_API_KEY" in response.json()["detail"]
