from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.predictions import StudentPredictionResponse
from app.security import get_student_id
from app.services.predictions import predict_student

router = APIRouter(prefix="/api/v1/predictions", tags=["predictions"])
DbSession = Annotated[Session, Depends(get_db)]
StudentId = Annotated[str, Depends(get_student_id)]


@router.post("/{student_id}", response_model=StudentPredictionResponse)
def create_student_predictions(
    student_id: str,
    session: DbSession,
    authenticated_student_id: StudentId,
) -> StudentPredictionResponse:
    """Expose predictions only for the learner identified by the bearer token."""
    return predict_student(session, authenticated_student_id, student_id)
