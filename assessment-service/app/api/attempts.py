"""Student endpoints: answer a published paper digitally, submit, see results."""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.attempts import AnswerIn, AnswerOut, AttemptCreate, AttemptOut
from app.services import attempts

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
def submit_attempt(attempt_id: uuid.UUID, db: Session = Depends(get_db)):
    """Lock the answers and mark them."""
    return attempts.to_attempt_out(attempts.submit_attempt(db, attempt_id))
