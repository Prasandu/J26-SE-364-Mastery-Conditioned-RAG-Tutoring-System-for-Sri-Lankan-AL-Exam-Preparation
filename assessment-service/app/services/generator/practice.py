"""A student making their own practice paper.

Different from an admin generating a model paper in three ways:

- It belongs to the student. Nobody else sees it in their list of papers.
- It is published straight away, because the point is to sit it now. There is no
  teacher to wait for, so the student is told plainly that a machine wrote it and
  that it may contain mistakes.
- It is capped. The AI quota is small and shared, so one person cannot empty it.

The marking scheme is still written alongside the questions, so the paper is marked
the same way as any other.
"""

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.author import QuestionAuthor
from app.ai.critic import QuestionCritic
from app.ai.embeddings import EmbeddingModel
from app.config import Settings
from app.errors import ConflictError, ContentValidationError, NotFoundError
from app.models import Attempt, ContentStatus, Paper, utcnow
from app.schemas.generate import GeneratedOut, PracticeIn
from app.services.generator.api import check_topics, shape_of
from app.services.generator.blueprint import build_blueprint, problems
from app.services.generator.build import generate
from app.services.generator.grounding import material_for
from app.services.papers import create_paper, publish_paper
from app.services.schemes import create_scheme, publish_scheme, validate_scheme

A_DAY = timedelta(days=1)


def made_today(db: Session, student_ref: str) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Paper)
        .where(Paper.created_by == student_ref, Paper.created_at >= utcnow() - A_DAY)
    )


def made_today_in_total(db: Session) -> int:
    """Every practice paper made today, whoever asked for it."""
    return db.scalar(
        select(func.count())
        .select_from(Paper)
        .where(Paper.created_by.is_not(None), Paper.created_at >= utcnow() - A_DAY)
    )


def make_practice_paper(
    db: Session,
    data: PracticeIn,
    author: QuestionAuthor,
    settings: Settings,
    critic: QuestionCritic | None = None,
    embedder: EmbeddingModel | None = None,
) -> GeneratedOut:
    """Write a practice paper for one student and open it for them straight away."""
    allowed = settings.practice_papers_per_day
    if allowed == 0:
        raise ConflictError("Practice papers are switched off at the moment.")

    already = made_today(db, data.student_ref)
    if already >= allowed:
        raise ConflictError(
            f"You have made {already} practice papers today, which is the limit of "
            f"{allowed}. Try again tomorrow."
        )

    # The per student cap is keyed on a name the caller picks, so it alone would not
    # stop anyone from emptying a shared AI quota by using a different name each time.
    budget = settings.practice_papers_per_day_total
    if made_today_in_total(db) >= budget:
        raise ConflictError(
            f"{budget} practice papers have been made today, which is all this service "
            "allows. Try again tomorrow."
        )

    known = check_topics(db, data.topic_codes)
    blueprint = build_blueprint(data.title, data.topic_codes, data.counts.as_modes())
    if found := problems(blueprint):
        raise ContentValidationError("The paper cannot be made", found)

    most = settings.practice_questions_at_once
    if blueprint.questions > most:
        raise ContentValidationError(
            "The paper cannot be made",
            [f"{blueprint.questions} questions at once is more than the {most} allowed"],
        )

    written = generate(
        blueprint,
        author,
        *material_for(db, data.topic_codes, blueprint, known, embedder),
        critic=critic,
        attempts=settings.generate_max_attempts,
    )

    paper = create_paper(db, written.paper)
    paper.created_by = data.student_ref
    paper.grounded_in = written.sources
    scheme = create_scheme(db, paper.id, written.scheme)

    # Validate before publishing, not after. publish_scheme refuses a generated scheme
    # that has not been through the validators, which is what stops a machine-written
    # scheme marking a student by default.
    validate_scheme(db, paper.id, scheme.version)

    # Published at once: the student made it to sit it, and no teacher is waiting to
    # check it. It stays unapproved, and they are told on screen that a machine wrote
    # the questions and that it may contain mistakes.
    publish_scheme(db, paper.id, scheme.version)
    publish_paper(db, paper.id)

    return GeneratedOut(
        paper_id=paper.id,
        scheme_version=scheme.version,
        title=paper.title,
        written_by=written.written_by,
        kept=written.kept,
        dropped=written.dropped,
        attempts=written.attempts,
        checked_by=written.checked_by,
        needs_teacher=[str(finding) for finding in written.needs_teacher],
        sources=written.sources,
        shape=shape_of(blueprint),
    )


def is_practice(paper: Paper) -> bool:
    return paper.created_by is not None and paper.status == ContentStatus.PUBLISHED


def delete_practice_paper(db: Session, paper_id: int, student_ref: str) -> None:
    """Throw away a practice paper nobody has sat.

    Only its owner may, and only while it has no attempts: deleting one that has been
    answered would take the marks with it.
    """
    paper = db.get(Paper, paper_id)
    if paper is None or paper.created_by != student_ref:
        raise NotFoundError("Practice paper not found")

    sat = db.scalar(select(func.count()).select_from(Attempt).where(Attempt.paper_id == paper_id))
    if sat:
        raise ConflictError(
            f"You have already answered this paper {sat} {'time' if sat == 1 else 'times'}, "
            "so it is kept with your results."
        )

    db.delete(paper)
    db.commit()
