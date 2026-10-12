from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.adapters.evidence_sources import push_evidence_source
from app.db import get_db
from app.schemas.events import AssessmentEvent, IngestionResult, ModuleCompletionEvent
from app.security import require_api_key

router = APIRouter(
    prefix="/api/v1/events",
    tags=["events"],
    dependencies=[Depends(require_api_key)],
)
DbSession = Annotated[Session, Depends(get_db)]


@router.post(
    "/assessment",
    response_model=IngestionResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def ingest_assessment(event: AssessmentEvent, session: DbSession) -> IngestionResult:
    return IngestionResult.model_validate(push_evidence_source.ingest_assessment(session, event))


@router.post(
    "/module-completion",
    response_model=IngestionResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def ingest_module_completion(
    event: ModuleCompletionEvent,
    session: DbSession,
) -> IngestionResult:
    return IngestionResult.model_validate(push_evidence_source.ingest_module_completion(session, event))
