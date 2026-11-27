"""Service-only routes for the DAT-010 finalized-mark pull. They take the planner's own
service key (X-API-Key = INGEST_API_KEY) - a scheduler or operator, never a student's
browser token - and return counts only."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.adapters.assessment_feed import AssessmentFeedClient, pull_finalized_marks
from app.config import settings
from app.db import get_db
from app.errors import ServiceUnavailable
from app.schemas.finalized_marks import FeedStatus, PullReport, QuarantineSummary
from app.security import require_api_key
from app.services.finalized_marks import feed_status, quarantine_summary, release_quarantined
from app.services.topic_registry import RegistryError, TopicRegistry, load_registry

router = APIRouter(
    prefix="/api/v1/integration/assessment",
    tags=["integration"],
    dependencies=[Depends(require_api_key)],
)
DbSession = Annotated[Session, Depends(get_db)]


def topic_registry() -> TopicRegistry:
    try:
        return load_registry()
    except (OSError, ValueError, RegistryError) as exc:
        # Fail closed: no registry, no mapping, no marks applied.
        raise ServiceUnavailable("The topic registry could not be loaded; no marks were applied.") from exc


Registry = Annotated[TopicRegistry, Depends(topic_registry)]


@router.post("/pull", response_model=PullReport)
def pull(session: DbSession, registry: Registry) -> PullReport:
    """Read finalized marks from assessment-service and apply them to mastery."""
    return pull_finalized_marks(
        session,
        AssessmentFeedClient.from_settings(),
        registry,
        max_pages=settings.assessment_feed_max_pages,
        page_size=settings.assessment_feed_page_size,
    )


@router.get("/status", response_model=FeedStatus)
def status(session: DbSession) -> FeedStatus:
    """When the pull last ran and succeeded, its last error and the quarantine size."""
    return feed_status(session, settings)


@router.get("/quarantine", response_model=QuarantineSummary)
def quarantine(session: DbSession, registry: Registry) -> QuarantineSummary:
    """Assessment topic codes waiting for a reviewed mapping, with counts."""
    return quarantine_summary(session, registry)


@router.post("/quarantine/release", response_model=PullReport)
def release(session: DbSession, registry: Registry) -> PullReport:
    """Apply quarantined marks whose codes map now (after reviewers approved aliases)."""
    report = release_quarantined(session, registry)
    session.commit()
    return report
