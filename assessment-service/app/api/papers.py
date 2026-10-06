"""Student-facing endpoints: published papers only, and never any answers."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PaperKind
from app.schemas.content import PaperDetail, PaperSummary
from app.services import papers

router = APIRouter(prefix="/papers", tags=["papers"])


@router.get("", response_model=list[PaperSummary])
def list_papers(kind: PaperKind | None = None, year: int | None = None, db: Session = Depends(get_db)):
    """Published papers. Filter by kind (past/model) and year."""
    return papers.list_papers(db, kind=kind, year=year, published_only=True)


@router.get("/{paper_id}", response_model=PaperDetail)
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    """One published paper with its sections and question tree."""
    return papers.to_paper_detail(papers.get_paper(db, paper_id, published_only=True))
