from pydantic import BaseModel, Field

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


class Citation(BaseModel):
    document_title: str
    unit: str | None
    section: str | None
    page_number: int | None


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]
    grounded: bool  # False when no relevant evidence was found
