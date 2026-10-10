"""Student endpoints: answer a published paper digitally, submit, see results."""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.ai.judge import AnswerJudge
from app.api.deps import get_file_store, get_judge, get_reader, get_session_factory
from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.attempts import AnswerIn, AnswerOut, AttemptCreate, AttemptOut
from app.services import attempts
from app.services.attempts import SessionFactory
from app.services.marking import has_pending
from app.services.reader import AnswerReader
from app.services.storage import FileStore

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


@router.post("/{attempt_id}/answers/{question_id}/images", response_model=AnswerOut)
async def add_answer_image(
    attempt_id: uuid.UUID,
    question_id: int,
    file: UploadFile = File(description="A photo of the handwritten answer (JPEG, PNG or WebP)"),
    db: Session = Depends(get_db),
    reader: AnswerReader | None = Depends(get_reader),
    store: FileStore = Depends(get_file_store),
    settings: Settings = Depends(get_settings),
):
    """Upload a photo of a handwritten answer and have it read into text (paper mode).

    The text comes back as a draft: the student checks it and sends any corrections with
    PUT .../answers/{question_id} before submitting. Both versions are kept.
    """
    if reader is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Handwriting reading is switched off. Set a vision model in .env.",
        )
    image = await _read_upload(file, settings.max_upload_mb)
    return attempts.add_answer_image(
        db,
        attempt_id,
        question_id,
        image=image,
        content_type=file.content_type or "",
        store=store,
        reader=reader,
    )


async def _read_upload(file: UploadFile, max_mb: float) -> bytes:
    limit = int(max_mb * 1024 * 1024)
    image = await file.read(limit + 1)
    if len(image) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"The image must be under {max_mb} MB")
    if not image:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty")
    return image


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
