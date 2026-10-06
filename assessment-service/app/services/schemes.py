"""Marking schemes: versioned per paper.

Life cycle: draft -> published. A published version never changes. To correct
it, copy it to a new draft version, edit that, and publish it. Old versions are
kept, so every mark can be traced to the exact scheme version that produced it.
"""

from collections.abc import Iterator
from dataclasses import dataclass, field

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import ConflictError, ContentValidationError, NotFoundError
from app.models import (
    ContentStatus,
    MarkingPoint,
    MarkingRule,
    MarkingScheme,
    ModelAnswer,
    Paper,
    Question,
    RuleType,
    utcnow,
)
from app.schemas.admin import MarkingSchemeIn
from app.schemas.content import (
    MarkingPointOut,
    MarkingRuleOut,
    MarkingSchemeOut,
    QuestionSchemeOut,
    SchemeSummary,
)
from app.services.papers import ensure_draft, get_paper
from app.services.validation import QuestionRef, check_scheme, check_scheme_ready

PUBLISHED_SCHEME_MESSAGE = "Published marking schemes cannot be changed. Copy it to a new version instead."


def get_scheme(db: Session, paper_id: int, version: int) -> MarkingScheme:
    paper = get_paper(db, paper_id)
    scheme = next((s for s in paper.marking_schemes if s.version == version), None)
    if scheme is None:
        raise NotFoundError("Marking scheme not found")
    return scheme


def latest_published_scheme(paper: Paper) -> MarkingScheme | None:
    published = [s for s in paper.marking_schemes if s.status == ContentStatus.PUBLISHED]
    return published[-1] if published else None  # schemes are ordered by version


def create_scheme(db: Session, paper_id: int, data: MarkingSchemeIn) -> MarkingScheme:
    paper = get_paper(db, paper_id)
    next_version = max((s.version for s in paper.marking_schemes), default=0) + 1
    scheme = MarkingScheme(version=next_version, status=ContentStatus.DRAFT)
    paper.marking_schemes.append(scheme)  # collection side, so the session saves it
    _fill_scheme(scheme, data)
    try:
        db.commit()
    except IntegrityError as error:  # two admins created a version at the same moment
        db.rollback()
        raise ConflictError("Another version was created at the same time. Please try again.") from error
    return scheme


def replace_scheme(db: Session, paper_id: int, version: int, data: MarkingSchemeIn) -> MarkingScheme:
    scheme = get_scheme(db, paper_id, version)
    ensure_draft(scheme, PUBLISHED_SCHEME_MESSAGE)
    scheme.points.clear()
    scheme.rules.clear()
    scheme.model_answers.clear()
    db.flush()  # remove old rows first, so point codes can be reused
    _fill_scheme(scheme, data)
    db.commit()
    return scheme


def copy_scheme(db: Session, paper_id: int, version: int) -> MarkingScheme:
    """New draft version with the same content, ready to be edited."""
    return create_scheme(db, paper_id, to_scheme_in(get_scheme(db, paper_id, version)))


def publish_scheme(db: Session, paper_id: int, version: int) -> MarkingScheme:
    scheme = get_scheme(db, paper_id, version)
    ensure_draft(scheme, "This marking scheme is already published.")
    if errors := check_scheme_ready(scheme):
        raise ContentValidationError("The marking scheme is not ready to publish", errors)
    scheme.status = ContentStatus.PUBLISHED
    scheme.published_at = utcnow()
    db.commit()
    return scheme


def delete_scheme(db: Session, paper_id: int, version: int) -> None:
    scheme = get_scheme(db, paper_id, version)
    ensure_draft(scheme, "Published marking schemes cannot be deleted.")
    scheme.paper.marking_schemes.remove(scheme)  # delete-orphan cascade deletes the row
    db.commit()


def question_lookup(paper: Paper) -> dict[QuestionRef, Question]:
    return {(q.section.code, q.full_label): q for q in paper.iter_questions()}


def _fill_scheme(scheme: MarkingScheme, data: MarkingSchemeIn) -> None:
    questions = question_lookup(scheme.paper)
    if errors := check_scheme(data, questions):
        raise ContentValidationError("The marking scheme has problems", errors)

    scheme.source = data.source
    scheme.notes = data.notes
    for entry in data.questions:
        question = questions[(entry.section, entry.question)]
        for order, point in enumerate(entry.points):
            scheme.points.append(MarkingPoint(question=question, order_no=order, **point.model_dump()))
        for rule in entry.rules:
            scheme.rules.append(
                MarkingRule(question=question, rule_type=RuleType(rule.rule_type), params=rule.params)
            )
        if entry.model_answer:
            scheme.model_answers.append(ModelAnswer(question=question, answer_text=entry.model_answer))


# ---------- Converting a stored scheme ----------


@dataclass
class _QuestionEntry:
    question: Question
    points: list[MarkingPoint] = field(default_factory=list)
    rules: list[MarkingRule] = field(default_factory=list)
    model_answer: str | None = None


def _entries(scheme: MarkingScheme) -> Iterator[_QuestionEntry]:
    """The scheme grouped by question, in paper order. Questions with nothing in the scheme are skipped."""
    entries = {q.id: _QuestionEntry(q) for q in scheme.paper.iter_questions()}
    for point in scheme.points:
        entries[point.question_id].points.append(point)
    for rule in scheme.rules:
        entries[rule.question_id].rules.append(rule)
    for answer in scheme.model_answers:
        entries[answer.question_id].model_answer = answer.answer_text
    return (e for e in entries.values() if e.points or e.rules or e.model_answer)


def to_scheme_out(scheme: MarkingScheme) -> MarkingSchemeOut:
    return MarkingSchemeOut(
        **SchemeSummary.model_validate(scheme).model_dump(),
        paper_id=scheme.paper_id,
        notes=scheme.notes,
        questions=[
            QuestionSchemeOut(
                question_id=entry.question.id,
                section=entry.question.section.code,
                label=entry.question.full_label,
                max_marks=entry.question.max_marks,
                model_answer=entry.model_answer,
                points=[MarkingPointOut.model_validate(p) for p in entry.points],
                rules=[MarkingRuleOut.model_validate(r) for r in entry.rules],
            )
            for entry in _entries(scheme)
        ],
    )


def to_scheme_in(scheme: MarkingScheme) -> MarkingSchemeIn:
    """The stored scheme in the same shape an admin sends, e.g. to copy it."""
    return MarkingSchemeIn.model_validate(
        {
            "source": scheme.source,
            "notes": scheme.notes,
            "questions": [
                {
                    "section": entry.question.section.code,
                    "question": entry.question.full_label,
                    "model_answer": entry.model_answer,
                    "points": [
                        {
                            "code": p.code,
                            "description": p.description,
                            "marks": p.marks,
                            "point_type": p.point_type,
                            "expected": p.expected,
                            "alternatives": p.alternatives,
                        }
                        for p in entry.points
                    ],
                    "rules": [{"rule_type": r.rule_type.value, **r.params} for r in entry.rules],
                }
                for entry in _entries(scheme)
            ],
        }
    )
