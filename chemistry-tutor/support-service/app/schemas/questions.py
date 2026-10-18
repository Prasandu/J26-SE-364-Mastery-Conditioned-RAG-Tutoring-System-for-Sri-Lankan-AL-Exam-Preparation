from pydantic import BaseModel


class QuestionSummary(BaseModel):
    question_code: str
    topic_id: str
    unit: str
    question_text: str
    difficulty: str


class HintRequest(BaseModel):
    student_id: str
    attempts: int = 0
    hints_used: int = 0
    requested_full_solution: bool = False


class HintResponse(BaseModel):
    level: int
    level_name: str
    content: str


class AnswerCheckRequest(BaseModel):
    student_id: str
    submitted_answer: str
    hints_used: int = 0
    time_seconds: float | None = None


class AnswerCheckResponse(BaseModel):
    correct: bool
    independent_success: bool
