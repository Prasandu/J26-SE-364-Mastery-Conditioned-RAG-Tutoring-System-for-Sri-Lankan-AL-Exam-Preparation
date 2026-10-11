"""Student-facing endpoints: published papers only, and never any answers."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai import build_author
from app.config import Settings, get_settings
from app.db import get_db
from app.models import PaperKind
from app.schemas.content import PaperDetail, PaperSummary, TopicOut
from app.schemas.generate import GeneratedOut, PracticeIn, PracticeLimitsOut, RatesOut, ShapeOut
from app.services import papers, topics
from app.services.generator import api as generator
from app.services.generator import practice
from app.services.generator.api import plan as plan_shape

router = APIRouter(prefix="/papers", tags=["papers"])


@router.get("", response_model=list[PaperSummary])
def list_papers(
    kind: PaperKind | None = None,
    year: int | None = None,
    student_ref: str | None = None,
    db: Session = Depends(get_db),
):
    """Published papers, plus this student's own practice papers if a ref is given."""
    return papers.list_papers(db, kind=kind, year=year, published_only=True, student_ref=student_ref)


@router.get("/practice/topics", response_model=list[TopicOut])
def practice_topics(db: Session = Depends(get_db)):
    """The syllabus topics a student can choose from."""
    return topics.list_topics(db)


@router.get("/practice/limits", response_model=PracticeLimitsOut)
def practice_limits(
    student_ref: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """How many practice papers this student may still make today."""
    return PracticeLimitsOut(
        per_day=settings.practice_papers_per_day,
        made_today=practice.made_today(db, student_ref),
        questions_at_once=settings.practice_questions_at_once,
    )


@router.get("/practice/rates", response_model=RatesOut)
def practice_rates():
    """How long each kind of question takes, so a screen can show the time live."""
    return generator.rates()


@router.post("/practice/plan", response_model=ShapeOut)
def plan_practice(data: PracticeIn, db: Session = Depends(get_db)):
    """What the practice paper would look like. Nothing is written."""
    return plan_shape(db, _as_generate(data))


@router.post("/practice", response_model=GeneratedOut, status_code=status.HTTP_201_CREATED)
def make_practice(
    data: PracticeIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Make a practice paper for one student and open it for them straight away.

    A machine writes the questions and the marking scheme, and nobody checks the
    chemistry before the student sits it. The screen says so.
    """
    author = build_author(settings)
    if author is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "No AI model is configured. Set a key in .env."
        )
    return practice.make_practice_paper(db, data, author, settings)


@router.delete("/practice/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_practice(paper_id: int, student_ref: str, db: Session = Depends(get_db)):
    """Throw away one of your own practice papers, if you have not answered it."""
    practice.delete_practice_paper(db, paper_id, student_ref)


@router.get("/{paper_id}", response_model=PaperDetail)
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    """One published paper with its sections and question tree."""
    return papers.to_paper_detail(papers.get_paper(db, paper_id, published_only=True))


def _as_generate(data: PracticeIn):
    from app.schemas.generate import GenerateIn

    return GenerateIn(title=data.title, topic_codes=data.topic_codes, counts=data.counts)
