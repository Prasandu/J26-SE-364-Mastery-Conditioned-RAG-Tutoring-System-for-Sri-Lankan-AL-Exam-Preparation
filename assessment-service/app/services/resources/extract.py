"""Pulling text out of a resource PDF, one page at a time, with a quality label.

Uses the project's existing pypdfium2 integration (already a dependency, already used
for the syllabus PDF and for rendering scanned pages) rather than adding PyMuPDF as a
second PDF library for the same job.

A resource book page is mostly prose, unlike the syllabus PDF's four-column table, so
nothing here needs the syllabus parser's column-reassembly. What it does need is a
quality label per page, because a resource PDF - unlike the syllabus - may include a
scanned diagram page with no text layer at all, and that has to be visible rather than
silently producing an empty, useless chunk.
"""

from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium

from app.models import ExtractionQuality

# Below this many characters, a normal textbook page is almost certainly not one:
# either there is no text layer (scanned) or extraction went wrong (low_text).
EMPTY_BELOW = 1
SCANNED_BELOW = 20
# A typical resource book page holds several hundred characters even when sparse
# (a diagram's caption, a short definition). Below this it is marked thin, not
# rejected - it may still be a short but real page.
LOW_TEXT_BELOW = 120


@dataclass(frozen=True)
class PageText:
    number: int  # 1-based, matches what a citation shows a reader
    text: str
    quality: ExtractionQuality
    char_count: int


def extract_pages(path: Path) -> list[PageText]:
    """Every page of the PDF, with what pypdfium2 could read from it."""
    document = pdfium.PdfDocument(path)
    try:
        pages = []
        for index, page in enumerate(document, start=1):
            raw = page.get_textpage().get_text_range()
            # Same normalisation as the syllabus importer: \r\n hides line ends from
            # any pattern anchored with $, and the chunker below splits on blank lines.
            text = raw.replace("\r\n", "\n").replace("\r", "\n").strip()
            pages.append(PageText(index, text, _quality(text), len(text)))
        return pages
    finally:
        document.close()


def _quality(text: str) -> ExtractionQuality:
    chars = len(text)
    if chars < EMPTY_BELOW:
        return ExtractionQuality.EMPTY
    if chars < SCANNED_BELOW:
        return ExtractionQuality.SCANNED
    if chars < LOW_TEXT_BELOW:
        return ExtractionQuality.LOW_TEXT
    return ExtractionQuality.OK


def page_report(pages: list[PageText]) -> list[dict]:
    """The per-page quality, stored beside the resource so a thin page is visible
    without re-reading the PDF."""
    return [{"page": page.number, "quality": page.quality.value, "chars": page.char_count} for page in pages]
