from pydantic import BaseModel


class AskRawRequest(BaseModel):
    question: str


class AskRawResponse(BaseModel):
    answer: str


class AskRequest(BaseModel):
    question: str
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
