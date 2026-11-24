from datetime import datetime

from pydantic import BaseModel


class QuestionProgressResponse(BaseModel):
    question_code: str
    attempts: int
    correct_attempts: int
    independent_successes: int
    assisted_successes: int
    hints_used_total: int


class InterventionResponse(BaseModel):
    rule: str
    message: str
    question_code: str | None
    unit: str | None


class InterventionHistoryItem(BaseModel):
    rule: str
    message: str
    question_code: str | None
    unit: str | None
    created_at: datetime


class DashboardResponse(BaseModel):
    total_attempts: int
    total_correct: int
    total_independent: int
    total_assisted: int
    total_hints_used: int
    independent_rate: float
    per_question: list[QuestionProgressResponse]
