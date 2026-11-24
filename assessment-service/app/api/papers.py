"""Student-facing endpoints: published papers only, and never any answers."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.ai import build_author, build_critic, build_embedding_model
from app.config import Settings, get_settings
from app.db import get_db
from app.models import PaperKind, User, UserRole
from app.schemas.content import PaperDetail, PaperSummary, TopicOut
from app.schemas.generate import GeneratedOut, PracticeIn, PracticeLimitsOut, RatesOut, ShapeOut
from app.schemas.mastery import TopicMasteryOut
from app.security import optional_user, require_role
from app.services import mastery, papers, topics
from app.services.generator import api as generator
from app.services.generator import practice
from app.services.generator.api import plan as plan_shape
from app.services.storage import FileStore, LocalFileStore

router = APIRouter(prefix="/papers", tags=["papers"])


@router.get("", response_model=list[PaperSummary])
def list_papers(
    kind: PaperKind | None = None,
    year: int | None = None,
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_user),
):
    """Published papers, plus this student's own practice papers if signed in."""
    ref = user.email if user else None
    return papers.list_papers(db, kind=kind, year=year, published_only=True, student_ref=ref)


@router.get("/practice/topics", response_model=list[TopicOut])
def practice_topics(db: Session = Depends(get_db)):
    """The syllabus topics a student can choose from."""
    return topics.list_topics(db)


@router.get("/practice/limits", response_model=PracticeLimitsOut)
def practice_limits(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user: User = Depends(require_role(UserRole.STUDENT)),  # noqa: B008
):
    """How many practice papers the signed-in student may still make today."""
    return PracticeLimitsOut(
        per_day=settings.practice_papers_per_day,
        made_today=practice.made_today(db, user.email),
        questions_at_once=settings.practice_questions_at_once,
    )


@router.get("/practice/rates", response_model=RatesOut)
def practice_rates():
    """How long each kind of question takes, so a screen can show the time live."""
    return generator.rates()


@router.get("/practice/mastery", response_model=list[TopicMasteryOut])
def practice_mastery(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.STUDENT)),  # noqa: B008
):
    """The signed-in student's own accuracy per topic, weakest first.

    For the topic picker to point them at what is actually worth practising, instead
    of leaving topic choice a guess - see app/services/mastery.py.
    """
    return mastery.student_mastery(db, user.email)


@router.post("/practice/plan", response_model=ShapeOut)
def plan_practice(data: PracticeIn, db: Session = Depends(get_db)):
    """What the practice paper would look like. Nothing is written."""
    return plan_shape(db, _as_generate(data))


@router.post("/practice", response_model=GeneratedOut, status_code=status.HTTP_201_CREATED)
def make_practice(
    data: PracticeIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user: User = Depends(require_role(UserRole.STUDENT)),  # noqa: B008
):
    """Make a practice paper for the signed-in student and open it straight away.

    A machine writes the questions and the marking scheme, and nobody checks the
    chemistry before the student sits it. The screen says so.
    """
    data.student_ref = user.email
    author = build_author(settings)
    if author is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "No AI model is configured. Set a key in .env."
        )
    return practice.make_practice_paper(
        db, data, author, settings, build_critic(settings), build_embedding_model(settings)
    )


@router.get("/{paper_id}", response_model=PaperDetail)
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    """One published paper with its sections and question tree."""
    return papers.to_paper_detail(papers.get_paper(db, paper_id, published_only=True))


def get_paper_store(settings: Settings = Depends(get_settings)) -> FileStore:
    return LocalFileStore(settings.papers_dir)


@router.get("/{paper_id}/file")
def get_paper_file(
    paper_id: int, db: Session = Depends(get_db), store: FileStore = Depends(get_paper_store)
):
    """The original PDF for a past paper, shown to the student directly instead of
    a transcription. 404 if this paper has none (a model paper, or a past paper
    imported before this existed)."""
    paper = papers.get_paper(db, paper_id, published_only=True)
    if paper.file_key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This paper has no stored PDF")
    return Response(content=store.load(paper.file_key), media_type="application/pdf")


def _as_generate(data: PracticeIn):
    from app.schemas.generate import GenerateIn

    return GenerateIn(title=data.title, topic_codes=data.topic_codes, counts=data.counts)
