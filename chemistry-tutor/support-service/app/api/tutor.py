from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user_id
from app.db import get_db
from app.rate_limit import PAID_TUTOR_LIMIT, limiter
from app.schemas.tutor import AskRawRequest, AskRawResponse, AskRequest, AskResponse, Citation
from app.security import require_raw_tutor_enabled
from app.services.tutoring.grounded_answer import answer_question
from app.services.tutoring.llm_adapter import get_llm_provider

router = APIRouter()

SYSTEM_PROMPT = (
    "You are a Chemistry tutor for Sri Lankan G.C.E. Advanced Level students. "
    "Answer clearly and keep chemical formulas, units and symbols accurate."
)


@router.post(
    "/tutor/ask-raw",
    response_model=AskRawResponse,
    dependencies=[Depends(require_raw_tutor_enabled), Depends(get_current_user_id)],
)
@limiter.limit(PAID_TUTOR_LIMIT)
def ask_raw(request: Request, body: AskRawRequest) -> AskRawResponse:
    """Ungrounded development-only comparison against /tutor/ask: 404 unless
    ENABLE_RAW_TUTOR=true (refused in production), and signed-in callers only."""
    provider = get_llm_provider()
    try:
        answer = provider.generate_response(SYSTEM_PROMPT, body.question)
    except Exception:
        answer = "The AI service is temporarily unavailable. Please try again in a moment."
    return AskRawResponse(answer=answer)


@router.post("/tutor/ask", response_model=AskResponse, dependencies=[Depends(get_current_user_id)])
@limiter.limit(PAID_TUTOR_LIMIT)
def ask(request: Request, body: AskRequest, db: Session = Depends(get_db)) -> AskResponse:
    """Curriculum-grounded answer: retrieves relevant NIE passages, answers from
    them only, and returns citations. Abstains if no relevant evidence is found.
    """
    result = answer_question(
        db,
        body.question,
        body.language,
        concise=body.concise,
        whiteboard=body.whiteboard,
        learner_level=body.learner_level,
    )
    citations = [
        Citation(
            document_title=c.document_title,
            unit=c.unit,
            section=c.section,
            page_number=c.page_number,
        )
        for c in result.citations
    ]
    return AskResponse(
        answer=result.answer, citations=citations, grounded=result.grounded, whiteboard=result.whiteboard
    )
