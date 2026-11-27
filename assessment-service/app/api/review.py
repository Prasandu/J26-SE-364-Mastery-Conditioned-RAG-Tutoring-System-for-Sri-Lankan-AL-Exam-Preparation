"""Teacher endpoints: the review queue, a teacher's decision, and marker agreement (FR9).

Every route needs a signed-in teacher (or admin) account (see app/security.py).
"""

import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import get_file_store
from app.db import get_db
from app.models import PointStatus, User
from app.schemas.review import (
    AgreementOut,
    PointReviewOut,
    ReviewDecisionIn,
    ReviewedPointOut,
    ReviewItemOut,
    ReviewScriptOut,
)
from app.security import require_teacher
from app.services import review
from app.services.classes import review_scope
from app.services.storage import FileStore

router = APIRouter(prefix="/review", tags=["review"], dependencies=[Depends(require_teacher)])


@router.get("/queue", response_model=list[ReviewItemOut])
def review_queue(
    paper_id: int | None = None,
    status: PointStatus | None = None,
    limit: int = Query(default=50, ge=1, le=review.MAX_QUEUE_PAGE),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_teacher),
):
    """Marking points waiting for a teacher, oldest submission first.

    Without `status`, every point no marker has settled is listed. A teacher sees only
    students in their classes; an admin sees everyone.
    """
    return [review.to_review_item(result) for result in review.review_queue(
        db,
        paper_id=paper_id,
        status=status,
        limit=limit,
        offset=offset,
        scope=review_scope(db, user),
    )]  # fmt: skip


@router.get("/scripts", response_model=list[ReviewScriptOut])
def review_scripts(
    paper_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=review.MAX_QUEUE_PAGE),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_teacher),
):
    """Submitted scripts a teacher can mark right through, with how far they have got."""
    scope = review_scope(db, user)
    return review.review_scripts(db, paper_id=paper_id, limit=limit, offset=offset, scope=scope)


@router.get("/attempts/{attempt_id}", response_model=list[ReviewItemOut])
def attempt_points(
    attempt_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_teacher)
):
    """Unresolved or already-reviewed points of one submitted attempt."""
    scope = review_scope(db, user)
    return [review.to_review_item(result) for result in review.attempt_points(db, attempt_id, scope)]


@router.get("/images/{image_id}")
def answer_photo(
    image_id: int,
    db: Session = Depends(get_db),
    store: FileStore = Depends(get_file_store),
    user: User = Depends(require_teacher),
):
    """One photo of a handwritten answer.

    A diagram point is sent to a teacher precisely because no machine can mark a
    drawing - so the teacher has to be able to see the drawing, not only what the
    reader managed to put into words.
    """
    image = review.answer_image(db, image_id, review_scope(db, user))
    return Response(
        content=store.load(image.storage_key),
        media_type=image.content_type,
        # A student's own work: never cached by a proxy or left in the browser's cache.
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/agreement", response_model=AgreementOut)
def agreement(
    paper_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(require_teacher)
):
    """How often the chemistry checker and the AI judge reached the same decision as a teacher."""
    return review.agreement(db, paper_id=paper_id, scope=review_scope(db, user))


@router.get("/points/{result_id}/history", response_model=list[PointReviewOut])
def point_history(result_id: int, db: Session = Depends(get_db), user: User = Depends(require_teacher)):
    """Every decision made on one marking point, oldest first."""
    return review.get_point(db, result_id, review_scope(db, user)).reviews


@router.post("/points/{result_id}", response_model=ReviewedPointOut)
def record_decision(
    result_id: int,
    decision: ReviewDecisionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_teacher),
):
    """The teacher's decision replaces the machine's and the totals are recalculated.

    Recorded under the signed-in account, whatever teacher_ref the body sent."""
    signed = decision.model_copy(update={"teacher_ref": user.email[:64]})
    return review.record_decision(db, result_id, signed, review_scope(db, user))
