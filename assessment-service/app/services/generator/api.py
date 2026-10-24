"""The generator as the API uses it: plan a paper, or write one."""

from collections import Counter
from dataclasses import replace

from sqlalchemy.orm import Session

from app.ai.author import QuestionAuthor
from app.ai.critic import QuestionCritic
from app.ai.embeddings import EmbeddingModel
from app.config import Settings
from app.errors import ContentValidationError
from app.schemas.generate import (
    GeneratedOut,
    GenerateIn,
    RatesOut,
    SectionShapeOut,
    ShapeOut,
)
from app.services.generator.blueprint import (
    MARKS_PER_QUESTION,
    MAX_QUESTIONS_PER_SECTION,
    MINUTES_PER_QUESTION,
    ROUND_TO_SECONDS,
    Blueprint,
    build_blueprint,
    problems,
)
from app.services.generator.build import DEFAULT_ATTEMPTS, generate
from app.services.generator.grounding import material_for
from app.services.papers import create_paper
from app.services.schemes import create_scheme, validate_scheme
from app.services.topics import topics_by_code


def rates() -> RatesOut:
    """The fixed timings, so a screen can work the duration out as the person types."""
    return RatesOut(
        minutes_per_question={mode.value: m for mode, m in MINUTES_PER_QUESTION.items()},
        marks_per_question={mode.value: m for mode, m in MARKS_PER_QUESTION.items()},
        round_to_seconds=ROUND_TO_SECONDS,
        max_per_section=MAX_QUESTIONS_PER_SECTION,
    )


def plan(db: Session, data: GenerateIn) -> ShapeOut:
    """What the paper would be. No model is called, so this is instant and free."""
    check_topics(db, data.topic_codes)
    return shape_of(build_blueprint(data.title, data.topic_codes, data.counts.as_modes()))


def write(
    db: Session,
    data: GenerateIn,
    author: QuestionAuthor,
    settings: Settings | None = None,
    critic: QuestionCritic | None = None,
    embedder: EmbeddingModel | None = None,
) -> GeneratedOut:
    """Ask the model for the questions, verify them, then save two drafts.

    The scheme is left for a teacher to approve. It is validated here so the findings
    are stored with it, but nothing publishes it. `embedder` grounds the brief in
    retrieved resource passages when one is configured; without it, nothing changes
    from before resources existed.
    """
    known = check_topics(db, data.topic_codes)
    blueprint = build_blueprint(data.title, data.topic_codes, data.counts.as_modes())
    if found := problems(blueprint):
        raise ContentValidationError("The paper cannot be generated", found)

    written = generate(
        blueprint,
        author,
        *material_for(db, data.topic_codes, blueprint, known, embedder),
        critic=critic,
        attempts=settings.generate_max_attempts if settings else DEFAULT_ATTEMPTS,
    )

    paper = create_paper(db, written.paper)
    paper.grounded_in = written.sources
    scheme = create_scheme(db, paper.id, written.scheme)
    validate_scheme(db, paper.id, scheme.version)
    db.commit()
    return generated_out(paper, scheme.version, written, blueprint)


def generated_out(paper, version: int, written, blueprint) -> GeneratedOut:
    return GeneratedOut(
        paper_id=paper.id,
        scheme_version=version,
        title=paper.title,
        written_by=written.written_by,
        kept=written.kept,
        dropped=written.dropped,
        kept_despite=written.kept_despite,
        attempts=written.attempts,
        checked_by=written.checked_by,
        needs_teacher=[str(finding) for finding in written.needs_teacher],
        sources=written.sources,
        shape=shape_of(_as_built(paper, blueprint)),
    )


def _as_built(paper, blueprint: Blueprint) -> Blueprint:
    """The blueprint as the paper actually came out.

    A question the checks rejected is listed in `dropped` and never reaches the
    paper, so reporting the requested shape overstates the marks and the duration
    of what was really written - a paper of three questions described as four.
    """
    kept: Counter = Counter()
    for section in paper.sections:
        kept[section.answer_mode] += sum(1 for q in section.questions if q.parent is None)
    return replace(
        blueprint,
        sections=[
            replace(plan, count=kept[plan.answer_mode])
            for plan in blueprint.sections
            if kept[plan.answer_mode]
        ],
    )


def check_topics(db: Session, codes: list[str]) -> dict:
    known = topics_by_code(db)
    if unknown := sorted(set(codes) - set(known)):
        raise ContentValidationError(
            "The paper cannot be generated", [f"Unknown topic {code}" for code in unknown]
        )
    return known


def shape_of(blueprint: Blueprint) -> ShapeOut:
    return ShapeOut(
        title=blueprint.title,
        sections=[
            SectionShapeOut(
                code=section.code,
                title=section.title,
                answer_mode=section.answer_mode,
                count=section.count,
                marks=section.marks,
                minutes=section.minutes,
            )
            for section in blueprint.sections
        ],
        questions=blueprint.questions,
        marks=blueprint.marks,
        minutes=blueprint.minutes,
        duration=blueprint.duration,
        problems=problems(blueprint),
    )
