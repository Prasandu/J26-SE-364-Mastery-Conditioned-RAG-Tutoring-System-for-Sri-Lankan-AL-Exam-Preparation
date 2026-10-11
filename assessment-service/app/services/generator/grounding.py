"""What a generated question is built from.

Two kinds of material, both fetched by direct lookup rather than by searching:

- the syllabus contents of the chosen topics, which say what may be asked about
- a few real past-paper questions with their official marking points, which show how
  a question is phrased and how its marks are split

Neither needs embeddings. The topic codes are already known, so the right material can
simply be read out of the database.

This is what stops the model inventing chemistry. It is not a guarantee: grounding
reduces made-up facts, it does not check that the reasoning holds together.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AnswerMode,
    ContentStatus,
    MarkingPoint,
    MarkingScheme,
    Paper,
    PaperKind,
    PointType,
    SchemeSource,
    Topic,
)
from app.services.topics import topic_contents

MOST_EXAMPLES = 3
MOST_POINTS_SHOWN = 6


def syllabus_lines(topics: list[Topic]) -> list[str]:
    """Each chosen topic with what the syllabus says it covers."""
    lines = []
    for topic in topics:
        contents = topic_contents(topic)
        if contents:
            bullets = "\n".join(f"    - {item}" for item in contents)
            lines.append(f"{topic.code} {topic.name}\n{bullets}")
        else:
            # Nothing in the syllabus file for this one; the name still says the scope.
            lines.append(f"{topic.code} {topic.name}")
    return lines


def example_questions(db: Session, answer_mode: AnswerMode, limit: int = MOST_EXAMPLES) -> list[str]:
    """Real past-paper questions with their official marking points.

    Only from published past papers with an official scheme: a generated paper is no
    use as an example of how a real one is written.
    """
    stmt = (
        select(MarkingScheme)
        .join(MarkingScheme.paper)
        .where(
            Paper.kind == PaperKind.PAST,
            Paper.status == ContentStatus.PUBLISHED,
            MarkingScheme.status == ContentStatus.PUBLISHED,
            MarkingScheme.source == SchemeSource.OFFICIAL,
        )
    )
    shown: list[str] = []
    for scheme in db.scalars(stmt):
        for question in scheme.paper.iter_questions():
            if len(shown) >= limit:
                return shown
            if question.sub_questions or question.section.answer_mode != answer_mode:
                continue
            points = [p for p in scheme.points if p.question_id == question.id]
            if points:
                shown.append(_as_example(question, points))
    return shown


def _as_example(question, points: list[MarkingPoint]) -> str:
    parts = [f"Q{question.full_label}: {question.text.strip()}"]
    for option in question.options or []:
        parts.append(f"  ({option['label']}) {option['text']}")
    for point in sorted(points, key=lambda p: p.order_no)[:MOST_POINTS_SHOWN]:
        parts.append(f"  {point.code} [{point.point_type.value}, {point.marks:g}] {_says(point)}")
    return "\n".join(parts)


def _says(point: MarkingPoint) -> str:
    """What this point is worth a mark for.

    An official multiple choice key keeps the answer in `expected` and its description
    is only "Correct option", which teaches the model nothing. Show the answer instead.
    """
    option = (point.expected or {}).get("option")
    if option and point.point_type == PointType.MCQ_KEY:
        accepted = "/".join([str(option), *point.alternatives])
        return f"the answer is ({accepted})"
    return point.description


def material_for(db: Session, codes: list[str], blueprint, known: dict) -> tuple:
    """Everything the model should be grounded in, ready for generate().

    Returns the syllabus lines for the chosen topics, and a few real past questions
    of each kind the paper asks for.
    """
    topics = [known[code] for code in codes]
    examples = {
        section.answer_mode: example_questions(db, section.answer_mode) for section in blueprint.sections
    }
    return syllabus_lines(topics), examples
