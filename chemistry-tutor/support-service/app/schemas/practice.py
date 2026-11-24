from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.tutor import Citation

# Bounds on free-text fields from other components, consistent with the
# other POST endpoints' input validation (see tutor.py, questions.py).
MAX_QUESTION_TEXT_LENGTH = 4000
MAX_ANSWER_LENGTH = 500
MAX_TOPIC_LENGTH = 200
MAX_STUDENT_ID_LENGTH = 100


class FlagQuestionRequest(BaseModel):
    student_id: str = Field(max_length=MAX_STUDENT_ID_LENGTH)
    # Which upstream component/paper this came from, e.g. "model_paper".
    source: str = Field(max_length=50)
    question_text: str = Field(max_length=MAX_QUESTION_TEXT_LENGTH)
    topic: str = Field(max_length=MAX_TOPIC_LENGTH)
    sub_topic: str | None = Field(default=None, max_length=MAX_TOPIC_LENGTH)
    unit: str | None = Field(default=None, max_length=20)
    # Optional link into the GraphRAG concept graph, e.g. "U02-ELECTRONEGATIVITY".
    concept_id: str | None = Field(default=None, max_length=50)
    submitted_answer: str = Field(max_length=MAX_ANSWER_LENGTH)
    correct_answer: str | None = Field(default=None, max_length=MAX_ANSWER_LENGTH)


class FlaggedQuestionResponse(BaseModel):
    id: int
    student_id: str
    source: str
    question_text: str
    topic: str
    sub_topic: str | None
    unit: str | None
    concept_id: str | None
    submitted_answer: str
    correct_answer: str | None
    status: str
    created_at: datetime


class ExplainResponse(BaseModel):
    explanation: str
    citations: list[Citation]
    grounded: bool


class CheckFlaggedAnswerRequest(BaseModel):
    submitted_answer: str = Field(max_length=MAX_ANSWER_LENGTH)


class CheckFlaggedAnswerResponse(BaseModel):
    # None when the reporting component didn't supply a reference answer,
    # so correctness can't be checked.
    correct: bool | None


class FlaggedHintRequest(BaseModel):
    attempts: int = 0
    hints_used: int = 0
    requested_full_solution: bool = False


class FlaggedHintResponse(BaseModel):
    level: int
    level_name: str
    content: str
