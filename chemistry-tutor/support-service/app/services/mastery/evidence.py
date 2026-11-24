from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.hint_event import HintEvent
from app.models.student_attempt import StudentAttempt
from app.models.verified_question import VerifiedQuestion
from app.services.adaptive_hints.answer_check import answers_match


def record_hint_event(db: Session, student_id: str, question_code: str, level: int) -> HintEvent:
    event = HintEvent(student_id=student_id, question_code=question_code, level=level)
    db.add(event)
    db.commit()
    return event


def record_attempt(
    db: Session,
    student_id: str,
    question: VerifiedQuestion,
    submitted_answer: str,
    hints_used: int,
    time_seconds: float | None,
) -> StudentAttempt:
    correct = answers_match(submitted_answer, question.verified_answer)
    # A correct answer only counts as independent if no hints were used.
    # A correct answer after hints is assisted, not independent — this
    # distinction is the whole point of this table (see roadmap: a correct
    # answer following hints must not automatically count as independent
    # mastery).
    independent_success = correct and hints_used == 0

    attempt = StudentAttempt(
        student_id=student_id,
        question_code=question.question_code,
        submitted_answer=submitted_answer,
        correct=correct,
        hints_used=hints_used,
        time_seconds=time_seconds,
        independent_success=independent_success,
    )
    db.add(attempt)
    db.commit()
    return attempt


@dataclass
class QuestionProgress:
    question_code: str
    attempts: int
    correct_attempts: int
    independent_successes: int
    assisted_successes: int
    hints_used_total: int


def get_student_progress(db: Session, student_id: str) -> list[QuestionProgress]:
    attempts = (
        db.execute(select(StudentAttempt).where(StudentAttempt.student_id == student_id)).scalars().all()
    )
    hints = db.execute(select(HintEvent).where(HintEvent.student_id == student_id)).scalars().all()

    by_question: dict[str, QuestionProgress] = {}

    def _get(code: str) -> QuestionProgress:
        if code not in by_question:
            by_question[code] = QuestionProgress(
                question_code=code,
                attempts=0,
                correct_attempts=0,
                independent_successes=0,
                assisted_successes=0,
                hints_used_total=0,
            )
        return by_question[code]

    for a in attempts:
        p = _get(a.question_code)
        p.attempts += 1
        if a.correct:
            p.correct_attempts += 1
            if a.independent_success:
                p.independent_successes += 1
            else:
                p.assisted_successes += 1

    for h in hints:
        _get(h.question_code).hints_used_total += 1

    return list(by_question.values())


@dataclass
class DashboardSummary:
    total_attempts: int
    total_correct: int
    total_independent: int
    total_assisted: int
    total_hints_used: int
    independent_rate: float  # independent successes / correct attempts, 0 if none
    per_question: list[QuestionProgress]


def get_student_dashboard(db: Session, student_id: str) -> DashboardSummary:
    per_question = get_student_progress(db, student_id)

    total_attempts = sum(p.attempts for p in per_question)
    total_correct = sum(p.correct_attempts for p in per_question)
    total_independent = sum(p.independent_successes for p in per_question)
    total_assisted = sum(p.assisted_successes for p in per_question)
    total_hints_used = sum(p.hints_used_total for p in per_question)
    independent_rate = (total_independent / total_correct) if total_correct > 0 else 0.0

    return DashboardSummary(
        total_attempts=total_attempts,
        total_correct=total_correct,
        total_independent=total_independent,
        total_assisted=total_assisted,
        total_hints_used=total_hints_used,
        independent_rate=independent_rate,
        per_question=per_question,
    )
