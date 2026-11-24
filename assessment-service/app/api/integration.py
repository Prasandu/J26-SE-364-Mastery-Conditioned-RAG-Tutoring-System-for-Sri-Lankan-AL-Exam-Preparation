"""Read-only endpoints the other 3 components of this group project (J26-SE-364)
call to get a student's marks, topic performance and error categories from this
one. Every route needs an X-Integration-Key for the calling component (see
app/security.py's require_integration_caller) - not a human login, since the
caller is another team member's service, which has no user account here.

See docs/integration-contract.md for the full contract, shared with the other
three components directly (this repo's docs/ is not tracked in git).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.integration import StudentEventsOut, StudentProfileOut
from app.security import require_integration_caller
from app.services import integration

router = APIRouter(
    prefix="/integration", tags=["integration"], dependencies=[Depends(require_integration_caller)]
)


@router.get("/students/{student_ref}/profile", response_model=StudentProfileOut)
def student_profile(student_ref: str, db: Session = Depends(get_db)):
    """Topic performance, answer-mode breakdown and error categories from every
    decided marking point this student has - a current snapshot, not a feed."""
    return integration.student_profile(db, student_ref)


@router.get("/students/{student_ref}/events", response_model=StudentEventsOut)
def student_events(
    student_ref: str,
    since: datetime | None = Query(default=None, description="Default: the last 24 hours"),
    db: Session = Depends(get_db),
):
    """Every decided point of an attempt marked since `since` - for polling what
    changed, rather than re-reading the whole profile each time."""
    return integration.student_events(db, student_ref, since)
