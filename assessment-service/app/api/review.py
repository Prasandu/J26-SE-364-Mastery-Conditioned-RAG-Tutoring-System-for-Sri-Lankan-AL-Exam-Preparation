"""Teacher endpoints: the review queue, a teacher's decision, and marker agreement (FR9).

Every route needs the X-Teacher-Key header (see app/security.py).
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PointStatus
from app.schemas.review import AgreementOut, ReviewDecisionIn, ReviewedPointOut, ReviewItemOut
from app.security import require_teacher
from app.services import review

router = APIRouter(prefix="/review", tags=["review"], dependencies=[Depends(require_teacher)])


@router.get("/queue", response_model=list[ReviewItemOut])
def review_queue(
    paper_id: int | None = None,
    status: PointStatus | None = None,
    limit: int = Query(default=50, ge=1, le=review.MAX_QUEUE_PAGE),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Marking points waiting for a teacher, oldest submission first.

    Without `status`, every point no marker has settled is listed.
    """
    return [review.to_review_item(result) for result in review.review_queue(
        db, paper_id=paper_id, status=status, limit=limit, offset=offset
    )]  # fmt: skip


@router.get("/attempts/{attempt_id}", response_model=list[ReviewItemOut])
def attempt_points(attempt_id: uuid.UUID, db: Session = Depends(get_db)):
    """Every marking point of one submitted attempt, for double-marking a whole script."""
    return [review.to_review_item(result) for result in review.attempt_points(db, attempt_id)]


@router.get("/agreement", response_model=AgreementOut)
def agreement(paper_id: int | None = None, db: Session = Depends(get_db)):
    """How often the chemistry checker and the AI judge reached the same decision as a teacher."""
    return review.agreement(db, paper_id=paper_id)


@router.post("/points/{result_id}", response_model=ReviewedPointOut)
def record_decision(result_id: int, decision: ReviewDecisionIn, db: Session = Depends(get_db)):
    """The teacher's decision replaces the machine's and the totals are recalculated."""
    return review.record_decision(db, result_id, decision)
