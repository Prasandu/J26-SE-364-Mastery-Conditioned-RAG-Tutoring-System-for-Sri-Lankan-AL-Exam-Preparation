from pydantic import BaseModel, Field

# student_id is a short application-generated identifier, never free text a
# student types; submitted_answer is a numeric/short-expression answer, not
# an essay. Both bounded generously to block abusive/malformed payloads.
MAX_STUDENT_ID_LENGTH = 100
MAX_SUBMITTED_ANSWER_LENGTH = 200


class QuestionSummary(BaseModel):
    question_code: str
    topic_id: str
    unit: str
    question_text: str
    difficulty: str


class HintRequest(BaseModel):
    student_id: str = Field(max_length=MAX_STUDENT_ID_LENGTH)
    attempts: int = 0
    hints_used: int = 0
    requested_full_solution: bool = False


class HintResponse(BaseModel):
    level: int
    level_name: str
    content: str


class AnswerCheckRequest(BaseModel):
    student_id: str = Field(max_length=MAX_STUDENT_ID_LENGTH)
    submitted_answer: str = Field(max_length=MAX_SUBMITTED_ANSWER_LENGTH)
    hints_used: int = 0
    time_seconds: float | None = None


class AnswerCheckResponse(BaseModel):
    correct: bool
    independent_success: bool
