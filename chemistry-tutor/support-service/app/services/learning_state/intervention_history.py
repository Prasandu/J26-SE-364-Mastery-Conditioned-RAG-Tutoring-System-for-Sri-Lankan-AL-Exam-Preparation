from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.intervention_event import InterventionEvent
from app.services.learning_state.intervention_rules import Intervention


def record_interventions(db: Session, student_id: str, interventions: list[Intervention]) -> None:
    """Log each intervention the student was actually shown — but only
    once per (rule, question_code, unit) combination per student, not on
    every repeated "How am I doing?" click, so the history reflects
    distinct struggle events rather than button-mash spam.
    """
    for i in interventions:
        already_logged = db.execute(
            select(InterventionEvent).where(
                InterventionEvent.student_id == student_id,
                InterventionEvent.rule == i.rule,
                InterventionEvent.question_code == i.question_code,
                InterventionEvent.unit == i.unit,
            )
        ).scalar_one_or_none()
        if already_logged is not None:
            continue
        db.add(
            InterventionEvent(
                student_id=student_id,
                rule=i.rule,
                message=i.message,
                question_code=i.question_code,
                unit=i.unit,
            )
        )
    db.commit()


def get_intervention_history(db: Session, student_id: str) -> list[InterventionEvent]:
    return (
        db.execute(
            select(InterventionEvent)
            .where(InterventionEvent.student_id == student_id)
            .order_by(InterventionEvent.created_at.desc())
        )
        .scalars()
        .all()
    )
