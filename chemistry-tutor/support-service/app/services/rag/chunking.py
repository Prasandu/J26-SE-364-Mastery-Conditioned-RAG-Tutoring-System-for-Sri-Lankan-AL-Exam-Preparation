from dataclasses import dataclass

from app.services.rag.extraction import ExtractedPage

# Word counts approximate token counts closely enough for chunk sizing here.
CHUNK_SIZE_WORDS = 500
OVERLAP_WORDS = 80


@dataclass
class Chunk:
    unit: str | None
    section: str | None
    page_number: int
    content: str
    has_warning: bool


def chunk_pages(pages: list[ExtractedPage]) -> list[Chunk]:
    """Turn extracted pages into overlapping word-count chunks.

    Each page is chunked on its own (not merged across pages) so the page
    number stays accurate for citations. A page's own paragraphs are kept
    together where possible by chunking on whitespace-split words with a
    sliding window.
    """
    chunks: list[Chunk] = []

    for page in pages:
        words = page.text.split()
        if not words:
            continue

        start = 0
        while start < len(words):
            end = min(start + CHUNK_SIZE_WORDS, len(words))
            content = " ".join(words[start:end])
            chunks.append(
                Chunk(
                    unit=page.unit,
                    section=page.section,
                    page_number=page.page_number,
                    content=content,
                    has_warning=bool(page.warnings),
                )
            )
            if end == len(words):
                break
            start = end - OVERLAP_WORDS

    return chunks
