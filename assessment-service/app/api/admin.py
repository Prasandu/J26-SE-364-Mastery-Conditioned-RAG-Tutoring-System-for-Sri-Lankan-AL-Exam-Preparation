"""Admin endpoints: manage topics, papers and versioned marking schemes (FR11), retry AI marking.

Every route needs a signed-in admin account (see app/security.py).
"""

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai import (
    build_author,
    build_classifier,
    build_critic,
    build_embedding_model,
    build_vision_classifier,
)
from app.ai.author import QuestionAuthor
from app.ai.classify import TopicClassifier
from app.ai.critic import QuestionCritic
from app.ai.judge import AnswerJudge
from app.api.deps import get_drawing_judge, get_file_store, get_judge
from app.config import Settings, get_settings
from app.db import get_db
from app.models import AnswerMode, ContentStatus, PaperKind, SuggestionStatus, User, UserRole
from app.schemas.admin import (
    AppendQuestionsIn,
    AppendSchemeQuestionsIn,
    MarkingSchemeIn,
    PaperIn,
    PastPaperShellIn,
    QuestionTopicsIn,
    TopicIn,
)
from app.schemas.attempts import AttemptOut
from app.schemas.auth import AdminUserCreateIn, AdminUserOut
from app.schemas.content import (
    AdminPaperDetail,
    MarkingSchemeOut,
    PapersPageOut,
    QuestionOut,
    SchemeSummary,
    TopicOut,
)
from app.schemas.generate import (
    GeneratedOut,
    GenerateIn,
    RatesOut,
    SchemeValidationOut,
    ShapeOut,
)
from app.schemas.topics import ClassifyIn, DecideSuggestionIn, TopicSuggestionOut
from app.security import require_admin
from app.services import attempts, auth, export, papers, schemes, topics, topics_classify
from app.services.drawing_judge import DrawingJudge
from app.services.generator import api as generator
from app.services.generator import practice
from app.services.storage import FileStore, LocalFileStore

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

SCHEME_PATH = "/papers/{paper_id}/marking-schemes/{version}"


# Users


@router.post("/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def create_user(data: AdminUserCreateIn, db: Session = Depends(get_db)):
    return auth.create_admin_user(db, data)


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc())).all()


@router.patch("/users/{user_id}/role", response_model=AdminUserOut)
def update_user_role(user_id: int, role: UserRole, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No user with that id")
    if user.role == UserRole.ADMIN and role != UserRole.ADMIN and user.is_active:
        active_admins = db.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
        )
        if active_admins <= 1:
            raise HTTPException(status.HTTP_409_CONFLICT, "The last active admin cannot be demoted")
    user.role = role
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/status", response_model=AdminUserOut)
def update_user_status(user_id: int, is_active: bool, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No user with that id")
    if user.role == UserRole.ADMIN and user.is_active and not is_active:
        active_admins = db.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
        )
        if active_admins <= 1:
            raise HTTPException(status.HTTP_409_CONFLICT, "The last active admin cannot be deactivated")
    user.is_active = is_active
    db.commit()
    db.refresh(user)
    return user


# Topics


@router.delete("/practice-papers/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_practice_paper(paper_id: int, student_ref: str, db: Session = Depends(get_db)):
    """Throw away a student's practice paper that nobody has answered.

    Behind the admin key on purpose. The owner is identified by a student ref the
    caller supplies, and refs are guessable, so as a public route this would let
    anyone delete anyone else's paper. It opens up again once students sign in.
    """
    practice.delete_practice_paper(db, paper_id, student_ref)


@router.get("/topics", response_model=list[TopicOut])
def list_topics(db: Session = Depends(get_db)):
    return topics.list_topics(db)


@router.get("/model-papers/rates", response_model=RatesOut)
def generator_rates():
    """How long each kind of question takes, so a screen can show the time live."""
    return generator.rates()


@router.post("/model-papers/plan", response_model=ShapeOut)
def plan_model_paper(data: GenerateIn, db: Session = Depends(get_db)):
    """What the paper would look like. Nothing is written and no model is called."""
    return generator.plan(db, data)


@router.post("/model-papers", response_model=GeneratedOut, status_code=status.HTTP_201_CREATED)
def generate_model_paper(
    data: GenerateIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Write a model paper from the chosen topics.

    The paper and its marking scheme are saved as drafts. An AI wrote the scheme, and
    the checks only catch structural mistakes, not wrong chemistry, so a person reads
    it and publishes it.
    """
    author: QuestionAuthor | None = build_author(settings)
    if author is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "No AI model is configured. Set a key in .env.",
        )
    critic: QuestionCritic | None = build_critic(settings)
    return generator.write(db, data, author, settings, critic, build_embedding_model(settings))


@router.post("/topics", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
def create_topic(data: TopicIn, db: Session = Depends(get_db)):
    return topics.create_topic(db, data)


# Papers


@router.get("/papers", response_model=PapersPageOut)
def list_papers(
    search: str | None = None,
    kind: PaperKind | None = None,
    year: int | None = None,
    status_: ContentStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=papers.DEFAULT_PAGE_SIZE, ge=1, le=papers.MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
):
    """Every paper, drafts included, searchable by title and paginated."""
    items, total = papers.search_papers(
        db, search=search, kind=kind, year=year, status=status_, page=page, page_size=page_size
    )
    return PapersPageOut(items=items, total=total, page=page, page_size=page_size)


@router.post("/papers", response_model=AdminPaperDetail, status_code=status.HTTP_201_CREATED)
def create_paper(data: PaperIn, db: Session = Depends(get_db)):
    """Create a draft paper with all its sections and questions."""
    return papers.to_admin_paper_detail(papers.create_paper(db, data))


def get_paper_store(settings: Settings = Depends(get_settings)) -> FileStore:
    """Where original past-paper PDFs live - unlike resources, these ARE served to
    students (see GET /papers/{id}/file in app/api/papers.py)."""
    return LocalFileStore(settings.papers_dir)


@router.post("/papers/past", response_model=AdminPaperDetail, status_code=status.HTTP_201_CREATED)
async def create_past_paper(
    title: str = Form(min_length=1, max_length=200),
    year: int = Form(ge=1950, le=2100),
    answer_mode: AnswerMode = Form(...),
    subject: str = Form(default="chemistry", max_length=50),
    file: UploadFile = File(description="The past paper's own PDF"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    store: FileStore = Depends(get_paper_store),
):
    """Create a past paper shown to students as its own PDF, not OCR'd text - with
    no questions yet. Add them afterward, one at a time (see POST
    /papers/{id}/sections/{code}/questions), once the real paper's layout is known.
    Marking schemes are unaffected; they are still imported via OCR (see
    app/api/extract.py)."""
    try:
        data = PastPaperShellIn(title=title, year=year, subject=subject, answer_mode=answer_mode)
    except ValidationError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, error.errors()) from None
    pdf = await _read_upload(file, settings.max_paper_upload_mb)
    return papers.to_admin_paper_detail(papers.create_past_paper_shell(db, data, pdf, store))


async def _read_upload(file: UploadFile, max_mb: float) -> bytes:
    limit = int(max_mb * 1024 * 1024)
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"The PDF must be under {max_mb} MB")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty")
    return data


@router.get("/papers/{paper_id}", response_model=AdminPaperDetail)
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    return papers.to_admin_paper_detail(papers.get_paper(db, paper_id))


@router.put("/papers/{paper_id}", response_model=AdminPaperDetail)
def replace_paper(paper_id: int, data: PaperIn, db: Session = Depends(get_db)):
    """Replace a draft paper. Not allowed once it has marking schemes or is published."""
    return papers.to_admin_paper_detail(papers.replace_paper(db, paper_id, data))


@router.post("/papers/{paper_id}/sections/{section_code}/questions", response_model=AdminPaperDetail)
def append_questions(
    paper_id: int, section_code: str, data: AppendQuestionsIn, db: Session = Depends(get_db)
):
    """Add more questions to an existing draft section, continuing after whatever
    is already there - for resuming an import split across several sessions
    (e.g. a daily AI quota reset) without losing what was already saved."""
    return papers.to_admin_paper_detail(papers.append_questions(db, paper_id, section_code, data.questions))


@router.delete("/papers/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_paper(paper_id: int, db: Session = Depends(get_db)) -> None:
    papers.delete_paper(db, paper_id)


@router.post("/papers/{paper_id}/publish", response_model=AdminPaperDetail)
def publish_paper(paper_id: int, db: Session = Depends(get_db)):
    """Make the paper visible to students. Needs a published marking scheme."""
    return papers.to_admin_paper_detail(papers.publish_paper(db, paper_id))


@router.post("/papers/{paper_id}/copy", response_model=AdminPaperDetail, status_code=status.HTTP_201_CREATED)
def copy_paper(paper_id: int, db: Session = Depends(get_db)):
    """New draft paper with the same sections and questions, ready to be edited -
    the way to correct a published paper (its marking schemes are not copied)."""
    return papers.to_admin_paper_detail(papers.copy_paper(db, paper_id))


@router.patch("/questions/{question_id}/topics", response_model=QuestionOut)
def set_question_topics(question_id: int, data: QuestionTopicsIn, db: Session = Depends(get_db)):
    """Retag one question. Works regardless of its paper's status."""
    return papers.question_out(papers.set_question_topics(db, question_id, data.topics))


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


@router.post(SCHEME_PATH + "/questions", response_model=MarkingSchemeOut)
def append_scheme_questions(
    paper_id: int, version: int, data: AppendSchemeQuestionsIn, db: Session = Depends(get_db)
):
    """Add more question entries to an existing editable scheme version,
    continuing after whatever is already there - the scheme-side half of resuming
    an import split across several sessions (see append_questions, above)."""
    return schemes.to_scheme_out(schemes.append_to_scheme(db, paper_id, version, data.questions))


@router.delete(SCHEME_PATH, status_code=status.HTTP_204_NO_CONTENT)
def delete_scheme(paper_id: int, version: int, db: Session = Depends(get_db)) -> None:
    schemes.delete_scheme(db, paper_id, version)


@router.post(SCHEME_PATH + "/copy", response_model=MarkingSchemeOut, status_code=status.HTTP_201_CREATED)
def copy_scheme(paper_id: int, version: int, db: Session = Depends(get_db)):
    """Copy any version into a new draft version (the way to correct a published scheme)."""
    return schemes.to_scheme_out(schemes.copy_scheme(db, paper_id, version))


@router.post(SCHEME_PATH + "/validate", response_model=SchemeValidationOut)
def validate_scheme(paper_id: int, version: int, db: Session = Depends(get_db)):
    """Run the independent validators and record what they found.

    The scheme becomes validated, or validation_failed if a deterministic check proved
    something wrong. Findings only a teacher can settle are listed and do not fail it.
    """
    scheme, report = schemes.validate_scheme(db, paper_id, version)
    return SchemeValidationOut(
        version=scheme.version,
        status=scheme.status,
        checked_by=report.checks_run,
        not_checked=report.checks_skipped,
        errors=[str(finding) for finding in report.errors],
        needs_teacher=[str(finding) for finding in report.for_teacher],
        notes=[str(finding) for finding in report.notes],
        summary=report.summary(),
    )


@router.post(SCHEME_PATH + "/approve", response_model=MarkingSchemeOut)
def approve_scheme(
    paper_id: int,
    version: int,
    approver: str = Query(min_length=1, max_length=64),
    db: Session = Depends(get_db),
):
    """Sign this scheme off by name. Only a validated scheme can be approved."""
    return schemes.to_scheme_out(schemes.approve_scheme(db, paper_id, version, approver))


@router.post(SCHEME_PATH + "/publish", response_model=MarkingSchemeOut)
def publish_scheme(paper_id: int, version: int, db: Session = Depends(get_db)):
    """Lock this version. Checks that every question's points add up to its marks.

    A generated scheme also has to have been validated first.
    """
    return schemes.to_scheme_out(schemes.publish_scheme(db, paper_id, version))


@router.post(SCHEME_PATH + "/retire", response_model=MarkingSchemeOut)
def retire_scheme(paper_id: int, version: int, db: Session = Depends(get_db)):
    """Withdraw a published scheme. Marks already given still point at it."""
    return schemes.to_scheme_out(schemes.retire_scheme(db, paper_id, version))


# Topic classification


@router.post("/topics/classify", response_model=list[TopicSuggestionOut])
def classify_topics(
    data: ClassifyIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    store: FileStore = Depends(get_paper_store),
):
    """Ask the model to suggest topics for questions that have none.

    A question with no text anywhere - its own, or its marking scheme's (a pure MCQ
    answer key names no subject content at all) - is classified from its own PDF
    page instead, when the paper has one and a vision model is configured.

    Safe to call again: a question that already has a suggestion waiting for review
    is skipped, so an interrupted run can simply be repeated.
    """
    classifier: TopicClassifier | None = build_classifier(settings)
    if classifier is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "No AI model is configured. Set AI_API_KEY in .env."
        )
    vision_classifier = build_vision_classifier(settings)
    return topics_classify.classify_questions(
        db, classifier, data.question_ids, vision_classifier=vision_classifier, store=store
    )


@router.get("/topics/suggestions", response_model=list[TopicSuggestionOut])
def list_suggestions(
    status_: SuggestionStatus | None = Query(default=None, alias="status"),
    question_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return topics_classify.list_suggestions(db, status=status_, question_id=question_id)


@router.post("/topics/suggestions/{suggestion_id}/approve", response_model=TopicSuggestionOut)
def approve_suggestion(suggestion_id: int, data: DecideSuggestionIn, db: Session = Depends(get_db)):
    """Apply the suggestion - or, if codes is given, only the ones a reviewer kept."""
    return topics_classify.approve_suggestion(db, suggestion_id, data.decided_by, data.codes)


@router.post("/topics/suggestions/{suggestion_id}/reject", response_model=TopicSuggestionOut)
def reject_suggestion(suggestion_id: int, data: DecideSuggestionIn, db: Session = Depends(get_db)):
    return topics_classify.reject_suggestion(db, suggestion_id, data.decided_by)


# Exports
#
# Admin-only: a points export carries student refs and teachers' own names, which a
# public or even a teacher-level route must not hand out. See docs/export-columns.md
# for what every column means.


@router.get("/export/points.csv")
def export_points(paper_id: int | None = Query(default=None, ge=1), db: Session = Depends(get_db)):
    return _csv_response("points.csv", export.POINT_COLUMNS, export.point_rows(db, paper_id))


@router.get("/export/attempts.csv")
def export_attempts(paper_id: int | None = Query(default=None, ge=1), db: Session = Depends(get_db)):
    return _csv_response("attempts.csv", export.ATTEMPT_COLUMNS, export.attempt_rows(db, paper_id))


@router.get("/export/summary.csv")
def export_summary(paper_id: int | None = Query(default=None, ge=1), db: Session = Depends(get_db)):
    return _csv_response("summary.csv", export.SUMMARY_COLUMNS, export.summary_rows(db, paper_id))


def _csv_response(filename: str, columns: list[str], rows: list[dict]) -> Response:
    # utf-8-sig: Excel only reads a CSV's Chemistry notation (², ₂, °, etc.) correctly
    # with the UTF-8 byte order mark present. A JSON response never gets one - this
    # encoding is for this one CSV download path only.
    body = export.to_csv(columns, rows).encode("utf-8-sig")
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Attempts


@router.post("/attempts/{attempt_id}/judge", response_model=AttemptOut)
def judge_attempt(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    judge: AnswerJudge | None = Depends(get_judge),
    drawing_judge: DrawingJudge | None = Depends(get_drawing_judge),
    store: FileStore = Depends(get_file_store),
    settings: Settings = Depends(get_settings),
):
    """Run the AI judge now for every still-pending point (e.g. after a network or quota failure)."""
    if judge is None and drawing_judge is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "AI judge is switched off. Set GEMINI_API_KEY."
        )
    return attempts.to_attempt_out(
        attempts.judge_pending(
            db,
            attempt_id,
            judge,
            settings.ai_min_confidence,
            drawing_judge=drawing_judge,
            drawing_min_confidence=settings.ai_min_confidence_drawing,
            store=store,
        )
    )
