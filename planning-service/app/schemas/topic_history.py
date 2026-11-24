from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TopicHistoryAttempt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: str | None
    paper_id: str | None
    year: int | None
    question_no: str | None
    marks_awarded: float
    max_marks: float
    attempted_at: datetime


class TopicHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: str
    attempts: list[TopicHistoryAttempt]
