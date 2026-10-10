"""Attempts: a student answers a published paper, submits, and gets marked.

Life cycle: in_progress -> submitted -> marked.
Answers can only change while in progress. The scheme version is fixed at the
start, so publishing a corrected scheme later never changes this attempt's marks.

Written answers are marked by the AI judge after submit, in the background. If the
judge fails (no internet, quota), the points simply stay pending and can be retried.
"""

import logging
import uuid
from collections.abc import Callable
from contextlib import AbstractContextManager

from sqlalchemy.orm import Session

from app.errors import ConflictError, ContentValidationError, NotFoundError
from app.models import (
    Answer,
    AnswerMode,
    Attempt,
    AttemptMode,
    AttemptStatus,
    Question,
    utcnow,
)
from app.schemas.attempts import (
    AnswerIn,
    AnswerOut,
    AttemptCreate,
    AttemptOut,
    PointResultOut,
    QuestionResultOut,
)
from app.services.judge import AnswerJudge
from app.services.marking import (
    FINAL_STATUSES,
    finalize_without_ai,
    judge_answer,
    mark_attempt,
    paper_max_score,
    refresh_scores,
)
from app.services.papers import get_paper
from app.services.schemes import latest_published_scheme

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], AbstractContextManager[Session]]


def start_attempt(db: Session, data: AttemptCreate) -> Attempt:
    paper = get_paper(db, data.paper_id, published_only=True)
    scheme = latest_published_scheme(paper)
    if scheme is None:  # cannot happen for a published paper, but never mark without a scheme
        raise ConflictError("This paper has no published marking scheme")

    attempt = Attempt(
        paper=paper,
        scheme=scheme,
        student_ref=data.student_ref,
        mode=AttemptMode.DIGITAL,
        max_score=paper_max_score(paper),
    )
    db.add(attempt)
    db.commit()
    return attempt


def get_attempt(db: Session, attempt_id: uuid.UUID) -> Attempt:
    attempt = db.get(Attempt, attempt_id)
    if attempt is None:
        raise NotFoundError("Attempt not found")
    return attempt


def save_answer(db: Session, attempt_id: uuid.UUID, question_id: int, data: AnswerIn) -> Answer:
    """Create or replace the answer to one question."""
    attempt = _get_in_progress(db, attempt_id)
    question = _answerable_question(attempt, question_id)
    _check_answer_kind(question, data)

    answer = next((a for a in attempt.answers if a.question_id == question_id), None)
    if answer is None:
        answer = Answer(question=question)
        attempt.answers.append(answer)
    answer.mcq_option = data.mcq_option
    answer.text = data.text
    answer.data = data.graph.model_dump() if data.graph else None
    db.commit()
    return answer


def submit_attempt(db: Session, attempt_id: uuid.UUID, cross_check: bool = False) -> Attempt:
    attempt = _get_in_progress(db, attempt_id)
    attempt.status = AttemptStatus.SUBMITTED
    attempt.submitted_at = utcnow()
    mark_attempt(attempt, cross_check=cross_check)
    db.commit()
    return attempt


def judge_pending(db: Session, attempt_id: uuid.UUID, judge: AnswerJudge, min_confidence: float) -> Attempt:
    """Let the AI judge decide every pending point. Progress is saved answer by answer."""
    attempt = get_attempt(db, attempt_id)
    if attempt.status == AttemptStatus.IN_PROGRESS:
        raise ConflictError("Submit the attempt before marking it")

    for answer in attempt.answers:
        try:
            judge_answer(answer, judge, min_confidence)
        except Exception:  # network, quota or a bad AI reply
            logger.exception("AI judge failed for attempt %s, question %s", attempt.id, answer.question_id)
            db.rollback()
            finalize_without_ai(answer)  # points the checker decided do not wait for the AI
        db.commit()

    refresh_scores(attempt)
    db.commit()
    return attempt


def judge_pending_in_background(
    session_factory: SessionFactory, judge: AnswerJudge, attempt_id: uuid.UUID, min_confidence: float
) -> None:
    """Runs after the submit response is sent, with its own database session."""
    with session_factory() as db:
        judge_pending(db, attempt_id, judge, min_confidence)


def to_attempt_out(attempt: Attempt) -> AttemptOut:
    answers = {answer.question_id: answer for answer in attempt.answers}
    submitted = attempt.status != AttemptStatus.IN_PROGRESS
    return AttemptOut(
        id=attempt.id,
        paper_id=attempt.paper_id,
        scheme_version=attempt.scheme.version,
        student_ref=attempt.student_ref,
        mode=attempt.mode,
        status=attempt.status,
        score=attempt.score,
        max_score=attempt.max_score,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        marked_at=attempt.marked_at,
        questions=[
            _question_result(question, answers.get(question.id), submitted)
            for question in attempt.paper.iter_questions()
            if not question.sub_questions
        ],
    )


def _question_result(question: Question, answer: Answer | None, submitted: bool) -> QuestionResultOut:
    unanswered_score = 0.0 if submitted else None  # not answered = no marks
    score = answer.score if answer else unanswered_score
    return QuestionResultOut(
        question_id=question.id,
        section=question.section.code,
        label=question.full_label,
        max_marks=question.max_marks,
        answer=AnswerOut.model_validate(answer) if answer else None,
        score=score,
        points=[
            PointResultOut(
                code=result.point.code,
                description=result.point.description,
                marks=result.point.marks,
                status=result.status,
                awarded=result.awarded if result.status in FINAL_STATUSES else None,
                method=result.method,
                marker=result.marker,
                checker_awarded=result.checker_awarded,
                ai_awarded=result.ai_awarded,
                teacher_comment=result.teacher_comment,
                evidence=result.evidence,
                reason=result.reason,
                confidence=result.confidence,
            )
            for result in (answer.point_results if answer and submitted else [])
        ],
    )


def _get_in_progress(db: Session, attempt_id: uuid.UUID) -> Attempt:
    attempt = get_attempt(db, attempt_id)
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise ConflictError("This attempt is already submitted")
    return attempt


def _answerable_question(attempt: Attempt, question_id: int) -> Question:
    question = next((q for q in attempt.paper.iter_questions() if q.id == question_id), None)
    if question is None:
        raise NotFoundError("Question not found in this paper")
    if question.sub_questions:
        raise ContentValidationError(
            "Answer the sub-questions instead", [f"Question {question.full_label} has sub-questions"]
        )
    return question


def _check_answer_kind(question: Question, data: AnswerIn) -> None:
    where = f"Section {question.section.code} Q{question.full_label}"
    if question.section.answer_mode != AnswerMode.MCQ:
        if data.mcq_option is not None:
            raise ContentValidationError(
                "Wrong answer type", [f"{where}: send text or graph, not mcq_option"]
            )
        return

    options = [option["label"] for option in question.options or []]
    if data.mcq_option is None:
        raise ContentValidationError("Wrong answer type", [f"{where}: send mcq_option, not text or graph"])
    if data.mcq_option not in options:
        raise ContentValidationError(
            "Unknown option", [f"{where}: mcq_option must be one of {', '.join(options)}"]
        )
