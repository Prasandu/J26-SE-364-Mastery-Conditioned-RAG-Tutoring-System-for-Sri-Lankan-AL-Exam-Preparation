"""Turning PDF pages into images.

Sri Lankan A/L past papers and marking schemes are scanned, so there is no text
inside them. Every page has to be looked at by a vision model instead.
"""

import io
from pathlib import Path

import pypdfium2 as pdfium

from app.ai.vision import Image

PNG = "image/png"
JPEG = "image/jpeg"
# Scanned A4 at scale 3 is about 1786x2523 (~214 DPI) - small print, subscripts and
# superscripts in chemistry notation need this; scale 2 (~143 DPI) was too soft for
# the vision model to read those reliably.
DEFAULT_SCALE = 3.0
# For topic classification only (app/services/topics_classify.py): the model just
# has to spot a question and judge its subject, not transcribe small print, and a
# batch call can cover a whole paper's worth of pages at once - a lower-resolution
# JPEG keeps that one request well under a provider's body-size limit (seen
# failing at ~21MB with the PNGs DEFAULT_SCALE produces for a many-page paper).
CLASSIFY_SCALE = 1.5
JPEG_QUALITY = 70


def page_count(path: Path) -> int:
    pdf = pdfium.PdfDocument(path)
    try:
        return len(pdf)
    finally:
        pdf.close()


def page_count_bytes(data: bytes) -> int:
    """Same as page_count, for a PDF already in memory (e.g. an upload) - avoids
    writing a temp file just to count pages."""
    pdf = pdfium.PdfDocument(data)
    try:
        return len(pdf)
    finally:
        pdf.close()


def render_pages(path: Path, pages: list[int], scale: float = DEFAULT_SCALE) -> list[Image]:
    """Render the given 1-based page numbers to PNG images."""
    pdf = pdfium.PdfDocument(path)
    try:
        last = len(pdf)
        out_of_range = [n for n in pages if not 1 <= n <= last]
        if out_of_range:
            raise ValueError(f"This PDF has {last} pages; asked for {out_of_range}")
        return [Image(_render(pdf, number, scale), PNG) for number in pages]
    finally:
        pdf.close()


def render_pages_for_classification(path: Path, pages: list[int]) -> list[Image]:
    """Same as render_pages, but smaller: a lower scale and JPEG instead of PNG, for
    a vision call that only needs to locate a question and judge its topic, not
    read small print - see CLASSIFY_SCALE."""
    pdf = pdfium.PdfDocument(path)
    try:
        last = len(pdf)
        out_of_range = [n for n in pages if not 1 <= n <= last]
        if out_of_range:
            raise ValueError(f"This PDF has {last} pages; asked for {out_of_range}")
        return [Image(_render_jpeg(pdf, number, CLASSIFY_SCALE), JPEG) for number in pages]
    finally:
        pdf.close()


def parse_pages(text: str) -> list[int]:
    """Read a page list like "2-5,8" into [2, 3, 4, 5, 8]."""
    pages: list[int] = []
    for part in text.split(","):
        start, dash, end = part.strip().partition("-")
        if dash and not end:
            raise ValueError(f"'{part.strip()}' has no last page")
        first, last = int(start), int(end or start)
        if first > last:
            raise ValueError(f"'{part.strip()}' counts backwards")
        pages.extend(range(first, last + 1))
    return pages


def _render(pdf: pdfium.PdfDocument, number: int, scale: float) -> bytes:
    buffer = io.BytesIO()
    pdf[number - 1].render(scale=scale).to_pil().save(buffer, format="PNG")
    return buffer.getvalue()


def _render_jpeg(pdf: pdfium.PdfDocument, number: int, scale: float) -> bytes:
    buffer = io.BytesIO()
    # JPEG needs RGB - pdfium's render gives RGBA (a page has no transparency to lose).
    image = pdf[number - 1].render(scale=scale).to_pil().convert("RGB")
    image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buffer.getvalue()
