from pydantic import BaseModel


class WeakTopicResponse(BaseModel):
    question_code: str
    unit: str
    topic_id: str
    reason: str
    prerequisite_names: list[str]


class ConsultationResponse(BaseModel):
    has_data: bool
    weak_topics: list[WeakTopicResponse]
    revision_plan: str
    wellness_tips: list[str]
