"""Marking schemes: versioned per paper.

Life cycle:

    draft -> validated -> approved -> published -> retired
       |        |
       |        +-> validation_failed, and back once it is corrected
       +-> published, for a practice paper a student made, which has no teacher waiting

A published version never changes. To correct it, copy it to a new draft version, edit
that, and publish it. Old versions are kept, so every mark can be traced to the exact
scheme version that produced it.

Two rules are enforced here rather than left to whoever calls:

- a generated scheme cannot be published until the validators have run and found no
  errors, so a machine-written scheme never becomes the thing that marks a student by
  default.
- approving is a separate, named step. approved_by records who, so a generated scheme
  nobody signed off stays distinguishable from an official one for good.
"""

from collections.abc import Iterator
from dataclasses import dataclass, field

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import ConflictError, ContentValidationError, NotFoundError
from app.models import (
    EDITABLE,
    SCHEME_TRANSITIONS,
    MarkingPoint,
    MarkingRule,
    MarkingScheme,
    ModelAnswer,
    Paper,
    Question,
    RuleType,
    SchemeSource,
    SchemeStatus,
    utcnow,
)
from app.schemas.admin import MarkingSchemeIn, QuestionSchemeIn
from app.schemas.content import (
    MarkingPointOut,
    MarkingRuleOut,
    MarkingSchemeOut,
    QuestionSchemeOut,
    SchemeSummary,
)
from app.services.papers import get_paper
from app.services.validation import QuestionRef, check_scheme, check_scheme_ready
from app.services.verify.facts import from_scheme
from app.services.verify.pipeline import verify_paper
from app.services.verify.report import VerificationReport, stored_reasons

PUBLISHED_SCHEME_MESSAGE = "Published marking schemes cannot be changed. Copy it to a new version instead."
CHECKED_BY_LIMIT = 200


def get_scheme(db: Session, paper_id: int, version: int) -> MarkingScheme:
    paper = get_paper(db, paper_id)
    scheme = next((s for s in paper.marking_schemes if s.version == version), None)
    if scheme is None:
        raise NotFoundError("Marking scheme not found")
    return scheme


def latest_published_scheme(paper: Paper) -> MarkingScheme | None:
    published = [s for s in paper.marking_schemes if s.status == SchemeStatus.PUBLISHED]
    return published[-1] if published else None  # schemes are ordered by version


def ensure_editable(scheme: MarkingScheme, message: str) -> None:
    """Refuse to change a scheme that has been approved, published or retired."""
    if scheme.status not in EDITABLE:
        raise ConflictError(message)


def ensure_transition(scheme: MarkingScheme, wanted: SchemeStatus) -> None:
    """Allow only the moves the lifecycle permits, and say what is allowed instead."""
    allowed = SCHEME_TRANSITIONS[scheme.status]
    if wanted not in allowed:
        permitted = ", ".join(sorted(allowed)) or "nothing"
        raise ConflictError(
            f"A {scheme.status.value} marking scheme cannot become {wanted.value}. "
            f"From here it can only become: {permitted}."
        )


def create_scheme(db: Session, paper_id: int, data: MarkingSchemeIn) -> MarkingScheme:
    paper = get_paper(db, paper_id)
    next_version = max((s.version for s in paper.marking_schemes), default=0) + 1
    scheme = MarkingScheme(version=next_version, status=SchemeStatus.DRAFT)
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
    ensure_editable(scheme, PUBLISHED_SCHEME_MESSAGE)
    scheme.points.clear()
    scheme.rules.clear()
    scheme.model_answers.clear()
    db.flush()  # remove old rows first, so point codes can be reused
    _fill_scheme(scheme, data)
    # Whatever the validators said was about the content that has just been replaced.
    scheme.status = SchemeStatus.DRAFT
    scheme.validation_reasons = []
    scheme.validated_at = None
    scheme.checked_by = None
    db.commit()
    return scheme


def append_to_scheme(
    db: Session, paper_id: int, version: int, entries: list[QuestionSchemeIn]
) -> MarkingScheme:
    """Add more question entries to an existing editable scheme version,
    continuing after whatever is already there - the scheme-side half of resuming
    an OCR import split across several AI-quota-limited sessions (see
    app.services.papers.append_questions for the paper side). A question that
    already has points, rules or a model answer in this version is rejected
    rather than silently duplicated; use replace_scheme to correct an entry.
    """
    scheme = get_scheme(db, paper_id, version)
    ensure_editable(scheme, PUBLISHED_SCHEME_MESSAGE)

    questions = question_lookup(scheme.paper)
    data = MarkingSchemeIn(source=scheme.source, notes=scheme.notes, questions=entries)
    if errors := check_scheme(data, questions):
        raise ContentValidationError("The marking scheme has problems", errors)

    already = {(e.question.section.code, e.question.full_label) for e in _entries(scheme)}
    if overlap := [
        entry for entry in entries if (entry.section, entry.question) in already
    ]:
        raise ContentValidationError(
            "Cannot add these questions",
            [
                f"Section {entry.section} Q{entry.question} already has marking points in this version"
                for entry in overlap
            ],
        )

    for entry in entries:
        question = questions[(entry.section, entry.question)]
        for order, point in enumerate(entry.points):
            scheme.points.append(MarkingPoint(question=question, order_no=order, **point.model_dump()))
        for rule in entry.rules:
            scheme.rules.append(
                MarkingRule(question=question, rule_type=RuleType(rule.rule_type), params=rule.params)
            )
        if entry.model_answer:
            scheme.model_answers.append(ModelAnswer(question=question, answer_text=entry.model_answer))

    # Whatever the validators said was about the content that has just changed.
    scheme.status = SchemeStatus.DRAFT
    scheme.validation_reasons = []
    scheme.validated_at = None
    scheme.checked_by = None
    db.commit()
    return scheme


def copy_scheme(db: Session, paper_id: int, version: int) -> MarkingScheme:
    """New draft version with the same content, ready to be edited."""
    return create_scheme(db, paper_id, to_scheme_in(get_scheme(db, paper_id, version)))


def validate_scheme(db: Session, paper_id: int, version: int) -> tuple[MarkingScheme, VerificationReport]:
    """Run the independent validators over a stored scheme and record what they found.

    This is the only thing that moves a scheme out of draft by itself, to validated or
    to validation_failed depending on the errors. A finding only a teacher can settle
    does not fail it: it is recorded and waits for the approval step.
    """
    scheme = get_scheme(db, paper_id, version)
    ensure_editable(scheme, "An approved or published marking scheme is not revalidated.")

    report = VerificationReport()
    for verified in verify_paper(from_scheme(scheme)):
        report.merge(verified.report)

    wanted = SchemeStatus.VALIDATION_FAILED if report.rejected else SchemeStatus.VALIDATED
    ensure_transition(scheme, wanted)
    scheme.status = wanted
    scheme.validation_reasons = stored_reasons(report.findings)
    scheme.validated_at = utcnow()
    scheme.checked_by = ", ".join(report.checks_run)[:CHECKED_BY_LIMIT]
    db.commit()
    return scheme, report


def approve_scheme(db: Session, paper_id: int, version: int, approver: str) -> MarkingScheme:
    """A named person takes responsibility for this scheme.

    Nothing does this automatically. A generated scheme nobody has approved stays
    visibly unapproved, however many checks it passed.
    """
    scheme = get_scheme(db, paper_id, version)
    ensure_transition(scheme, SchemeStatus.APPROVED)
    scheme.status = SchemeStatus.APPROVED
    scheme.approved_by = approver
    scheme.approved_at = utcnow()
    db.commit()
    return scheme


def publish_scheme(db: Session, paper_id: int, version: int) -> MarkingScheme:
    scheme = get_scheme(db, paper_id, version)
    ensure_transition(scheme, SchemeStatus.PUBLISHED)
    if errors := check_scheme_ready(scheme):
        raise ContentValidationError("The marking scheme is not ready to publish", errors)
    if problems := _unvalidated_generated(scheme):
        raise ContentValidationError("The marking scheme is not ready to publish", problems)

    scheme.status = SchemeStatus.PUBLISHED
    scheme.published_at = utcnow()
    db.commit()
    return scheme


def retire_scheme(db: Session, paper_id: int, version: int) -> MarkingScheme:
    """Withdraw a published scheme. Marks already given keep pointing at it."""
    scheme = get_scheme(db, paper_id, version)
    ensure_transition(scheme, SchemeStatus.RETIRED)
    scheme.status = SchemeStatus.RETIRED
    db.commit()
    return scheme


def _unvalidated_generated(scheme: MarkingScheme) -> list[str]:
    """A machine-written scheme has to have been checked before it marks anybody."""
    if scheme.source != SchemeSource.GENERATED:
        return []
    if scheme.validated_at is None:
        return ["A generated marking scheme has to be validated before it is published"]
    if scheme.status == SchemeStatus.VALIDATION_FAILED:
        return ["The validators rejected this marking scheme"]
    return []


def delete_scheme(db: Session, paper_id: int, version: int) -> None:
    scheme = get_scheme(db, paper_id, version)
    ensure_editable(scheme, "Published marking schemes cannot be deleted.")
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


# Converting a stored scheme


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
