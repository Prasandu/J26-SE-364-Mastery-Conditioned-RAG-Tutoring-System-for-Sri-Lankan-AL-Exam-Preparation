from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import TopicEvidence
from app.schemas.dashboard import DashboardResponse, WhatIfInput, WhatIfResponse
from app.security import StudentIdentity, get_student_id, get_student_identity
from app.services.dashboard import get_dashboard, project_what_if
from app.services.predictions import MINIMUM_ASSESSED_TOPICS, predict_student

router = APIRouter(prefix="/api/v1", tags=["dashboard"])
DbSession = Annotated[Session, Depends(get_db)]
StudentId = Annotated[str, Depends(get_student_id)]
StudentIdentityDep = Annotated[StudentIdentity, Depends(get_student_identity)]


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard_overview(
    session: DbSession,
    identity: StudentIdentityDep,
) -> DashboardResponse:
    student_id = identity.student_id
    assessed_topic_count = session.scalar(
        select(func.count(func.distinct(TopicEvidence.topic_id))).where(
            TopicEvidence.student_id == student_id
        )
    )
    if (assessed_topic_count or 0) >= MINIMUM_ASSESSED_TOPICS:
        prediction = predict_student(session, student_id, student_id)
        return get_dashboard(
            session,
            student_id,
            prediction_score=prediction.overall_predicted_score,
            student_name=identity.first_name,
        )
    return get_dashboard(session, student_id, student_name=identity.first_name)


@router.post("/whatif", response_model=WhatIfResponse)
def what_if_projection(
    data: WhatIfInput,
    session: DbSession,
    student_id: StudentId,
) -> WhatIfResponse:
    return project_what_if(session, student_id, data)
