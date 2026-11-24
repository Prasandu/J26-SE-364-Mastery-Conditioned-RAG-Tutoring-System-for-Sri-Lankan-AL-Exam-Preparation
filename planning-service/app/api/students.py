from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Attempt, Paper, Question
from app.schemas.plans import PlanReadinessResponse
from app.schemas.topic_history import TopicHistoryAttempt, TopicHistoryResponse
from app.security import get_student_id
from app.services.plans import ADAPTIVE_NEEDS_RESULTS_MESSAGE, student_has_results

router = APIRouter(prefix="/api/v1/students", tags=["students"])
DbSession = Annotated[Session, Depends(get_db)]
StudentId = Annotated[str, Depends(get_student_id)]


@router.get("/me/plan-readiness", response_model=PlanReadinessResponse)
def get_plan_readiness(session: DbSession, student_id: StudentId) -> PlanReadinessResponse:
    """Tell setup whether this student can create an Adaptive plan yet, and why not."""
    has_results = student_has_results(session, student_id)
    return PlanReadinessResponse(
        has_results=has_results,
        adaptive_available=has_results,
        adaptive_unavailable_reason=None if has_results else ADAPTIVE_NEEDS_RESULTS_MESSAGE,
    )


@router.get("/me/topic-history/{topic_id}", response_model=TopicHistoryResponse)
def get_topic_history(
    topic_id: str,
    session: DbSession,
    student_id: StudentId,
) -> TopicHistoryResponse:
    statement = (
        select(Attempt, Question, Paper)
        .outerjoin(Question, Question.question_id == Attempt.question_id)
        .outerjoin(
            Paper,
            Paper.paper_id == Question.paper_id,
        )
        .where(
            Attempt.student_id == student_id,
            Attempt.topic_id == topic_id,
        )
        .order_by(Attempt.attempted_at, Question.question_no)
    )
    attempts = []
    for attempt, question, paper in session.execute(statement).all():
        attempts.append(
            TopicHistoryAttempt(
                question_id=attempt.question_id,
                paper_id=(
                    question.paper_id
                    if question is not None
                    else attempt.paper_id
                ),
                year=(
                    paper.year
                    if paper is not None
                    else attempt.paper_year
                ),
                question_no=question.question_no if question is not None else None,
                marks_awarded=attempt.marks,
                max_marks=question.max_marks if question is not None else attempt.max_marks,
                attempted_at=attempt.attempted_at,
            )
        )
    return TopicHistoryResponse(topic_id=topic_id, attempts=attempts)
