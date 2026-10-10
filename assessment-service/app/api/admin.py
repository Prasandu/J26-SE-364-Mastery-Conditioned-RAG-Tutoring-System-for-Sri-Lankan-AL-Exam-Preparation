"""Admin endpoints: manage topics, papers and versioned marking schemes (FR11), retry AI marking.

Every route needs the X-Admin-Key header (see app/security.py).
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_judge
from app.config import Settings, get_settings
from app.db import get_db
from app.models import PaperKind
from app.schemas.admin import MarkingSchemeIn, PaperIn, TopicIn
from app.schemas.attempts import AttemptOut
from app.schemas.content import AdminPaperSummary, MarkingSchemeOut, PaperDetail, SchemeSummary, TopicOut
from app.security import require_admin
from app.services import attempts, papers, schemes, topics
from app.services.judge import AnswerJudge

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

SCHEME_PATH = "/papers/{paper_id}/marking-schemes/{version}"


# Topics


@router.get("/topics", response_model=list[TopicOut])
def list_topics(db: Session = Depends(get_db)):
    return topics.list_topics(db)


@router.post("/topics", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
def create_topic(data: TopicIn, db: Session = Depends(get_db)):
    return topics.create_topic(db, data)


# Papers


@router.get("/papers", response_model=list[AdminPaperSummary])
def list_papers(kind: PaperKind | None = None, year: int | None = None, db: Session = Depends(get_db)):
    """All papers, drafts included, with their marking scheme versions."""
    return papers.list_papers(db, kind=kind, year=year)


@router.post("/papers", response_model=PaperDetail, status_code=status.HTTP_201_CREATED)
def create_paper(data: PaperIn, db: Session = Depends(get_db)):
    """Create a draft paper with all its sections and questions."""
    return papers.to_paper_detail(papers.create_paper(db, data))


@router.get("/papers/{paper_id}", response_model=PaperDetail)
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    return papers.to_paper_detail(papers.get_paper(db, paper_id))


@router.put("/papers/{paper_id}", response_model=PaperDetail)
def replace_paper(paper_id: int, data: PaperIn, db: Session = Depends(get_db)):
    """Replace a draft paper. Not allowed once it has marking schemes or is published."""
    return papers.to_paper_detail(papers.replace_paper(db, paper_id, data))


@router.delete("/papers/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_paper(paper_id: int, db: Session = Depends(get_db)) -> None:
    papers.delete_paper(db, paper_id)


@router.post("/papers/{paper_id}/publish", response_model=PaperDetail)
def publish_paper(paper_id: int, db: Session = Depends(get_db)):
    """Make the paper visible to students. Needs a published marking scheme."""
    return papers.to_paper_detail(papers.publish_paper(db, paper_id))


# Marking schemes


@router.get("/papers/{paper_id}/marking-schemes", response_model=list[SchemeSummary])
def list_schemes(paper_id: int, db: Session = Depends(get_db)):
    return papers.get_paper(db, paper_id).marking_schemes


@router.post(
    "/papers/{paper_id}/marking-schemes", response_model=MarkingSchemeOut, status_code=status.HTTP_201_CREATED
)
def create_scheme(paper_id: int, data: MarkingSchemeIn, db: Session = Depends(get_db)):
    """Create the next version as a draft."""
    return schemes.to_scheme_out(schemes.create_scheme(db, paper_id, data))


@router.get(SCHEME_PATH, response_model=MarkingSchemeOut)
def get_scheme(paper_id: int, version: int, db: Session = Depends(get_db)):
    return schemes.to_scheme_out(schemes.get_scheme(db, paper_id, version))


@router.put(SCHEME_PATH, response_model=MarkingSchemeOut)
def replace_scheme(paper_id: int, version: int, data: MarkingSchemeIn, db: Session = Depends(get_db)):
    """Replace a draft version's content."""
    return schemes.to_scheme_out(schemes.replace_scheme(db, paper_id, version, data))


@router.delete(SCHEME_PATH, status_code=status.HTTP_204_NO_CONTENT)
def delete_scheme(paper_id: int, version: int, db: Session = Depends(get_db)) -> None:
    schemes.delete_scheme(db, paper_id, version)


@router.post(SCHEME_PATH + "/copy", response_model=MarkingSchemeOut, status_code=status.HTTP_201_CREATED)
def copy_scheme(paper_id: int, version: int, db: Session = Depends(get_db)):
    """Copy any version into a new draft version (the way to correct a published scheme)."""
    return schemes.to_scheme_out(schemes.copy_scheme(db, paper_id, version))


@router.post(SCHEME_PATH + "/publish", response_model=MarkingSchemeOut)
def publish_scheme(paper_id: int, version: int, db: Session = Depends(get_db)):
    """Lock this version. Checks that every question's points add up to its marks."""
    return schemes.to_scheme_out(schemes.publish_scheme(db, paper_id, version))


# Attempts


@router.post("/attempts/{attempt_id}/judge", response_model=AttemptOut)
def judge_attempt(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    judge: AnswerJudge | None = Depends(get_judge),
    settings: Settings = Depends(get_settings),
):
    """Run the AI judge now for every still-pending point (e.g. after a network or quota failure)."""
    if judge is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "AI judge is switched off. Set GEMINI_API_KEY."
        )
    return attempts.to_attempt_out(attempts.judge_pending(db, attempt_id, judge, settings.ai_min_confidence))
