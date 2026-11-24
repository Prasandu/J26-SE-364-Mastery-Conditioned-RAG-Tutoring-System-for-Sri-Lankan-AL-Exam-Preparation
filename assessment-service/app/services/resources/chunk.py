"""Splitting page text into retrievable passages, without breaking a paragraph.

A worked chemistry example or an equation's explanation is one paragraph in the
source PDF (a blank line is how both a resource book and pypdfium2's extraction mark
the end of one). Chunking at paragraph boundaries, never inside one, is what keeps
that together - a fixed-size sliding window would cut an equation away from the
sentence explaining it just as readily as from anything else.

A heading is detected the same way the syllabus parser already does for the NIE PDF:
a short line that is not itself a sentence. It is attached to the next chunk, not
emitted on its own, since a heading alone is not a passage worth retrieving.
"""

import re
from dataclasses import dataclass

from app.services.resources.extract import PageText

# A chunk this size holds a paragraph or two: enough context for a question to be
# grounded in, small enough that a passage stays about one idea.
TARGET_CHARS = 1200
MAX_CHARS = 1800
# A paragraph longer than this (rare: a long derivation, a dense explanation) is
# split by sentence, the only place left to split without landing mid-equation -
# a chemistry equation is written on its own line, never inside a sentence.
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")

_HEADING = re.compile(r"^(?:\d+(?:\.\d+)*\s+)?[A-Z][A-Za-z0-9 ,'()/-]{2,70}$")
_SENTENCE_PUNCTUATION = re.compile(r"[.!?]\s*$")


@dataclass(frozen=True)
class ChunkDraft:
    page_number: int
    heading: str | None
    text: str


def chunk_pages(pages: list[PageText]) -> list[ChunkDraft]:
    """Every chunk of every usable page, in reading order."""
    chunks: list[ChunkDraft] = []
    for page in pages:
        if not page.text:
            continue
        chunks.extend(_chunk_page(page))
    return chunks


def _chunk_page(page: PageText) -> list[ChunkDraft]:
    heading: str | None = None
    buffer: list[str] = []
    chunks: list[ChunkDraft] = []

    def flush() -> None:
        if buffer:
            chunks.append(ChunkDraft(page.number, heading, "\n\n".join(buffer).strip()))
            buffer.clear()

    for paragraph in _paragraphs(page.text):
        if _looks_like_heading(paragraph):
            flush()  # a new heading starts a new passage
            heading = paragraph
            continue

        for piece in _split_oversized(paragraph):
            buffer.append(piece)
            if sum(len(b) for b in buffer) >= TARGET_CHARS:
                flush()

    flush()
    return chunks


def _paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]


def _looks_like_heading(paragraph: str) -> bool:
    """A short, title-like line with no sentence punctuation - not a line of prose."""
    if "\n" in paragraph or len(paragraph) > 70:
        return False
    if _SENTENCE_PUNCTUATION.search(paragraph):
        return False
    return bool(_HEADING.match(paragraph))


def _split_oversized(paragraph: str) -> list[str]:
    """A paragraph within budget stays whole. One far over budget is split by
    sentence - equations are their own line within a paragraph, so this never
    cuts one open."""
    if len(paragraph) <= MAX_CHARS:
        return [paragraph]

    pieces: list[str] = []
    buffer = ""
    for sentence in _SENTENCE_END.split(paragraph):
        # +1 for the joining space the else branch below would add.
        if buffer and len(buffer) + len(sentence) + 1 > MAX_CHARS:
            pieces.append(buffer.strip())
            buffer = sentence
        else:
            buffer = f"{buffer} {sentence}".strip()
    if buffer:
        pieces.append(buffer.strip())
    return pieces
