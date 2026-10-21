from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.rate_limit import limiter
from app.schemas.consultation import ConsultationResponse, WeakTopicResponse
from app.schemas.reports import (
    CorrectedAnswerResponse,
    QuestionEvidenceResponse,
    WivaranaReportResponse,
)
from app.schemas.students import (
    DashboardResponse,
    InterventionHistoryItem,
    InterventionResponse,
    QuestionProgressResponse,
)
from app.services.consultation.recommendation import generate_consultation
from app.services.learning_state.intervention_history import (
    get_intervention_history,
    record_interventions,
)
from app.services.learning_state.intervention_rules import get_interventions
from app.services.mastery.evidence import get_student_dashboard, get_student_progress
from app.services.reports.wivarana_report import generate_wivarana_report

router = APIRouter()


def _to_progress_response(p) -> QuestionProgressResponse:
    return QuestionProgressResponse(
        question_code=p.question_code,
        attempts=p.attempts,
        correct_attempts=p.correct_attempts,
        independent_successes=p.independent_successes,
        assisted_successes=p.assisted_successes,
        hints_used_total=p.hints_used_total,
    )


@router.get("/students/{student_id}/progress", response_model=list[QuestionProgressResponse])
def student_progress(student_id: str, db: Session = Depends(get_db)) -> list[QuestionProgressResponse]:
    progress = get_student_progress(db, student_id)
    return [_to_progress_response(p) for p in progress]


@router.get("/students/{student_id}/interventions", response_model=list[InterventionResponse])
def student_interventions(student_id: str, db: Session = Depends(get_db)) -> list[InterventionResponse]:
    interventions = get_interventions(db, student_id)
    record_interventions(db, student_id, interventions)
    return [
        InterventionResponse(rule=i.rule, message=i.message, question_code=i.question_code, unit=i.unit)
        for i in interventions
    ]


@router.get("/students/{student_id}/intervention-history", response_model=list[InterventionHistoryItem])
def student_intervention_history(
    student_id: str, db: Session = Depends(get_db)
) -> list[InterventionHistoryItem]:
    history = get_intervention_history(db, student_id)
    return [
        InterventionHistoryItem(
            rule=e.rule,
            message=e.message,
            question_code=e.question_code,
            unit=e.unit,
            created_at=e.created_at,
        )
        for e in history
    ]


@router.get("/students/{student_id}/dashboard", response_model=DashboardResponse)
def student_dashboard(student_id: str, db: Session = Depends(get_db)) -> DashboardResponse:
    d = get_student_dashboard(db, student_id)
    return DashboardResponse(
        total_attempts=d.total_attempts,
        total_correct=d.total_correct,
        total_independent=d.total_independent,
        total_assisted=d.total_assisted,
        total_hints_used=d.total_hints_used,
        independent_rate=d.independent_rate,
        per_question=[_to_progress_response(p) for p in d.per_question],
    )


@router.get("/students/{student_id}/consultation", response_model=ConsultationResponse)
@limiter.limit("10/minute")
def student_consultation(
    request: Request, student_id: str, db: Session = Depends(get_db)
) -> ConsultationResponse:
    result = generate_consultation(db, student_id)
    return ConsultationResponse(
        has_data=result.has_data,
        weak_topics=[
            WeakTopicResponse(
                question_code=wt.question_code,
                unit=wt.unit,
                topic_id=wt.topic_id,
                reason=wt.reason,
                prerequisite_names=wt.prerequisite_names,
            )
            for wt in result.weak_topics
        ],
        revision_plan=result.revision_plan,
        wellness_tips=result.wellness_tips,
    )


@router.get("/students/{student_id}/wivarana-report", response_model=WivaranaReportResponse)
@limiter.limit("10/minute")
def student_wivarana_report(
    request: Request, student_id: str, db: Session = Depends(get_db)
) -> WivaranaReportResponse:
    report = generate_wivarana_report(db, student_id)
    return WivaranaReportResponse(
        student_id=report.student_id,
        generated_at=report.generated_at,
        total_attempts=report.total_attempts,
        total_correct=report.total_correct,
        independent_rate=report.independent_rate,
        question_evidence=[
            QuestionEvidenceResponse(
                question_code=e.question_code,
                unit=e.unit,
                status=e.status,
                explanation=e.explanation,
            )
            for e in report.question_evidence
        ],
        corrected_answers=[
            CorrectedAnswerResponse(
                question_code=c.question_code,
                question_text=c.question_text,
                wrong_answers=c.wrong_answers,
                theory_explanation=c.theory_explanation,
                worked_solution=c.worked_solution,
                final_answer=c.final_answer,
            )
            for c in report.corrected_answers
        ],
        intervention_summary=report.intervention_summary,
        narrative=report.narrative,
    )
