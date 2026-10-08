"""Student endpoints: answer a published paper digitally, submit, see results."""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_judge, get_session_factory
from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.attempts import AnswerIn, AnswerOut, AttemptCreate, AttemptOut
from app.services import attempts
from app.services.attempts import SessionFactory
from app.services.judge import AnswerJudge
from app.services.marking import has_pending

router = APIRouter(prefix="/attempts", tags=["attempts"])


@router.post("", response_model=AttemptOut, status_code=status.HTTP_201_CREATED)
def start_attempt(data: AttemptCreate, db: Session = Depends(get_db)):
    """Start answering a published paper. Uses the latest published marking scheme."""
    return attempts.to_attempt_out(attempts.start_attempt(db, data))


@router.get("/{attempt_id}", response_model=AttemptOut)
def get_attempt(attempt_id: uuid.UUID, db: Session = Depends(get_db)):
    """Answers so far, or results after submitting."""
    return attempts.to_attempt_out(attempts.get_attempt(db, attempt_id))


@router.put("/{attempt_id}/answers/{question_id}", response_model=AnswerOut)
def save_answer(attempt_id: uuid.UUID, question_id: int, data: AnswerIn, db: Session = Depends(get_db)):
    """Save (or change) the answer to one question while the attempt is in progress."""
    return attempts.save_answer(db, attempt_id, question_id, data)


@router.post("/{attempt_id}/submit", response_model=AttemptOut)
def submit_attempt(
    attempt_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    judge: AnswerJudge | None = Depends(get_judge),
    session_factory: SessionFactory = Depends(get_session_factory),
    settings: Settings = Depends(get_settings),
):
    """Lock the answers and mark them.

    MCQs and points the chemistry checker can decide are marked at once. The rest are
    marked by the AI judge in the background: call GET /attempts/{id} again to see them.
    """
    cross_check = judge is not None and settings.ai_cross_check
    attempt = attempts.submit_attempt(db, attempt_id, cross_check=cross_check)
    if judge is not None and has_pending(attempt):
        background_tasks.add_task(
            attempts.judge_pending_in_background,
            session_factory,
            judge,
            attempt.id,
            settings.ai_min_confidence,
        )
    return attempts.to_attempt_out(attempt)
