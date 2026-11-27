"""DAT-010: read assessment-service's finalized-mark feed (GET /integration/events) with the
planner's own service credential, and apply it page by page.

- Credential: X-Integration-Key = ASSESSMENT_SERVICE_API_KEY (assessment's
  INTEGRATION_KEY_COMPONENT3). Never a student's token; never logged, returned or put in
  an error message. No key or no URL: refuse before any request (fail closed).
- Bounded: 10 s per request (3 s to connect), at most 3 attempts with exponential backoff
  for connection errors, 429 and 5xx. 401/403 are not retried. Redirects are not followed,
  so the key is never sent to another host.
- Each page is one transaction together with the cursor: a failure rolls the page back and
  the next run re-reads it; idempotent ingestion makes the re-read harmless.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import httpx
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings
from app.config import settings as default_settings
from app.errors import PlanningError, ServiceUnavailable, UpstreamServiceError
from app.models import IntegrationCursor
from app.schemas.finalized_marks import FinalizedMarkPage, PullReport
from app.services.finalized_marks import SOURCE, ingest_finalized_events
from app.services.topic_registry import TopicRegistry

FEED_PATH = "/integration/events"
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
MAX_RETRY_AFTER_SECONDS = 30.0
# Re-read this much before the high-water mark each run, so a decision committed late with
# an earlier timestamp is still picked up. Duplicates are no-ops.
OVERLAP = timedelta(minutes=15)
# The first pull reads everything, not the producer's default last-24-hours window.
BACKFILL_FROM = datetime(2000, 1, 1, tzinfo=UTC)
# pg_advisory_xact_lock key: one page is applied at a time across planner instances.
PULL_LOCK_KEY = 0x4A32_3600_1000


class UpstreamAuthError(UpstreamServiceError):
    """Assessment refused the planner's integration key. Not retried."""


class AssessmentFeedClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout_seconds: float = 10.0,
        connect_timeout_seconds: float = 3.0,
        max_attempts: int = 3,
        backoff_seconds: float = 0.5,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not base_url or not base_url.strip():
            raise ServiceUnavailable("ASSESSMENT_SERVICE_URL is not configured.")
        if not api_key or not api_key.strip():
            raise ServiceUnavailable(
                "ASSESSMENT_SERVICE_API_KEY is not configured; the assessment feed needs the "
                "planner's integration key."
            )
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._transport = transport
        self._timeout = httpx.Timeout(timeout_seconds, connect=connect_timeout_seconds)
        self._max_attempts = max(1, max_attempts)
        self._backoff = backoff_seconds
        self._sleep = sleep

    @classmethod
    def from_settings(cls, config: Settings | None = None, **kwargs) -> AssessmentFeedClient:
        config = config or default_settings
        url = str(config.assessment_service_url) if config.assessment_service_url else ""
        return cls(url, config.assessment_service_api_key or "", **kwargs)

    def __repr__(self) -> str:  # never the key
        return f"AssessmentFeedClient(base_url={self._base_url!r})"

    def fetch_page(self, *, since: datetime | None, after: str | None, limit: int) -> FinalizedMarkPage:
        params = {"limit": str(limit)}
        if since is not None:
            params["since"] = since.isoformat()
        if after is not None:
            params["after"] = after
        headers = {"X-Integration-Key": self._api_key, "Accept": "application/json"}
        problem = "no attempt made"
        for attempt in range(1, self._max_attempts + 1):
            delay = self._backoff * 2 ** (attempt - 1)
            try:
                with httpx.Client(
                    base_url=self._base_url,
                    timeout=self._timeout,
                    transport=self._transport,
                    follow_redirects=False,
                ) as client:
                    response = client.get(FEED_PATH, params=params, headers=headers)
            except httpx.TransportError as exc:  # connect/read timeouts, refused, reset
                problem = f"could not reach the assessment service ({type(exc).__name__})"
            else:
                status = response.status_code
                if status in (401, 403):
                    raise UpstreamAuthError(
                        f"Assessment service refused the planner's integration key (HTTP {status})."
                    )
                if status == 200:
                    try:
                        return FinalizedMarkPage.model_validate(response.json())
                    except (ValueError, ValidationError) as exc:
                        raise UpstreamServiceError(
                            "Assessment service returned an invalid finalized-mark page."
                        ) from exc
                if status not in RETRYABLE_STATUS:
                    raise UpstreamServiceError(f"Assessment service returned HTTP {status}.")
                problem = f"assessment service returned HTTP {status}"
                delay = max(delay, _retry_after(response))
            if attempt < self._max_attempts:
                self._sleep(delay)
        raise UpstreamServiceError(
            f"Assessment feed unavailable after {self._max_attempts} attempts: {problem}."
        )


def pull_finalized_marks(
    session: Session,
    client: AssessmentFeedClient,
    registry: TopicRegistry,
    *,
    now: datetime | None = None,
    max_pages: int = 20,
    page_size: int = 500,
) -> PullReport:
    """Read new finalized marks and apply them; one committed transaction per page."""
    current = (now or datetime.now(UTC)).astimezone(UTC)
    report = PullReport()
    cursor = _cursor(session)
    since = cursor.high_water - OVERLAP if cursor.high_water is not None else BACKFILL_FROM
    session.commit()
    after: str | None = None
    try:
        while report.pages < max_pages:
            page = client.fetch_page(since=since, after=after, limit=page_size)
            _lock(session)
            ingest_finalized_events(session, page.events, registry, now=current, report=report)
            cursor = _cursor(session)
            if report.high_water is not None and (
                cursor.high_water is None or report.high_water > cursor.high_water
            ):
                cursor.high_water = report.high_water
            cursor.last_run_at = current
            cursor.last_success_at = current
            cursor.last_error = None
            session.commit()
            report.pages += 1
            if not page.has_more or not page.next_cursor:
                break
            after = page.next_cursor
    except Exception as exc:
        session.rollback()
        _record_failure(session, current, exc)
        raise
    return report


def _cursor(session: Session) -> IntegrationCursor:
    row = session.get(IntegrationCursor, SOURCE)
    if row is None:
        row = IntegrationCursor(source=SOURCE)
        session.add(row)
        session.flush()
    return row


def _lock(session: Session) -> None:
    if session.get_bind().dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": PULL_LOCK_KEY})


def _record_failure(session: Session, now: datetime, exc: Exception) -> None:
    # Only our own messages (no SQL parameters, no student data, no credentials).
    message = exc.message if isinstance(exc, PlanningError) else "unexpected error"
    try:
        cursor = _cursor(session)
        cursor.last_run_at = now
        cursor.last_error = f"{type(exc).__name__}: {message}"[:300]
        session.commit()
    except Exception:  # never hide the original failure
        session.rollback()


def _retry_after(response: httpx.Response) -> float:
    try:
        return min(max(float(response.headers.get("Retry-After", "0")), 0.0), MAX_RETRY_AFTER_SECONDS)
    except ValueError:
        return 0.0
