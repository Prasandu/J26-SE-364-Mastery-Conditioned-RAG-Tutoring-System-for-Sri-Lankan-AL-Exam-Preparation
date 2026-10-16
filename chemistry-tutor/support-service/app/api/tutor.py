from fastapi import APIRouter

from app.schemas.tutor import AskRawRequest, AskRawResponse
from app.services.tutoring.llm_adapter import get_llm_provider

router = APIRouter()

SYSTEM_PROMPT = (
    "You are a Chemistry tutor for Sri Lankan G.C.E. Advanced Level students. "
    "Answer clearly and keep chemical formulas, units and symbols accurate."
)


@router.post("/tutor/ask-raw", response_model=AskRawResponse)
def ask_raw(request: AskRawRequest) -> AskRawResponse:
    """Temporary ungrounded endpoint to verify the LLM adapter works end to end.

    Not curriculum-grounded (no RAG retrieval yet). Replaced by
    POST /tutor/ask once retrieval is wired in.
    """
    provider = get_llm_provider()
    answer = provider.generate_response(SYSTEM_PROMPT, request.question)
    return AskRawResponse(answer=answer)
