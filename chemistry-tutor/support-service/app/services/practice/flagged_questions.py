from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.flagged_question import FlaggedQuestion


@dataclass
class NewFlaggedQuestion:
    student_id: str
    source: str
    question_text: str
    topic: str
    submitted_answer: str
    sub_topic: str | None = None
    unit: str | None = None
    concept_id: str | None = None
    correct_answer: str | None = None


def create_flagged_question(db: Session, data: NewFlaggedQuestion) -> FlaggedQuestion:
    """The single entry point for recording a wrong answer from another
    component (e.g. the model-paper processing component). Used by both the
    real ingestion endpoint (POST /practice/flagged-questions) and the
    seed script that stands in for that component until it's integrated —
    so seeded data and real future data go through identical logic.
    """
    flagged = FlaggedQuestion(
        student_id=data.student_id,
        source=data.source,
        question_text=data.question_text,
        topic=data.topic,
        sub_topic=data.sub_topic,
        unit=data.unit,
        concept_id=data.concept_id,
        submitted_answer=data.submitted_answer,
        correct_answer=data.correct_answer,
        status="pending",
    )
    db.add(flagged)
    db.commit()
    db.refresh(flagged)
    return flagged


def list_review_queue(db: Session, student_id: str) -> list[FlaggedQuestion]:
    """A student's pending (not yet reviewed) flagged questions, for the
    Practice page's "Review Mistakes" section.
    """
    stmt = (
        select(FlaggedQuestion)
        .where(FlaggedQuestion.student_id == student_id, FlaggedQuestion.status == "pending")
        .order_by(FlaggedQuestion.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_flagged_question(db: Session, flagged_question_id: int) -> FlaggedQuestion | None:
    return db.get(FlaggedQuestion, flagged_question_id)


def mark_reviewed(db: Session, flagged: FlaggedQuestion) -> None:
    flagged.status = "reviewed"
    db.commit()


def _normalize(text: str) -> str:
    return "".join(ch.lower() for ch in text if ch.isalnum())


def check_answer(flagged: FlaggedQuestion, submitted_answer: str) -> bool | None:
    """Loose, case/whitespace/punctuation-insensitive comparison against the
    known correct answer. Returns None if no reference answer was supplied
    by the reporting component — flagged questions are arbitrary free-text
    paper questions, so this is not SymPy-verified like verified_questions'
    numeric answer checking, just an exact-match-after-normalizing check.
    """
    if not flagged.correct_answer:
        return None
    return _normalize(submitted_answer) == _normalize(flagged.correct_answer)
