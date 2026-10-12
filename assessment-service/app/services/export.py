"""Turning marked attempts into tables for the evaluation chapter.

Three files, because they answer different questions:

- points.csv    one row per marking point decision. The raw data; everything else
                can be recomputed from it in Excel, R or pandas.
- attempts.csv  one row per script, for score distributions.
- summary.csv   the headline agreement figures, already worked out.

Only submitted attempts are included: an attempt still being answered has no marks.

Column changes are additive only: a new column is always appended at the end of its
file, never inserted or renamed, so a script already written against points.csv does
not break. See docs/export-columns.md for what every column means and when it was
added.
"""

import csv
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from io import StringIO

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Answer,
    Attempt,
    AttemptStatus,
    MarkingPoint,
    PointResult,
    PointStatus,
    Question,
    SchemeSource,
)

POINT_COLUMNS = [
    "attempt_id",
    "student_ref",
    "paper_id",
    "paper_title",
    "scheme_version",
    "attempt_mode",
    "section",
    "answer_mode",
    "question",
    "point_code",
    "point_type",
    "marks",
    "status",
    "awarded",
    "decided_by",
    "marker",
    "confidence",
    "checker_awarded",
    "ai_awarded",
    "teacher_awarded",
    "teacher_saw_machine",
    "reviewed_by",
    "answer_length",
    "read_by_model",
    "reading_confidence",
    "corrected_by_student",
    # Appended, not inserted - see the module docstring.
    "question_id",
    "point_result_id",
    "reviewed_at",
    "scheme_source",
    "topics",
]

ATTEMPT_COLUMNS = [
    "attempt_id",
    "student_ref",
    "paper_id",
    "paper_title",
    "scheme_version",
    "mode",
    "status",
    "score",
    "max_score",
    "percent",
    "points_total",
    "points_awarded",
    "points_needing_review",
    "submitted_at",
    "marked_at",
    "scheme_source",
]

SUMMARY_COLUMNS = ["comparison", "scope", "judged", "agree", "disagree", "agreement_pct"]

MARKER_PAIRS = [
    ("chemistry checker vs teacher", "checker_awarded", "teacher_awarded"),
    ("AI judge vs teacher", "ai_awarded", "teacher_awarded"),
    ("chemistry checker vs AI judge", "checker_awarded", "ai_awarded"),
]

# "Official-scheme and AI-generated-scheme results are reported separately": an
# official past-paper scheme is evidence; a generated one is a draft a teacher
# approved. Folding them into one figure would hide which is which. "teacher" (a
# scheme typed in by hand, not from an official source) is its own slice too, rather
# than silently merged into "official".
SOURCE_SCOPES = [
    (SchemeSource.OFFICIAL, "official scheme"),
    (SchemeSource.TEACHER, "teacher scheme"),
    (SchemeSource.GENERATED, "generated scheme"),
]


@dataclass(frozen=True)
class Comparison:
    """How two markers compared on the points both of them judged."""

    name: str
    scope: str
    judged: int
    agree: int

    @property
    def disagree(self) -> int:
        return self.judged - self.agree

    @property
    def agreement_pct(self) -> float | None:
        return round(100 * self.agree / self.judged, 1) if self.judged else None


def submitted_points(paper_id: int | None = None) -> Select[tuple[PointResult]]:
    stmt = (
        select(PointResult)
        .join(PointResult.answer)
        .join(Answer.attempt)
        .where(Attempt.status != AttemptStatus.IN_PROGRESS)
        .order_by(Attempt.submitted_at, PointResult.id)
        # Every row of the export reads the answer, its attempt, its paper, its
        # question (and that question's topics), and the marking point's scheme.
        # Left lazy, that is a query per row - exactly what the large-export test
        # below guards against.
        .options(
            selectinload(PointResult.answer).selectinload(Answer.attempt),
            selectinload(PointResult.answer).selectinload(Answer.question).selectinload(Question.section),
            selectinload(PointResult.answer).selectinload(Answer.question).selectinload(Question.topics),
            selectinload(PointResult.point).selectinload(MarkingPoint.scheme),
        )
    )
    return stmt if paper_id is None else stmt.where(Attempt.paper_id == paper_id)


def point_rows(db: Session, paper_id: int | None = None) -> list[dict]:
    rows = []
    for result in db.scalars(submitted_points(paper_id)):
        answer = result.answer
        attempt = answer.attempt
        question = answer.question
        rows.append(
            {
                "attempt_id": str(attempt.id),
                "student_ref": attempt.student_ref,
                "paper_id": attempt.paper_id,
                "paper_title": attempt.paper.title,
                "scheme_version": attempt.scheme.version,
                "attempt_mode": attempt.mode.value,
                "section": question.section.code,
                "answer_mode": question.section.answer_mode.value,
                "question": question.full_label,
                "point_code": result.point.code,
                "point_type": result.point.point_type.value,
                "marks": result.point.marks,
                "status": result.status.value,
                "awarded": result.awarded,
                "decided_by": result.method.value if result.method else "",
                "marker": result.marker or "",
                "confidence": _or_blank(result.confidence),
                "checker_awarded": _or_blank(result.checker_awarded),
                "ai_awarded": _or_blank(result.ai_awarded),
                "teacher_awarded": _or_blank(result.teacher_awarded),
                "teacher_saw_machine": _or_blank(result.teacher_saw_machine),
                "reviewed_by": result.reviewed_by or "",
                "answer_length": len(answer.text or ""),
                "read_by_model": answer.reader or "",
                "reading_confidence": _or_blank(answer.reading_confidence),
                "corrected_by_student": answer.corrected_by_student,
                "question_id": question.id,
                "point_result_id": result.id,
                "reviewed_at": _when(result.reviewed_at),
                "scheme_source": result.point.scheme.source.value,
                "topics": ";".join(topic.code for topic in question.topics),
            }
        )
    return rows


def attempt_rows(db: Session, paper_id: int | None = None) -> list[dict]:
    stmt = (
        select(Attempt)
        .where(Attempt.status != AttemptStatus.IN_PROGRESS)
        .order_by(Attempt.started_at)
        .options(
            selectinload(Attempt.answers).selectinload(Answer.point_results),
            selectinload(Attempt.scheme),
        )
    )
    if paper_id is not None:
        stmt = stmt.where(Attempt.paper_id == paper_id)

    rows = []
    for attempt in db.scalars(stmt):
        results = [r for answer in attempt.answers for r in answer.point_results]
        rows.append(
            {
                "attempt_id": str(attempt.id),
                "student_ref": attempt.student_ref,
                "paper_id": attempt.paper_id,
                "paper_title": attempt.paper.title,
                "scheme_version": attempt.scheme.version,
                "mode": attempt.mode.value,
                "status": attempt.status.value,
                "score": _or_blank(attempt.score),
                "max_score": attempt.max_score,
                "percent": _percent(attempt.score, attempt.max_score),
                "points_total": len(results),
                "points_awarded": sum(r.status == PointStatus.AWARDED for r in results),
                "points_needing_review": sum(r.status == PointStatus.NEEDS_REVIEW for r in results),
                "submitted_at": _when(attempt.submitted_at),
                "marked_at": _when(attempt.marked_at),
                "scheme_source": attempt.scheme.source.value,
            }
        )
    return rows


def comparisons(db: Session, paper_id: int | None = None) -> list[Comparison]:
    """Agreement between each pair of markers.

    Three groupings, because they answer different questions:

    - all reviewed / blind only       every reviewed point, and the fair subset of it
    - official / teacher / generated  the same two figures again, kept apart by where
                                       the marking scheme came from. An official
                                       past-paper scheme is evidence; a scheme a model
                                       wrote is a draft a teacher approved - mixing
                                       their agreement figures into one number would
                                       hide which is which.
    """
    reviewed = [r for r in db.scalars(submitted_points(paper_id)) if r.teacher_awarded is not None]
    # Compared with False, not falsy: a NULL means the decision predates blind review
    # and cannot be claimed as one. See app/services/review.py for the same rule.
    blind = [r for r in reviewed if r.teacher_saw_machine is False]

    out = []
    for name, left, right in MARKER_PAIRS:
        out.append(_compare(name, "all reviewed", reviewed, left, right))
        out.append(_compare(name, "blind only", blind, left, right))

    for source, scope in SOURCE_SCOPES:
        from_source = [r for r in reviewed if r.point.scheme.source == source]
        for name, left, right in MARKER_PAIRS:
            out.append(_compare(name, scope, from_source, left, right))
    return out


def summary_rows(db: Session, paper_id: int | None = None) -> list[dict]:
    return [
        {
            "comparison": c.name,
            "scope": c.scope,
            "judged": c.judged,
            "agree": c.agree,
            "disagree": c.disagree,
            "agreement_pct": _or_blank(c.agreement_pct),
        }
        for c in comparisons(db, paper_id)
    ]


def to_csv(columns: Sequence[str], rows: Iterable[dict]) -> str:
    out = StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=list(columns))
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue()


def _compare(name: str, scope: str, results: Sequence[PointResult], left: str, right: str) -> Comparison:
    both = [r for r in results if getattr(r, left) is not None and getattr(r, right) is not None]
    return Comparison(name, scope, len(both), sum(getattr(r, left) == getattr(r, right) for r in both))


def _or_blank(value: object) -> object:
    # An empty cell, so Excel and pandas read it as missing rather than the text "None".
    return "" if value is None else value


def _percent(score: float | None, out_of: float) -> object:
    return "" if score is None or not out_of else round(100 * score / out_of, 1)


def _when(value: datetime | None) -> str:
    return value.isoformat() if value else ""
