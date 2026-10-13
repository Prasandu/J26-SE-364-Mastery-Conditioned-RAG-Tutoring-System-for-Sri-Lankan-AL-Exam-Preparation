"""Papers: create, replace, delete and publish, plus building the student view.

Life cycle: draft -> published. Published papers never change, so every mark
given against them stays traceable.
"""

from collections.abc import Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.errors import ConflictError, ContentValidationError, NotFoundError
from app.models import (
    ContentStatus,
    Paper,
    PaperKind,
    Question,
    Section,
    Topic,
    utcnow,
)
from app.schemas.admin import PaperIn, QuestionIn
from app.schemas.content import AdminPaperDetail, PaperDetail, PaperSummary, QuestionOut, SectionOut
from app.services.topics import topics_by_code
from app.services.validation import check_new_questions, check_paper, check_paper_ready

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def list_papers(
    db: Session,
    *,
    kind: PaperKind | None = None,
    year: int | None = None,
    published_only: bool = False,
    student_ref: str | None = None,
) -> Sequence[Paper]:
    """Papers to show. Practice papers belong to the student who made them.

    Without a student_ref only the shared papers are listed, so one student's practice
    paper never turns up in someone else's list.
    """
    stmt = _paper_query(kind=kind, year=year, student_ref=student_ref)
    if published_only:
        stmt = stmt.where(Paper.status == ContentStatus.PUBLISHED)
    return db.scalars(stmt).all()


def search_papers(
    db: Session,
    *,
    search: str | None = None,
    kind: PaperKind | None = None,
    year: int | None = None,
    status: ContentStatus | None = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> tuple[Sequence[Paper], int]:
    """Admin listing: every paper (shared and practice), searchable and paginated."""
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    page = max(page, 1)

    stmt = select(Paper)
    if search:
        stmt = stmt.where(Paper.title.ilike(f"%{search}%"))
    if kind is not None:
        stmt = stmt.where(Paper.kind == kind)
    if year is not None:
        stmt = stmt.where(Paper.year == year)
    if status is not None:
        stmt = stmt.where(Paper.status == status)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    page_stmt = stmt.order_by(Paper.id.desc()).limit(page_size).offset((page - 1) * page_size)
    return db.scalars(page_stmt).all(), total or 0


def _paper_query(*, kind: PaperKind | None, year: int | None, student_ref: str | None):
    stmt = select(Paper).order_by(Paper.id)
    mine = Paper.created_by.is_(None)
    if student_ref:
        mine = or_(mine, Paper.created_by == student_ref)
    stmt = stmt.where(mine)
    if kind is not None:
        stmt = stmt.where(Paper.kind == kind)
    if year is not None:
        stmt = stmt.where(Paper.year == year)
    return stmt


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


def append_questions(db: Session, paper_id: int, section_code: str, questions: list[QuestionIn]) -> Paper:
    """Add more questions to an existing draft section, continuing after whatever
    is already there - for resuming an OCR import split across several sessions
    (e.g. a daily AI quota) without losing what was already saved. The section's
    own answer_mode and other settings are left exactly as they are.
    """
    paper = get_paper(db, paper_id)
    ensure_draft(paper, "Published papers cannot be changed.")

    section = next((s for s in paper.sections if s.code == section_code), None)
    if section is None:
        raise NotFoundError(f"This paper has no section '{section_code}'")

    topics = topics_by_code(db)
    existing_labels = {q.full_label for q in section.questions}
    if errors := check_new_questions(
        section_code, existing_labels, questions, section.answer_mode, set(topics)
    ):
        raise ContentValidationError("Cannot add these questions", errors)

    top_level_orders = [q.order_no for q in section.questions if q.parent is None]
    start_order = max(top_level_orders, default=-1) + 1
    _add_questions(section, questions, parent=None, topics=topics, start_order=start_order)
    db.commit()
    return paper


def copy_paper(db: Session, paper_id: int) -> Paper:
    """A new draft paper with the same sections and questions, ready to be edited
    - the way to correct a published paper without touching the original, the
    same idea app.services.schemes.copy_scheme already gives marking schemes.
    The original stays published and unchanged, so every mark already given
    against it stays traceable to exactly what a student saw. Its marking
    schemes are not copied - add a new one to the copy separately.
    """
    return create_paper(db, to_paper_in(get_paper(db, paper_id)))


def to_paper_in(paper: Paper) -> PaperIn:
    """The stored paper in the same shape an admin sends, e.g. to copy it."""
    return PaperIn.model_validate(
        {
            "title": paper.title,
            "kind": paper.kind,
            "year": paper.year,
            "subject": paper.subject,
            "sections": [
                {
                    "code": section.code,
                    "title": section.title,
                    "answer_mode": section.answer_mode,
                    "choose_count": section.choose_count,
                    "instructions": section.instructions,
                    "questions": [_question_in(q) for q in section.questions if q.parent is None],
                }
                for section in paper.sections
            ],
        }
    )


def _question_in(question: Question) -> dict:
    return {
        "label": question.label,
        "text": question.text,
        "max_marks": question.max_marks,
        "options": question.options,
        "topics": [topic.code for topic in question.topics],
        "sub_questions": [_question_in(sub) for sub in question.sub_questions],
    }


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


def ensure_draft(item: Paper, message: str) -> None:
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
                questions=[question_out(q) for q in section.questions if q.parent is None],
            )
            for section in paper.sections
        ],
    )


def to_admin_paper_detail(paper: Paper) -> AdminPaperDetail:
    """The same tree as to_paper_detail, plus the admin-only fields: who made it, its
    marking scheme versions, and what it was grounded in."""
    detail = to_paper_detail(paper)
    return AdminPaperDetail(
        **detail.model_dump(),
        created_at=paper.created_at,
        published_at=paper.published_at,
        created_by=paper.created_by,
        grounded_in=paper.grounded_in,
        marking_schemes=paper.marking_schemes,
    )


def set_question_topics(db: Session, question_id: int, codes: list[str]) -> Question:
    """Retag one question directly. Topics are metadata, not marked content, so this
    works on a question of any paper status - draft or published."""
    question = db.get(Question, question_id)
    if question is None:
        raise NotFoundError("Question not found")

    known = topics_by_code(db)
    if unknown := sorted(set(codes) - set(known)):
        raise ContentValidationError(
            "Unknown topic code(s)", [f"'{c}' is not a syllabus topic" for c in unknown]
        )

    question.topics = [known[code] for code in codes]
    db.commit()
    return question


def question_out(question: Question) -> QuestionOut:
    return QuestionOut(
        id=question.id,
        label=question.label,
        text=question.text,
        max_marks=question.max_marks,
        options=question.options,
        topics=[topic.code for topic in question.topics],
        sub_questions=[question_out(sub) for sub in question.sub_questions],
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
    section: Section,
    items: list[QuestionIn],
    parent: Question | None,
    topics: dict[str, Topic],
    start_order: int = 0,
) -> None:
    for offset, item in enumerate(items):
        question = Question(
            parent=parent,
            label=item.label,
            text=item.text,
            max_marks=item.max_marks,
            options=[option.model_dump() for option in item.options] if item.options else None,
            order_no=start_order + offset,
            topics=[topics[code] for code in item.topics],
        )
        # SQLAlchemy only saves objects appended to a collection, not ones linked back.
        section.questions.append(question)
        _add_questions(section, item.sub_questions, parent=question, topics=topics)
