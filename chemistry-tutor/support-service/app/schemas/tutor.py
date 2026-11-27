from typing import Literal

from pydantic import BaseModel, Field

from app.services.teaching.actions import ValidatedTeaching

# A genuine Chemistry question fits comfortably in a few hundred characters;
# this bounds prompt-injection padding and per-call LLM cost, not legitimate use.
MAX_QUESTION_LENGTH = 1000


class AskRawRequest(BaseModel):
    question: str = Field(max_length=MAX_QUESTION_LENGTH)


class AskRawResponse(BaseModel):
    answer: str


class AskRequest(BaseModel):
    question: str = Field(max_length=MAX_QUESTION_LENGTH)
    language: str = "en"  # "en" or "si"
    # True for voice-chat questions: shorter, spoken-style answer — faster
    # to generate and shorter to listen to. False (default) for text chat.
    concise: bool = False
    # TUT-014: also return a validated structured whiteboard (ignored for voice/concise answers).
    whiteboard: bool = False
    # From the student's planner (C3); only changes how deep the explanation goes.
    learner_level: Literal["weak", "developing", "strong"] | None = None


class Citation(BaseModel):
    document_title: str
    unit: str | None
    section: str | None
    page_number: int | None


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]
    grounded: bool  # False when no relevant evidence was found
    # Present when requested: status "rejected" means the plain answer above is shown instead.
    whiteboard: ValidatedTeaching | None = None
    ai_generated: bool = True  # an explanation, never a mark
