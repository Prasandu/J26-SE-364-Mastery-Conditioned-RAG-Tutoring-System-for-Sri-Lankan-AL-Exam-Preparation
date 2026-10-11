"""The generator as the API uses it: plan a paper, or write one."""

from sqlalchemy.orm import Session

from app.ai.author import QuestionAuthor
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
    ROUND_TO_MINUTES,
    Blueprint,
    build_blueprint,
    problems,
)
from app.services.generator.build import generate
from app.services.papers import create_paper
from app.services.schemes import create_scheme
from app.services.topics import topics_by_code


def rates() -> RatesOut:
    """The fixed timings, so a screen can work the duration out as the person types."""
    return RatesOut(
        minutes_per_question={mode.value: m for mode, m in MINUTES_PER_QUESTION.items()},
        marks_per_question={mode.value: m for mode, m in MARKS_PER_QUESTION.items()},
        round_to_minutes=ROUND_TO_MINUTES,
        max_per_section=MAX_QUESTIONS_PER_SECTION,
    )


def plan(db: Session, data: GenerateIn) -> ShapeOut:
    """What the paper would be. No model is called, so this is instant and free."""
    check_topics(db, data.topic_codes)
    return shape_of(build_blueprint(data.title, data.topic_codes, data.counts.as_modes()))


def write(db: Session, data: GenerateIn, author: QuestionAuthor) -> GeneratedOut:
    """Ask the model for the questions, then save a draft paper and a draft scheme."""
    known = check_topics(db, data.topic_codes)
    blueprint = build_blueprint(data.title, data.topic_codes, data.counts.as_modes())
    if found := problems(blueprint):
        raise ContentValidationError("The paper cannot be generated", found)

    topic_lines = [f"{code} {known[code].name}" for code in data.topic_codes]
    written = generate(blueprint, author, topic_lines)

    paper = create_paper(db, written.paper)
    scheme = create_scheme(db, paper.id, written.scheme)
    return GeneratedOut(
        paper_id=paper.id,
        scheme_version=scheme.version,
        title=paper.title,
        written_by=written.written_by,
        kept=written.kept,
        dropped=written.dropped,
        shape=shape_of(blueprint),
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
