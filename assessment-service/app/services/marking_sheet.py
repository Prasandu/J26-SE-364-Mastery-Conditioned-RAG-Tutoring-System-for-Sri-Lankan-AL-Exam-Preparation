"""Building the paper marking sheet a teacher fills in by hand.

The sheet has one row per marking point, in paper order, taken from the published
scheme. That matters: the teacher then marks exactly what the system marks, so
"teacher said award, AI said do not award" compares the same thing. A teacher
marking "7 out of 10 overall" could not be compared with anything.
"""

import csv
from dataclasses import dataclass
from io import StringIO

from app.models import MarkingScheme, Question

COLUMNS = [
    "section",
    "question",
    "point",
    "what earns the mark",
    "marks",
    "award? (y/n)",
    "comment",
]


@dataclass(frozen=True)
class SheetRow:
    section: str
    question: str
    point: str
    description: str
    marks: float


def sheet_rows(scheme: MarkingScheme) -> list[SheetRow]:
    """Every marking point of the scheme, in the order the questions appear."""
    by_question: dict[int, list] = {}
    for point in scheme.points:
        by_question.setdefault(point.question_id, []).append(point)

    rows = []
    for question in scheme.paper.iter_questions():
        for point in sorted(by_question.get(question.id, []), key=lambda p: (p.order_no, p.code)):
            rows.append(
                SheetRow(
                    section=question.section.code,
                    question=question.full_label,
                    point=point.code,
                    description=point.description,
                    marks=point.marks,
                )
            )
    return rows


def question_marks(question: Question) -> str:
    return "" if question.max_marks is None else f"{question.max_marks:g}"


def to_csv(scheme: MarkingScheme, student_ref: str = "") -> str:
    """The sheet as CSV, ready to print or open in Excel."""
    out = StringIO(newline="")
    writer = csv.writer(out)
    writer.writerow([f"Paper: {scheme.paper.title}"])
    writer.writerow([f"Marking scheme version: {scheme.version}"])
    writer.writerow([f"Student: {student_ref}" if student_ref else "Student: ____________"])
    writer.writerow(["Teacher id: ____________", "Date: ____________"])
    writer.writerow([])
    writer.writerow(COLUMNS)

    for row in sheet_rows(scheme):
        writer.writerow([row.section, row.question, row.point, row.description, f"{row.marks:g}", "", ""])

    total = sum(row.marks for row in sheet_rows(scheme))
    writer.writerow([])
    writer.writerow(["", "", "", "Total marks available", f"{total:g}", "", ""])
    return out.getvalue()
