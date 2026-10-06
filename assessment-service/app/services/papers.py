"""Papers: create, replace, delete and publish, plus building the student view.

Life cycle: draft -> published. Published papers never change, so every mark
given against them stays traceable.
"""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ConflictError, ContentValidationError, NotFoundError
from app.models import (
    ContentStatus,
    MarkingScheme,
    Paper,
    PaperKind,
    Question,
    Section,
    Topic,
    utcnow,
)
from app.schemas.admin import PaperIn, QuestionIn
from app.schemas.content import PaperDetail, PaperSummary, QuestionOut, SectionOut
from app.services.topics import topics_by_code
from app.services.validation import check_paper, check_paper_ready


def list_papers(
    db: Session, *, kind: PaperKind | None = None, year: int | None = None, published_only: bool = False
) -> Sequence[Paper]:
    stmt = select(Paper).order_by(Paper.id)
    if kind is not None:
        stmt = stmt.where(Paper.kind == kind)
    if year is not None:
        stmt = stmt.where(Paper.year == year)
    if published_only:
        stmt = stmt.where(Paper.status == ContentStatus.PUBLISHED)
    return db.scalars(stmt).all()


def get_paper(db: Session, paper_id: int, *, published_only: bool = False) -> Paper:
    paper = db.get(Paper, paper_id)
    if paper is None or (published_only and paper.status != ContentStatus.PUBLISHED):
        raise NotFoundError("Paper not found")
    return paper


def create_paper(db: Session, data: PaperIn) -> Paper:
    paper = Paper(status=ContentStatus.DRAFT)
    _fill_paper(db, paper, data)
    db.add(paper)
    db.commit()
    return paper


def replace_paper(db: Session, paper_id: int, data: PaperIn) -> Paper:
    """Replace a draft paper's details and all its questions."""
    paper = get_paper(db, paper_id)
    ensure_draft(paper, "Published papers cannot be changed.")
    if paper.marking_schemes:
        raise ConflictError("Delete this paper's marking schemes before changing its questions.")

    paper.sections.clear()
    db.flush()  # remove the old questions before adding new ones
    _fill_paper(db, paper, data)
    db.commit()
    return paper


def delete_paper(db: Session, paper_id: int) -> None:
    paper = get_paper(db, paper_id)
    ensure_draft(paper, "Published papers cannot be deleted.")
    db.delete(paper)
    db.commit()


def publish_paper(db: Session, paper_id: int) -> Paper:
    paper = get_paper(db, paper_id)
    ensure_draft(paper, "This paper is already published.")
    if errors := check_paper_ready(paper):
        raise ContentValidationError("The paper is not ready to publish", errors)
    paper.status = ContentStatus.PUBLISHED
    paper.published_at = utcnow()
    db.commit()
    return paper


def ensure_draft(item: Paper | MarkingScheme, message: str) -> None:
    if item.status != ContentStatus.DRAFT:
        raise ConflictError(message)


def to_paper_detail(paper: Paper) -> PaperDetail:
    """Student view of a paper: questions only, never answers."""
    return PaperDetail(
        **PaperSummary.model_validate(paper).model_dump(),
        sections=[
            SectionOut(
                id=section.id,
                code=section.code,
                title=section.title,
                answer_mode=section.answer_mode,
                choose_count=section.choose_count,
                instructions=section.instructions,
                questions=[_question_out(q) for q in section.questions if q.parent is None],
            )
            for section in paper.sections
        ],
    )


def _question_out(question: Question) -> QuestionOut:
    return QuestionOut(
        id=question.id,
        label=question.label,
        text=question.text,
        max_marks=question.max_marks,
        options=question.options,
        topics=[topic.code for topic in question.topics],
        sub_questions=[_question_out(sub) for sub in question.sub_questions],
    )


def _fill_paper(db: Session, paper: Paper, data: PaperIn) -> None:
    topics = topics_by_code(db)
    if errors := check_paper(data, set(topics)):
        raise ContentValidationError("The paper has problems", errors)

    paper.title = data.title
    paper.kind = data.kind
    paper.year = data.year
    paper.subject = data.subject
    for order, section_in in enumerate(data.sections):
        section = Section(
            code=section_in.code,
            title=section_in.title,
            answer_mode=section_in.answer_mode,
            choose_count=section_in.choose_count,
            instructions=section_in.instructions,
            order_no=order,
        )
        paper.sections.append(section)
        _add_questions(section, section_in.questions, parent=None, topics=topics)


def _add_questions(
    section: Section, items: list[QuestionIn], parent: Question | None, topics: dict[str, Topic]
) -> None:
    for order, item in enumerate(items):
        question = Question(
            parent=parent,
            label=item.label,
            text=item.text,
            max_marks=item.max_marks,
            options=[option.model_dump() for option in item.options] if item.options else None,
            order_no=order,
            topics=[topics[code] for code in item.topics],
        )
        # Append on the section side: SQLAlchemy saves objects added to a collection,
        # but not objects only linked the other way (question.section = ...).
        section.questions.append(question)
        _add_questions(section, item.sub_questions, parent=question, topics=topics)
