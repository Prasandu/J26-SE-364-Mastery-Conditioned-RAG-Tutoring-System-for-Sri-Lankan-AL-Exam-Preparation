from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.motivation import MotivationResponse
from app.security import StudentIdentity, get_student_identity
from app.services.motivation import todays_motivation

router = APIRouter(prefix="/api/v1/motivation", tags=["motivation"])
DbSession = Annotated[Session, Depends(get_db)]
StudentIdentityDep = Annotated[StudentIdentity, Depends(get_student_identity)]


@router.get("/today", response_model=MotivationResponse)
def get_todays_motivation(session: DbSession, identity: StudentIdentityDep) -> MotivationResponse:
    """Today's message; repeated calls on the same day return the same message."""
    return todays_motivation(session, identity.student_id, first_name=identity.first_name)
