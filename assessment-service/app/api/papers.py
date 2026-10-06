from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ContentStatus, MarkingScheme, Paper, PaperKind, Question
from app.schemas import (
    MarkingPointOut,
    MarkingRuleOut,
    MarkingSchemeOut,
    PaperDetail,
    PaperSummary,
    QuestionOut,
    QuestionSchemeOut,
    SectionOut,
)

router = APIRouter(prefix="/papers", tags=["papers"])


@router.get("", response_model=list[PaperSummary])
def list_papers(kind: PaperKind | None = None, year: int | None = None, db: Session = Depends(get_db)):
    """List papers in the library. Filter by kind (past/model) and year."""
    stmt = select(Paper).order_by(Paper.id)
    if kind is not None:
        stmt = stmt.where(Paper.kind == kind)
    if year is not None:
        stmt = stmt.where(Paper.year == year)
    return db.scalars(stmt).all()


@router.get("/{paper_id}", response_model=PaperDetail)
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    """One paper with its sections and full question tree (no answers)."""
    paper = _get_paper_or_404(db, paper_id)
    return PaperDetail(
        **PaperSummary.model_validate(paper).model_dump(),
        sections=[
            SectionOut(
                id=s.id,
                code=s.code,
                title=s.title,
                answer_mode=s.answer_mode,
                choose_count=s.choose_count,
                instructions=s.instructions,
                questions=[_question_out(q) for q in s.questions if q.parent_id is None],
            )
            for s in paper.sections
        ],
    )


@router.get("/{paper_id}/marking-scheme", response_model=MarkingSchemeOut)
def get_marking_scheme(paper_id: int, version: int | None = None, db: Session = Depends(get_db)):
    """Marking scheme of a paper. Without `version`, the latest published one is returned."""
    paper = _get_paper_or_404(db, paper_id)
    scheme = _pick_scheme(paper.marking_schemes, version)
    if scheme is None:
        raise HTTPException(status_code=404, detail="Marking scheme not found")

    model_answers = {a.question_id: a.answer_text for a in scheme.model_answers}
    questions = []
    for q in _questions_in_paper_order(paper):
        points = [p for p in scheme.points if p.question_id == q.id]
        rules = [r for r in scheme.rules if r.question_id == q.id]
        if not points and not rules and q.id not in model_answers:
            continue
        questions.append(
            QuestionSchemeOut(
                question_id=q.id,
                section=q.section.code,
                label=q.full_label,
                max_marks=q.max_marks,
                model_answer=model_answers.get(q.id),
                points=[MarkingPointOut.model_validate(p) for p in points],
                rules=[MarkingRuleOut.model_validate(r) for r in rules],
            )
        )

    return MarkingSchemeOut(
        id=scheme.id,
        paper_id=paper.id,
        version=scheme.version,
        source=scheme.source,
        status=scheme.status,
        notes=scheme.notes,
        questions=questions,
    )


def _get_paper_or_404(db: Session, paper_id: int) -> Paper:
    paper = db.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


def _pick_scheme(schemes: list[MarkingScheme], version: int | None) -> MarkingScheme | None:
    if version is not None:
        return next((s for s in schemes if s.version == version), None)
    published = [s for s in schemes if s.status == ContentStatus.PUBLISHED]
    return published[-1] if published else None  # schemes are ordered by version


def _question_out(q: Question) -> QuestionOut:
    return QuestionOut(
        id=q.id,
        label=q.label,
        text=q.text,
        max_marks=q.max_marks,
        options=q.options,
        topics=[t.code for t in q.topics],
        sub_questions=[_question_out(s) for s in q.sub_questions],
    )


def _questions_in_paper_order(paper: Paper) -> Iterator[Question]:
    def walk(q: Question) -> Iterator[Question]:
        yield q
        for sub in q.sub_questions:
            yield from walk(sub)

    for section in paper.sections:
        for q in section.questions:
            if q.parent_id is None:
                yield from walk(q)
