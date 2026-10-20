"""What a generated question is built from.

Three kinds of material:

- the syllabus contents of the chosen topics, which say what may be asked about
- a few real past-paper questions with their official marking points, which show how
  a question is phrased and how its marks are split
- passages retrieved from trusted Chemistry resources, when an embedding model is
  configured

The first two are fetched by direct lookup: the topic codes are already known, so the
right material can simply be read out of the database, no embeddings needed. The
third is similarity search, and only it needs one - without an embedding model, this
module behaves exactly as it did before resources existed.

This is what stops the model inventing chemistry. It is not a guarantee: grounding
reduces made-up facts, it does not check that the reasoning holds together.

Resource passages are never citations the model is asked to produce. What was "used"
is recorded by this module - which passages were retrieved and handed to the model -
never by asking the model which sources it drew on, which is not something an AI
reply can be trusted to report honestly (see app/services/generator/build.py, which
stores this on Paper.grounded_in).
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.embeddings import EmbeddingModel
from app.models import (
    AnswerMode,
    ContentStatus,
    MarkingPoint,
    MarkingScheme,
    Paper,
    PaperKind,
    PointType,
    SchemeSource,
    SchemeStatus,
    Topic,
)
from app.services.resources.retrieve import DEFAULT_LIMIT
from app.services.resources.retrieve import search as search_resources
from app.services.topics import topic_contents

MOST_EXAMPLES = 3
MOST_POINTS_SHOWN = 6
# Below this cosine similarity a passage is not relevant enough to ground a question
# with. Matches the default in app.config.Settings.resource_min_similarity; a caller
# that reads settings passes that value through instead of this fallback.
DEFAULT_MIN_SIMILARITY = 0.5


@dataclass(frozen=True)
class SourceRef:
    """One retrieved passage that was shown to the model, for Paper.grounded_in.

    This is the system's own record, written before the model ever sees the brief -
    not anything the model is asked to report back.
    """

    resource_code: str
    resource_title: str
    resource_version: int
    page_number: int | None
    chunk_id: int
    similarity: float

    def as_dict(self) -> dict:
        return {
            "resource_code": self.resource_code,
            "resource_title": self.resource_title,
            "resource_version": self.resource_version,
            "page_number": self.page_number,
            "chunk_id": self.chunk_id,
            "similarity": round(self.similarity, 4),
        }


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
            MarkingScheme.status == SchemeStatus.PUBLISHED,
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
    if question.table:
        parts.append(f"  table: {' | '.join(question.table['headers'])}")
        for row in question.table["rows"]:
            parts.append(f"    {' | '.join(row)}")
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


def resource_passages(
    db: Session,
    embedder: EmbeddingModel | None,
    topics: list[Topic],
    *,
    limit_per_topic: int = DEFAULT_LIMIT,
    min_similarity: float = DEFAULT_MIN_SIMILARITY,
) -> tuple[list[str], list[SourceRef]]:
    """Resource passages relevant to the chosen topics, and the record of what was used.

    There is no literal user query at generation time, so each topic's own name and
    syllabus content stand in for one: it is what the question is meant to be about.
    Without an embedder (no model available) this returns nothing, and the rest of
    generation carries on exactly as it would have before resources existed. search()
    itself has the same fallback for a database that cannot run a similarity search.
    """
    if embedder is None:
        return [], []

    lines: list[str] = []
    sources: list[SourceRef] = []
    seen_chunks: set[int] = set()

    for topic in topics:
        query = topic.name if not topic.content else f"{topic.name}\n{topic.content}"
        result = search_resources(
            db,
            embedder,
            query,
            topic_code=topic.code,
            limit=limit_per_topic,
            min_similarity=min_similarity,
        )
        for passage in result.passages:
            if passage.chunk_id in seen_chunks:
                continue
            seen_chunks.add(passage.chunk_id)
            where = f"p.{passage.page_number}" if passage.page_number else "unknown page"
            lines.append(f"[{passage.resource_title}, {where}]\n{passage.text}")
            sources.append(
                SourceRef(
                    resource_code=passage.resource_code,
                    resource_title=passage.resource_title,
                    resource_version=passage.resource_version,
                    page_number=passage.page_number,
                    chunk_id=passage.chunk_id,
                    similarity=passage.similarity,
                )
            )
    return lines, sources


def material_for(
    db: Session, codes: list[str], blueprint, known: dict, embedder: EmbeddingModel | None = None
) -> tuple:
    """Everything the model should be grounded in, ready for generate().

    Returns the syllabus lines for the chosen topics, a few real past questions of
    each kind the paper asks for, the retrieved resource passages (empty without an
    embedder), and the source record for those passages.
    """
    topics = [known[code] for code in codes]
    examples = {
        section.answer_mode: example_questions(db, section.answer_mode) for section in blueprint.sections
    }
    passages, sources = resource_passages(db, embedder, topics)
    return syllabus_lines(topics), examples, passages, sources
