import hashlib
import re
from dataclasses import dataclass, field

import fitz  # PyMuPDF

# Matches pages like "G. C. E. (A/L) CHEMISTRY: Unit 3" -> unit = "3"
UNIT_HEADER_RE = re.compile(r"CHEMISTRY:\s*Unit\s*(\d+)", re.IGNORECASE)

# Matches numbered section headings like "1.1.5 Atomic number, isotopes..."
SECTION_HEADER_RE = re.compile(r"^(\d+\.\d+(?:\.\d+)?)\s+(.+)$", re.MULTILINE)

# Private-use-area codepoints: PDFs sometimes embed symbol fonts (for
# formulas/equations) that PyMuPDF decodes into these. They render as boxes
# in normal text, so pages containing them get flagged for manual review.
PRIVATE_USE_RE = re.compile(r"[-]")


@dataclass
class ExtractedPage:
    page_number: int  # 1-indexed PDF page index
    unit: str | None
    section: str | None
    text: str
    warnings: list[str] = field(default_factory=list)


def compute_checksum(file_path: str) -> str:
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def extract_pages(file_path: str, start_page: int = 1, end_page: int | None = None) -> list[ExtractedPage]:
    """Extract text per page, tracking the current unit/section as we go.

    Unit and section headers persist across pages until a new one is found,
    since a section can span multiple PDF pages.
    """
    doc = fitz.open(file_path)
    total_pages = doc.page_count
    end_page = min(end_page or total_pages, total_pages)

    pages: list[ExtractedPage] = []
    current_unit: str | None = None
    current_section: str | None = None

    for i in range(start_page - 1, end_page):
        text = doc[i].get_text()
        warnings: list[str] = []

        unit_match = UNIT_HEADER_RE.search(text)
        if unit_match:
            current_unit = unit_match.group(1)

        section_matches = list(SECTION_HEADER_RE.finditer(text))
        if section_matches:
            current_section = section_matches[-1].group(2).strip()

        if PRIVATE_USE_RE.search(text):
            warnings.append(
                "page contains embedded symbol-font characters "
                "(likely equations/formulas) that may not extract correctly"
            )

        if not text.strip():
            warnings.append("page has no extractable text (possibly image-only)")

        pages.append(
            ExtractedPage(
                page_number=i + 1,
                unit=current_unit,
                section=current_section,
                text=text,
                warnings=warnings,
            )
        )

    doc.close()
    return pages
