from datetime import datetime

from pydantic import BaseModel


class QuestionEvidenceResponse(BaseModel):
    question_code: str
    unit: str
    status: str
    explanation: str


class CorrectedAnswerResponse(BaseModel):
    question_code: str
    question_text: str
    wrong_answers: list[str]
    theory_explanation: str
    worked_solution: str
    final_answer: str


class WivaranaReportResponse(BaseModel):
    student_id: str
    generated_at: datetime
    total_attempts: int
    total_correct: int
    independent_rate: float
    question_evidence: list[QuestionEvidenceResponse]
    corrected_answers: list[CorrectedAnswerResponse]
    intervention_summary: list[str]
    narrative: str
