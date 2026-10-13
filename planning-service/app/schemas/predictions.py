from typing import Annotated

from pydantic import BaseModel, Field

Probability = Annotated[float, Field(ge=0, le=1)]


class PredictionFactor(BaseModel):
    feature: str
    value: float
    contribution: float


class TopicPrediction(BaseModel):
    topic_id: str
    predicted_score: Probability
    weak_probability: Probability
    confidence: Probability
    contributing_factors: list[PredictionFactor]


class StudentPredictionResponse(BaseModel):
    student_id: str
    model_version: str
    prediction_source: str
    overall_predicted_score: Probability
    overall_predicted_grade: str
    confidence: Probability
    topics: list[TopicPrediction]
