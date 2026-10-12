import asyncio
from datetime import UTC, datetime

import httpx
import pytest

from app.adapters.evidence_sources import PullEvidenceSource
from app.config import settings
from app.errors import PlanningError, UpstreamServiceError


def test_pull_source_requires_configured_assessment_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "assessment_service_url", None)

    with pytest.raises(PlanningError, match="ASSESSMENT_SERVICE_URL"):
        asyncio.run(PullEvidenceSource().fetch_assessment_events())


def test_pull_source_fetches_and_validates_assessment_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested: list[httpx.Request] = []
    event = {
        "event_id": "assessment-pulled-001",
        "student_id": "student-123",
        "occurred_at": "2026-10-12T09:00:00Z",
        "evidence": [
            {
                "topic_id": "chem-u3-mole-concept",
                "score": 4,
                "max_score": 5,
            }
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request)
        return httpx.Response(200, json={"events": [event]})

    monkeypatch.setattr(settings, "assessment_service_url", "https://assessment.example")
    monkeypatch.setattr(settings, "assessment_service_api_key", "assessment-key")
    source = PullEvidenceSource(transport=httpx.MockTransport(handler))
    since = datetime(2026, 10, 1, tzinfo=UTC)

    events = asyncio.run(source.fetch_assessment_events(since))

    assert len(events) == 1
    assert events[0].event_id == "assessment-pulled-001"
    assert requested[0].url.path == "/api/v1/assessment-events"
    assert requested[0].url.params["since"] == since.isoformat()
    assert requested[0].headers["X-API-Key"] == "assessment-key"


def test_pull_source_reports_upstream_http_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "assessment_service_url", "https://assessment.example")
    source = PullEvidenceSource(transport=httpx.MockTransport(lambda request: httpx.Response(503)))

    with pytest.raises(UpstreamServiceError, match="HTTP 503"):
        asyncio.run(source.fetch_assessment_events())
