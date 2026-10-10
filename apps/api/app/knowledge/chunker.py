"""Section-aware chunking within one physical page.

Blocks are headings, list items (bullets, numbered and lettered steps) and paragraphs. A block is
never split. Chunks normally hold 250–450 model tokens; a section boundary starts a new chunk once
the current chunk has reached the minimum, and a change between in-scope and out-of-scope sections
always does. A short page tail is folded into the previous chunk when the result still fits. Any
passage over the model limit is an error, never a silent truncation.
"""

import hashlib
import re
from collections.abc import Callable
from dataclasses import dataclass

from app.knowledge.models import KnowledgeChunk, PageConfig, SourceConfig
from app.knowledge.normalize import collapse

TARGET_MIN_TOKENS = 250
TARGET_MAX_TOKENS = 450
MODEL_MAX_TOKENS = 512
PASSAGE_PREFIX = "passage: "

_ITEM = re.compile(r"^(•\s|\d+\.\s|[a-e]\.\s|Rule \d+\s)")

TokenCounter = Callable[[str], int]


class ChunkingError(RuntimeError):
    pass


@dataclass
class _Block:
    heading: str
    text: str
    is_heading: bool = False


def _blocks(lines: list[str], page: PageConfig) -> list[_Block]:
    headings = {collapse(h): collapse(h) for h in page.headings}
    current = page.initial_heading or (page.headings[0] if page.headings else page.section)
    blocks: list[_Block] = []
    for line in lines:
        text = collapse(line)
        if text in headings:
            current = headings[text]
            blocks.append(_Block(current, text, is_heading=True))
        elif _ITEM.match(text) or not blocks or blocks[-1].is_heading:
            blocks.append(_Block(current, text))
        else:
            blocks[-1].text = f"{blocks[-1].text} {text}"
    return blocks


def chunk_page(
    lines: list[str],
    source: SourceConfig,
    page: PageConfig,
    *,
    document_sha256: str,
    knowledge_version: str,
    extractor_version: str,
    count_tokens: TokenCounter,
) -> list[KnowledgeChunk]:
    out_of_scope = {collapse(h) for h in page.out_of_scope_headings}
    groups: list[list[_Block]] = []
    current: list[_Block] = []

    def size(blocks: list[_Block]) -> int:
        return count_tokens(PASSAGE_PREFIX + _render(blocks))

    def scope(block: _Block) -> bool:
        return block.heading not in out_of_scope

    for block in _blocks(lines, page):
        if current:
            tentative = current + [block]
            scope_break = scope(block) != scope(current[-1])
            section_break = block.is_heading and size(current) >= TARGET_MIN_TOKENS
            if scope_break or section_break or size(tentative) > TARGET_MAX_TOKENS:
                groups.append(current)
                current = [block]
                continue
            current = tentative
        else:
            current = [block]
    if current:
        groups.append(current)
    if (
        len(groups) >= 2
        and size(groups[-1]) < TARGET_MIN_TOKENS
        and scope(groups[-1][0]) == scope(groups[-2][-1])
    ):
        merged = groups[-2] + groups[-1]
        if size(merged) <= TARGET_MAX_TOKENS:
            groups[-2:] = [merged]

    chunks: list[KnowledgeChunk] = []
    for ordinal, group in enumerate(groups):
        text = _render(group)
        tokens = count_tokens(PASSAGE_PREFIX + text)
        if tokens > MODEL_MAX_TOKENS:
            raise ChunkingError(
                f"{page.source_id} p{page.pdf_page} chunk {ordinal}: "
                f"{tokens} tokens exceeds {MODEL_MAX_TOKENS}"
            )
        headings = tuple(dict.fromkeys(b.heading for b in group))
        text_sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
        identity = f"{page.source_id}|{document_sha256}|{page.pdf_page}|{text_sha}"
        chunks.append(
            KnowledgeChunk(
                chunk_id="kc_" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20],
                knowledge_version=knowledge_version,
                source_id=page.source_id,
                document_title=source.document_title,
                edition=source.edition,
                document_sha256=document_sha256,
                pdf_page=page.pdf_page,
                printed_page=page.printed_page,
                unit=page.unit,
                section=page.section,
                heading=headings[0],
                headings=headings,
                language="en",
                experiment_id=page.experiment_id,
                in_scope=not all(h in out_of_scope for h in headings),
                ordinal=ordinal,
                text=text,
                text_sha256=text_sha,
                token_count=tokens,
                extractor_version=extractor_version,
            )
        )
    return chunks


def _render(blocks: list[_Block]) -> str:
    """Heading context first (so a chunk is self-describing), then each block on its own line."""
    lines: list[str] = []
    if blocks and not blocks[0].is_heading:
        lines.append(blocks[0].heading)
    lines.extend(b.text for b in blocks)
    return "\n".join(lines)
