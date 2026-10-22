from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user_id, require_self
from app.db import get_db
from app.models.verified_question import VerifiedQuestion
from app.schemas.questions import (
    AnswerCheckRequest,
    AnswerCheckResponse,
    HintRequest,
    HintResponse,
    QuestionSummary,
)
from app.services.adaptive_hints.hint_engine import (
    HINT_LEVEL_NAMES,
    choose_hint_level,
    get_hint_content,
)
from app.services.mastery.evidence import record_attempt, record_hint_event

router = APIRouter()


def _get_question_or_404(db: Session, question_code: str) -> VerifiedQuestion:
    question = db.execute(
        select(VerifiedQuestion).where(VerifiedQuestion.question_code == question_code)
    ).scalar_one_or_none()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@router.get("/questions", response_model=list[QuestionSummary])
def list_questions(db: Session = Depends(get_db)) -> list[QuestionSummary]:
    questions = db.execute(select(VerifiedQuestion)).scalars().all()
    return [
        QuestionSummary(
            question_code=q.question_code,
            topic_id=q.topic_id,
            unit=q.unit,
            question_text=q.question_text,
            difficulty=q.difficulty,
        )
        for q in questions
    ]


@router.get("/questions/{question_code}", response_model=QuestionSummary)
def get_question(question_code: str, db: Session = Depends(get_db)) -> QuestionSummary:
    q = _get_question_or_404(db, question_code)
    return QuestionSummary(
        question_code=q.question_code,
        topic_id=q.topic_id,
        unit=q.unit,
        question_text=q.question_text,
        difficulty=q.difficulty,
    )


@router.post("/questions/{question_code}/hint", response_model=HintResponse)
def request_hint(
    question_code: str,
    request: HintRequest,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id),
) -> HintResponse:
    require_self(request.student_id, current_user_id)
    q = _get_question_or_404(db, question_code)
    level = choose_hint_level(request.attempts, request.hints_used, request.requested_full_solution)
    record_hint_event(db, request.student_id, question_code, level)
    return HintResponse(level=level, level_name=HINT_LEVEL_NAMES[level], content=get_hint_content(q, level))


@router.post("/questions/{question_code}/check", response_model=AnswerCheckResponse)
def check_answer(
    question_code: str,
    request: AnswerCheckRequest,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id),
) -> AnswerCheckResponse:
    require_self(request.student_id, current_user_id)
    q = _get_question_or_404(db, question_code)
    attempt = record_attempt(
        db,
        request.student_id,
        q,
        request.submitted_answer,
        request.hints_used,
        request.time_seconds,
    )
    return AnswerCheckResponse(correct=attempt.correct, independent_success=attempt.independent_success)
