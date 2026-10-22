from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user_id, require_self
from app.db import get_db
from app.rate_limit import limiter
from app.schemas.practice import (
    CheckFlaggedAnswerRequest,
    CheckFlaggedAnswerResponse,
    ExplainResponse,
    FlagQuestionRequest,
    FlaggedHintRequest,
    FlaggedHintResponse,
    FlaggedQuestionResponse,
)
from app.schemas.tutor import Citation
from app.services.adaptive_hints.hint_engine import HINT_LEVEL_NAMES, choose_hint_level
from app.services.practice.explain import explain_flagged_question
from app.services.practice.flagged_questions import (
    NewFlaggedQuestion,
    check_answer,
    create_flagged_question,
    get_flagged_question,
    mark_reviewed,
)
from app.services.practice.hints import generate_flagged_question_hint

router = APIRouter()


def _to_response(f) -> FlaggedQuestionResponse:
    return FlaggedQuestionResponse(
        id=f.id,
        student_id=f.student_id,
        source=f.source,
        question_text=f.question_text,
        topic=f.topic,
        sub_topic=f.sub_topic,
        unit=f.unit,
        concept_id=f.concept_id,
        submitted_answer=f.submitted_answer,
        correct_answer=f.correct_answer,
        status=f.status,
        created_at=f.created_at,
    )


@router.post("/practice/flagged-questions", response_model=FlaggedQuestionResponse)
@limiter.limit("30/minute")
def flag_question(
    request: Request,
    body: FlagQuestionRequest,
    db: Session = Depends(get_db),
    _current_user_id: str = Depends(get_current_user_id),
) -> FlaggedQuestionResponse:
    """Record a question a student got wrong, reported by another component
    (e.g. the model-paper/past-paper processing component). This is the
    integration point other components call; until that integration exists,
    scripts/seed_flagged_questions.py exercises this exact endpoint with
    mock data so the Practice "Review Mistakes" flow is testable standalone.

    Requires a valid token (any authenticated caller), but deliberately
    does NOT require it to match body.student_id — this is meant to be
    called by another service reporting on a student's behalf, not by the
    student themselves.
    """
    flagged = create_flagged_question(
        db,
        NewFlaggedQuestion(
            student_id=body.student_id,
            source=body.source,
            question_text=body.question_text,
            topic=body.topic,
            sub_topic=body.sub_topic,
            unit=body.unit,
            concept_id=body.concept_id,
            submitted_answer=body.submitted_answer,
            correct_answer=body.correct_answer,
        ),
    )
    return _to_response(flagged)


@router.post("/practice/flagged-questions/{flagged_question_id}/explain", response_model=ExplainResponse)
@limiter.limit("20/minute")
def explain(
    request: Request,
    flagged_question_id: int,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id),
) -> ExplainResponse:
    """Generate a step-by-step, curriculum-grounded walkthrough of how to
    solve a flagged question, and mark it as reviewed.
    """
    flagged = get_flagged_question(db, flagged_question_id)
    if flagged is None:
        raise HTTPException(status_code=404, detail="Flagged question not found")
    require_self(flagged.student_id, current_user_id)

    result = explain_flagged_question(db, flagged)
    if result.grounded:
        mark_reviewed(db, flagged, explanation_text=result.text)

    citations = [
        Citation(
            document_title=c.document_title,
            unit=c.unit,
            section=c.section,
            page_number=c.page_number,
        )
        for c in result.citations
    ]
    return ExplainResponse(explanation=result.text, citations=citations, grounded=result.grounded)


@router.post(
    "/practice/flagged-questions/{flagged_question_id}/check", response_model=CheckFlaggedAnswerResponse
)
def check(
    flagged_question_id: int,
    body: CheckFlaggedAnswerRequest,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id),
) -> CheckFlaggedAnswerResponse:
    """Check a re-attempt against the known correct answer (loose text
    match, not SymPy-verified like verified_questions — these are arbitrary
    free-text paper questions). Marks the question reviewed on a correct
    answer.
    """
    flagged = get_flagged_question(db, flagged_question_id)
    if flagged is None:
        raise HTTPException(status_code=404, detail="Flagged question not found")
    require_self(flagged.student_id, current_user_id)

    correct = check_answer(flagged, body.submitted_answer)
    if correct:
        mark_reviewed(db, flagged)
    return CheckFlaggedAnswerResponse(correct=correct)


@router.post("/practice/flagged-questions/{flagged_question_id}/hint", response_model=FlaggedHintResponse)
@limiter.limit("30/minute")
def hint(
    request: Request,
    flagged_question_id: int,
    body: FlaggedHintRequest,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id),
) -> FlaggedHintResponse:
    """Progressive, LLM-generated hint ladder for a flagged question —
    the same five-level structure and level-choosing logic as
    verified_questions (app.services.adaptive_hints.hint_engine), but the
    content itself is generated on the fly and grounded in the syllabus,
    since flagged questions have no teacher-authored hint text.
    """
    flagged = get_flagged_question(db, flagged_question_id)
    if flagged is None:
        raise HTTPException(status_code=404, detail="Flagged question not found")
    require_self(flagged.student_id, current_user_id)

    level = choose_hint_level(body.attempts, body.hints_used, body.requested_full_solution)
    content = generate_flagged_question_hint(db, flagged, level)
    if level == 5:
        mark_reviewed(db, flagged, explanation_text=content)

    return FlaggedHintResponse(level=level, level_name=HINT_LEVEL_NAMES[level], content=content)
