from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.dashboard import DashboardResponse, WhatIfInput, WhatIfResponse
from app.security import get_student_id
from app.services.dashboard import get_dashboard, project_what_if

router = APIRouter(prefix="/api/v1", tags=["dashboard"])
DbSession = Annotated[Session, Depends(get_db)]
StudentId = Annotated[str, Depends(get_student_id)]


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard_overview(
    session: DbSession,
    student_id: StudentId,
) -> DashboardResponse:
    return get_dashboard(session, student_id)


@router.post("/whatif", response_model=WhatIfResponse)
def what_if_projection(
    data: WhatIfInput,
    session: DbSession,
    student_id: StudentId,
) -> WhatIfResponse:
    return project_what_if(session, student_id, data)
