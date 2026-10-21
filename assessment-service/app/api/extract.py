"""Admin endpoint: read a scanned past paper or marking scheme page range into a
draft a person reviews and corrects before anything is created.

Nothing here writes to the database. The same reading as app/import_pdf.py's CLI
pipeline, returned to the browser instead of written to a file - that CLI remains
the better tool for a large, multi-file import (many sections, resumable across
days against a daily quota); this is the one-PDF-at-a-time path for the admin UI.
"""

import logging
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.ai import build_classifier, build_vision_model_with_fallback
from app.ai.vision import VisionModel
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import ContentValidationError
from app.models import MarkingScheme
from app.schemas.admin import MarkingSchemeIn, PaperIn, QuestionIn, QuestionSchemeIn
from app.schemas.content import AdminPaperDetail, MarkingSchemeOut
from app.schemas.extract import (
    AppendPaperQuestionsFromExtractionIn,
    AppendSchemeQuestionsFromExtractionIn,
    ExtractResultOut,
    FailedPageOut,
    PaperFromExtractionIn,
    SchemeFromExtractionIn,
)
from app.security import require_admin
from app.services import papers, schemes, topics_classify
from app.services.drafts import clean_label, paper_section_from_extraction, scheme_from_extraction
from app.services.extractor import READ_ERRORS, ContentExtractor
from app.services.pdf import page_count, parse_pages, render_pages

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/extract", tags=["extract"], dependencies=[Depends(require_admin)])

BATCH_SIZE = 2  # more pages in one request means less context per page - matches app/import_pdf.py
MAX_UPLOAD_MB = 40  # scanned page images add up; matches resources' own ceiling


@router.post("", response_model=ExtractResultOut)
async def extract(
    file: UploadFile = File(description="The scanned PDF"),
    pages: str = Form(description='Page numbers to read, e.g. "2-5" or "1,3,5"'),
    kind: Literal["paper", "scheme"] = Form(...),
    hint: str | None = Form(default=None, max_length=300, description="e.g. a subject or year"),
    settings: Settings = Depends(get_settings),
):
    model = build_vision_model_with_fallback(settings)
    if model is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "No vision model is configured. Set a key in .env."
        )
    pdf_bytes = await _read_upload(file)
    try:
        page_numbers = parse_pages(pages)
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error)) from None

    # delete=False: the with block closes the handle before pdfium opens the same
    # path, then the file is removed in the finally below. On Windows a second
    # handle can't open a file NamedTemporaryFile is still holding open for
    # writing, which pdfium reports as "File access error".
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        path = Path(tmp.name)
    try:
        total_pages = page_count(path)
        out_of_range = [n for n in page_numbers if not 1 <= n <= total_pages]
        if out_of_range:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"This PDF has {total_pages} pages; asked for {out_of_range}",
            )
        pages_read, notes, failed, extracted = _read_all(model, kind, path, page_numbers, hint)
    finally:
        path.unlink(missing_ok=True)

    return ExtractResultOut(
        model=model.name,
        page_count=total_pages,
        pages_read=pages_read,
        notes=notes,
        failed=failed,
        extracted=extracted,
    )


@router.post("/papers", response_model=AdminPaperDetail, status_code=status.HTTP_201_CREATED)
def create_paper_from_extraction(data: PaperFromExtractionIn, db: Session = Depends(get_db)):
    """Turn a reviewed extraction into a real draft paper, one section.

    Reuses app.services.drafts.paper_section_from_extraction - the exact same
    per-question transform the CLI's plan-based pipeline uses - then the same
    papers.create_paper every other way of creating a paper goes through. A paper
    with more than one section still needs the CLI's plan file for now.
    """
    section = paper_section_from_extraction(
        data.questions,
        code=data.section_code,
        title=data.section_title,
        answer_mode=data.answer_mode,
        choose_count=data.choose_count,
        instructions=data.instructions,
        marks_each=data.marks_each,
    )
    try:
        body = PaperIn.model_validate(
            {
                "title": data.title,
                "kind": data.kind,
                "year": data.year,
                "subject": data.subject,
                "sections": [section],
            }
        )
    except ValidationError as error:
        raise ContentValidationError("The paper has problems", _messages(error)) from error
    return papers.to_admin_paper_detail(papers.create_paper(db, body))


@router.post(
    "/papers/{paper_id}/marking-schemes", response_model=MarkingSchemeOut, status_code=status.HTTP_201_CREATED
)
def create_scheme_from_extraction(
    paper_id: int,
    data: SchemeFromExtractionIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Turn a reviewed scheme extraction into the next draft version, the same way
    create_paper_from_extraction does for a paper - see its docstring."""
    _ensure_mcq_skeletons(db, paper_id, data)
    _ensure_structured_skeletons(db, paper_id, data)
    try:
        body = MarkingSchemeIn.model_validate(
            scheme_from_extraction(
                data.questions,
                data.mcq_answers,
                section_code=data.section_code,
                mcq_marks=data.mcq_marks,
                source=data.source,
                notes=data.notes,
            )
        )
    except ValidationError as error:
        raise ContentValidationError("The marking scheme has problems", _messages(error)) from error
    scheme = schemes.create_scheme(db, paper_id, body)
    _auto_classify(db, settings, scheme)
    return schemes.to_scheme_out(scheme)


@router.post(
    "/papers/{paper_id}/sections/{section_code}/questions",
    response_model=AdminPaperDetail,
)
def append_paper_questions_from_extraction(
    paper_id: int,
    section_code: str,
    data: AppendPaperQuestionsFromExtractionIn,
    db: Session = Depends(get_db),
):
    """Add more reviewed questions (from a later OCR session) to an existing
    draft section - the paper-side half of resuming an import after a daily AI
    quota resets. The section's answer_mode is read from the paper itself, so a
    later session can never send one that disagrees with what is already there.
    """
    paper = papers.get_paper(db, paper_id)
    section = next((s for s in paper.sections if s.code == section_code), None)
    if section is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"This paper has no section '{section_code}'")

    built = paper_section_from_extraction(
        data.questions,
        code=section_code,
        title=section.title,
        answer_mode=section.answer_mode,
        marks_each=data.marks_each,
    )
    try:
        questions = [QuestionIn.model_validate(q) for q in built["questions"]]
    except ValidationError as error:
        raise ContentValidationError("The questions have problems", _messages(error)) from error
    return papers.to_admin_paper_detail(papers.append_questions(db, paper_id, section_code, questions))


@router.post(
    "/papers/{paper_id}/marking-schemes/{version}/questions",
    response_model=MarkingSchemeOut,
)
def append_scheme_questions_from_extraction(
    paper_id: int,
    version: int,
    data: AppendSchemeQuestionsFromExtractionIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Add more reviewed scheme entries (from a later OCR session) to an existing
    editable scheme version - the scheme-side half of resuming an import after a
    daily AI quota resets. See append_paper_questions_from_extraction above."""
    _ensure_mcq_skeletons(db, paper_id, data)
    _ensure_structured_skeletons(db, paper_id, data)
    built = scheme_from_extraction(
        data.questions,
        data.mcq_answers,
        section_code=data.section_code,
        mcq_marks=data.mcq_marks,
    )
    try:
        entries = [QuestionSchemeIn.model_validate(q) for q in built["questions"]]
    except ValidationError as error:
        raise ContentValidationError("The marking scheme has problems", _messages(error)) from error
    scheme = schemes.append_to_scheme(db, paper_id, version, entries)
    _auto_classify(db, settings, scheme)
    return schemes.to_scheme_out(scheme)


def _auto_classify(db: Session, settings: Settings, scheme: MarkingScheme) -> None:
    """Suggest topics for every question this scheme just gave real content to -
    so importing a scheme is also when topic tagging happens, instead of a separate
    manual pass afterward (see topics_classify.classify_questions). Best-effort: no
    classifier configured, or the call failing, never breaks the scheme import
    itself - topic suggestion is a convenience on top of it, not part of it.
    """
    classifier = build_classifier(settings)
    if classifier is None:
        return
    question_ids = sorted({point.question_id for point in scheme.points})
    if not question_ids:
        return
    try:
        topics_classify.classify_questions(db, classifier, question_ids)
    except Exception:
        logger.exception("Auto topic classification failed for scheme %s", scheme.id)


def _ensure_mcq_skeletons(
    db: Session, paper_id: int, data: SchemeFromExtractionIn | AppendSchemeQuestionsFromExtractionIn
) -> None:
    """A past paper's questions are typed in by hand (see PastPaperShellIn), but an
    MCQ answer key already names every question it covers - so importing one
    auto-creates whichever of those labels aren't already in the paper, instead of
    making the admin type in 50 bare question rows first just to satisfy the
    marking scheme's own validation."""
    labels = [clean_label(answer["question"]) for answer in data.mcq_answers]
    if labels:
        papers.ensure_mcq_question_skeletons(db, paper_id, data.section_code, labels, data.mcq_marks)


def _ensure_structured_skeletons(
    db: Session, paper_id: int, data: SchemeFromExtractionIn | AppendSchemeQuestionsFromExtractionIn
) -> None:
    """The structured/essay equivalent of _ensure_mcq_skeletons: a scheme question
    like "1(b)(iii)" needs that exact Question row (and its parents "1", "1(b)") to
    already exist, so this creates whichever of those a reviewed scheme names that
    are not already in the paper - its marks are the sum of its own points' marks,
    matching how the scheme itself splits "04 marks x 8" into eight points."""
    marks_by_label = {
        clean_label(question["question"]): sum(
            point.get("marks") or 0 for point in question.get("points") or []
        )
        for question in data.questions
    }
    if marks_by_label:
        papers.ensure_structured_question_skeletons(db, paper_id, data.section_code, marks_by_label)


def _messages(error: ValidationError) -> list[str]:
    return [f"{'.'.join(str(part) for part in issue['loc'])}: {issue['msg']}" for issue in error.errors()]


def _read_all(
    model: VisionModel, kind: str, path: Path, page_numbers: list[int], hint: str | None
) -> tuple[list[int], list[str], list[FailedPageOut], dict]:
    extractor = ContentExtractor(model)
    read = extractor.read_paper if kind == "paper" else extractor.read_scheme
    merged: dict = {"questions": [], "notes": []}
    if kind == "scheme":
        merged["mcq_answers"] = []
        merged["mcq_marks"] = None

    pages_read: list[int] = []
    failed: list[FailedPageOut] = []
    for batch in _batches(page_numbers, BATCH_SIZE):
        images = render_pages(path, batch)
        try:
            result = read(images, hint)
        except READ_ERRORS as error:
            failed.append(FailedPageOut(pages=batch, error=str(error)))
            continue
        pages_read.extend(batch)
        data = result.model_dump()
        merged["questions"].extend(data["questions"])
        merged["notes"].extend(data["notes"])
        if kind == "scheme":
            merged["mcq_answers"].extend(data["mcq_answers"])
            if merged["mcq_marks"] is None:
                merged["mcq_marks"] = data.get("mcq_marks")

    notes = merged.pop("notes")
    return pages_read, notes, failed, merged


def _batches(pages: list[int], size: int) -> list[list[int]]:
    return [pages[i : i + size] for i in range(0, len(pages), size)]


async def _read_upload(file: UploadFile) -> bytes:
    limit = MAX_UPLOAD_MB * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"The PDF must be under {MAX_UPLOAD_MB} MB")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty")
    return data
