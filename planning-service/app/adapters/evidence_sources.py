from datetime import datetime
from typing import Protocol

import httpx
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import settings
from app.errors import ServiceUnavailable, UpstreamServiceError
from app.schemas.events import AssessmentEvent, IngestionResult, ModuleCompletionEvent
from app.services.event_ingestion import ingest_assessment_event, ingest_module_completion


class EvidenceSource(Protocol):
    def ingest_assessment(
        self,
        session: Session,
        event: AssessmentEvent,
    ) -> dict[str, object]: ...

    def ingest_module_completion(
        self,
        session: Session,
        event: ModuleCompletionEvent,
    ) -> dict[str, object]: ...


class PushEvidenceSource:
    """Accept evidence pushed into the planning service's authenticated API."""

    def ingest_assessment(
        self,
        session: Session,
        event: AssessmentEvent,
    ) -> dict[str, object]:
        return ingest_assessment_event(session, event)

    def ingest_module_completion(
        self,
        session: Session,
        event: ModuleCompletionEvent,
    ) -> dict[str, object]:
        return ingest_module_completion(session, event)


class PullEvidenceSource(PushEvidenceSource):
    """Fetch assessment events from the configured assessment-service API."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    async def fetch_assessment_events(self, since: datetime | None = None) -> list[AssessmentEvent]:
        base_url = settings.assessment_service_url
        if base_url is None:
            raise ServiceUnavailable("ASSESSMENT_SERVICE_URL is not configured.")

        headers = {}
        if settings.assessment_service_api_key:
            headers["X-API-Key"] = settings.assessment_service_api_key

        try:
            async with httpx.AsyncClient(
                base_url=str(base_url).rstrip("/"),
                timeout=httpx.Timeout(10.0, connect=3.0),
                transport=self._transport,
            ) as client:
                response = await client.get(
                    "/api/v1/assessment-events",
                    params={"since": since.isoformat()} if since is not None else None,
                    headers=headers,
                )
                response.raise_for_status()

            body = response.json()
            events = body.get("events") if isinstance(body, dict) else body
            if not isinstance(events, list):
                raise UpstreamServiceError("Assessment-service response must contain an event array.")
            return [AssessmentEvent.model_validate(event) for event in events]
        except httpx.HTTPStatusError as exc:
            raise UpstreamServiceError(
                f"Assessment service returned HTTP {exc.response.status_code}."
            ) from exc
        except httpx.RequestError as exc:
            raise UpstreamServiceError("Could not reach the assessment service.") from exc
        except (ValueError, ValidationError) as exc:
            raise UpstreamServiceError("Assessment service returned an invalid event response.") from exc

    async def pull_and_ingest(
        self,
        session: Session,
        since: datetime | None = None,
    ) -> list[IngestionResult]:
        events = await self.fetch_assessment_events(since)
        return [
            IngestionResult.model_validate(
                ingest_assessment_event(session, event, source="assessment-service")
            )
            for event in events
        ]


push_evidence_source: EvidenceSource = PushEvidenceSource()
