from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    AvailabilitySlot,
    LearnerTopicState,
    Prediction,
    ProfileEmbedding,
    RawEvent,
    ReplanLog,
    StudyPlan,
    StudyTask,
    TopicEvidence,
)


def delete_student_data(session: Session, student_id: str) -> dict[str, int]:
    plan_ids = select(StudyPlan.id).where(StudyPlan.student_id == student_id)
    deleted: dict[str, int] = {}

    student_models = (
        TopicEvidence,
        RawEvent,
        Prediction,
        ProfileEmbedding,
        LearnerTopicState,
        ReplanLog,
        StudyTask,
    )
    for model in student_models:
        result = session.execute(delete(model).where(model.student_id == student_id))
        deleted[model.__tablename__] = result.rowcount or 0

    result = session.execute(delete(AvailabilitySlot).where(AvailabilitySlot.plan_id.in_(plan_ids)))
    deleted[AvailabilitySlot.__tablename__] = result.rowcount or 0
    result = session.execute(delete(StudyPlan).where(StudyPlan.student_id == student_id))
    deleted[StudyPlan.__tablename__] = result.rowcount or 0
    session.commit()
    return deleted
