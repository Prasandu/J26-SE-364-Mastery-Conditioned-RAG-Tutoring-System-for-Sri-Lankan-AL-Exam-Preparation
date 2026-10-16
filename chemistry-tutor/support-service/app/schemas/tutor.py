from pydantic import BaseModel


class AskRawRequest(BaseModel):
    question: str


class AskRawResponse(BaseModel):
    answer: str
