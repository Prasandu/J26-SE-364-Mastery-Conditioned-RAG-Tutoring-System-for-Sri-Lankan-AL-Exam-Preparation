"""Shapes for reading a scanned PDF into a draft an admin reviews before creating
anything, and for turning the reviewed draft into a real paper or scheme - see
app/api/extract.py."""

from pydantic import BaseModel, ConfigDict, Field

from app.models import AnswerMode, PaperKind, SchemeSource
from app.schemas.admin import Code, Title


class FailedPageOut(BaseModel):
    pages: list[int]
    error: str  # logged in full server-side too; this one is shown to the admin


class ExtractResultOut(BaseModel):
    model: str
    page_count: int  # pages in the uploaded PDF, so a bad --pages range is easy to spot
    pages_read: list[int]
    notes: list[str]  # anything the model flagged for a person to check
    # Where the points read off a question do not add up to the total the scheme
    # printed for it - the page's own checksum catching marks that were missed
    # (see app/services/drafts.py's _mark_totals).
    short_reads: list[str] = []
    failed: list[FailedPageOut]
    # ExtractedPaper or ExtractedSchemePage (app/services/extractor.py), as a plain
    # dict: the admin edits this freely in the browser before it becomes a real
    # paper or scheme, so it is not worth a stricter shape here.
    extracted: dict


class PaperFromExtractionIn(BaseModel):
    """The reviewed extraction, plus the metadata only a person can supply (a
    scanned page never says its own section title or how many marks each question
    is worth). Built into a single-section PaperIn by
    app.services.drafts.paper_section_from_extraction - the same per-question
    transform the CLI's multi-file plan pipeline uses."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    questions: list[dict] = Field(min_length=1, description="extracted.questions, as reviewed")
    title: Title
    kind: PaperKind
    year: int | None = Field(default=None, ge=1950, le=2100)
    subject: str = Field(default="chemistry", min_length=1, max_length=50)
    section_code: Code = Field(examples=["I", "II-A"])
    section_title: Title
    answer_mode: AnswerMode
    choose_count: int | None = Field(default=None, gt=0)
    instructions: str | None = None
    marks_each: float | None = Field(default=None, gt=0)


class SchemeFromExtractionIn(BaseModel):
    """The reviewed extraction, plus what only a person decides (official vs
    teacher-written, and the marks per MCQ if there was an answer key)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    questions: list[dict] = Field(default_factory=list, description="extracted.questions, as reviewed")
    mcq_answers: list[dict] = Field(default_factory=list, description="extracted.mcq_answers, as reviewed")
    section_code: Code = Field(examples=["I", "II-A"])
    mcq_marks: float | None = Field(default=None, gt=0)
    source: SchemeSource
    notes: str | None = None


class AppendPaperQuestionsFromExtractionIn(BaseModel):
    """More reviewed questions (from a later OCR session) for a section that
    already exists - e.g. resuming an import after a daily AI quota resets. The
    section's own answer_mode and other settings are read from the paper itself,
    not resent, so they can never drift from what was already saved."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    questions: list[dict] = Field(min_length=1, description="extracted.questions, as reviewed")
    marks_each: float | None = Field(default=None, gt=0)


class AppendSchemeQuestionsFromExtractionIn(BaseModel):
    """More reviewed scheme entries (from a later OCR session) for a scheme
    version that already exists - the scheme-side half of resuming an import
    after a daily AI quota resets."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    questions: list[dict] = Field(default_factory=list, description="extracted.questions, as reviewed")
    mcq_answers: list[dict] = Field(default_factory=list, description="extracted.mcq_answers, as reviewed")
    section_code: Code = Field(examples=["I", "II-A"])
    mcq_marks: float | None = Field(default=None, gt=0)
