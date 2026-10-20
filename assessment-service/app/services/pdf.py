"""Turning PDF pages into images.

Sri Lankan A/L past papers and marking schemes are scanned, so there is no text
inside them. Every page has to be looked at by a vision model instead.
"""

import io
from pathlib import Path

import pypdfium2 as pdfium

from app.ai.vision import Image

PNG = "image/png"
# Scanned A4 at scale 3 is about 1786x2523 (~214 DPI) - small print, subscripts and
# superscripts in chemistry notation need this; scale 2 (~143 DPI) was too soft for
# the vision model to read those reliably.
DEFAULT_SCALE = 3.0


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
