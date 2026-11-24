"""Lining a photographed answer sheet up with the questions of a paper.

Reading gives "row 7 is option 3". This turns that into "question 7 of this paper,
which is question id 412, and the student has not answered it yet".

Nothing is saved here. The student sees what was read, fixes it, and only then are
the answers stored, the same rule as handwriting: the marking must be about the
student's answers, not about the camera.
"""

import uuid

from sqlalchemy.orm import Session

from app.errors import ContentValidationError
from app.models import AnswerMode, Attempt, Question
from app.schemas.attempts import AnswerIn, BulkAnswersIn, SheetAnswerOut, SheetReadOut
from app.services.attempts import apply_answer, get_in_progress, question_index
from app.services.omr.detect import read_any_sheet
from app.services.omr.reader import Mark, SheetError, read_sheet

OWN_SHEET = "answer sheet"
DETECTED = "detected grid"


def mcq_questions(attempt: Attempt) -> list[Question]:
    """The paper's MCQ questions, in the order a sheet numbers them."""
    return [
        question
        for section in attempt.paper.sections
        if section.answer_mode == AnswerMode.MCQ
        for question in section.questions
    ]


def read_answer_sheet(db: Session, attempt_id: uuid.UUID, image: bytes) -> SheetReadOut:
    """Read a photo and line it up with this attempt's questions."""
    attempt = get_in_progress(db, attempt_id)
    questions = mcq_questions(attempt)
    if not questions:
        raise ContentValidationError("This paper has no multiple choice questions.")

    labels = _option_labels(questions[0])
    read_by, marks, options_found = _read(image, len(questions), labels)

    saved = {a.question_id: a.mcq_option for a in attempt.answers}
    answers = [
        SheetAnswerOut(
            question_id=question.id,
            label=question.full_label,
            option=mark.option if mark.state == Mark.FILLED else None,
            state=mark.state.value,
            already=saved.get(question.id),
        )
        for question, mark in zip(questions, marks, strict=False)
    ]
    return SheetReadOut(
        read_by=read_by,
        questions_found=len(marks),
        options_found=options_found,
        answers=answers,
    )


def _read(image: bytes, questions: int, labels: list[str]):
    """Our own sheet if the corner markers are there, otherwise work the grid out."""
    try:
        result = read_sheet(image, questions)
    except SheetError:
        detected = read_any_sheet(image, labels)
        return DETECTED, detected.marks, detected.options

    if any(mark.state == Mark.FILLED for mark in result.marks):
        return OWN_SHEET, result.marks, len(labels)

    # Markers in the right places but nothing filled anywhere. Either a genuinely
    # blank sheet or a misread; working the grid out settles which.
    try:
        detected = read_any_sheet(image, labels)
    except SheetError:
        return OWN_SHEET, result.marks, len(labels)
    if any(mark.state == Mark.FILLED for mark in detected.marks):
        return DETECTED, detected.marks, detected.options
    return OWN_SHEET, result.marks, len(labels)


def _option_labels(question: Question) -> list[str]:
    """The option labels this paper uses, e.g. 1..5 or A..E."""
    return [option["label"] for option in question.options or []] or ["1", "2", "3", "4", "5"]


def save_sheet_answers(db: Session, attempt_id: uuid.UUID, data: BulkAnswersIn) -> int:
    """Store the answers the student confirmed, in one transaction.

    One commit for the whole sheet, not one per question: the database is remote, so
    fifty commits is fifty round trips and the student watches a spinner for it.
    """
    attempt = get_in_progress(db, attempt_id)
    # no_autoflush: looking at attempt.answers would otherwise flush the answer added
    # on the previous turn of the loop, making this one INSERT per question again.
    index = question_index(db, attempt)
    with db.no_autoflush:
        for answer in data.answers:
            apply_answer(attempt, answer.question_id, AnswerIn(mcq_option=answer.mcq_option), index)
    db.commit()
    return len(data.answers)
