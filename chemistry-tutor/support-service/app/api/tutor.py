from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.rate_limit import limiter
from app.schemas.tutor import AskRawRequest, AskRawResponse, AskRequest, AskResponse, Citation
from app.services.tutoring.grounded_answer import answer_question
from app.services.tutoring.llm_adapter import get_llm_provider

router = APIRouter()

SYSTEM_PROMPT = (
    "You are a Chemistry tutor for Sri Lankan G.C.E. Advanced Level students. "
    "Answer clearly and keep chemical formulas, units and symbols accurate."
)


@router.post("/tutor/ask-raw", response_model=AskRawResponse)
@limiter.limit("20/minute")
def ask_raw(request: Request, body: AskRawRequest) -> AskRawResponse:
    """Temporary ungrounded endpoint, kept only to compare against /tutor/ask."""
    provider = get_llm_provider()
    try:
        answer = provider.generate_response(SYSTEM_PROMPT, body.question)
    except Exception:
        answer = "The AI service is temporarily unavailable. Please try again in a moment."
    return AskRawResponse(answer=answer)


@router.post("/tutor/ask", response_model=AskResponse)
@limiter.limit("20/minute")
def ask(request: Request, body: AskRequest, db: Session = Depends(get_db)) -> AskResponse:
    """Curriculum-grounded answer: retrieves relevant NIE passages, answers from
    them only, and returns citations. Abstains if no relevant evidence is found.
    """
    result = answer_question(db, body.question, body.language, concise=body.concise)
    citations = [
        Citation(
            document_title=c.document_title,
            unit=c.unit,
            section=c.section,
            page_number=c.page_number,
        )
        for c in result.citations
    ]
    return AskResponse(answer=result.answer, citations=citations, grounded=result.grounded)
