"""Knowledge-base records. Chunk text is private derived research data: server-side only."""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class SourceConfig:
    source_id: str
    filename: str
    document_title: str
    edition: str
    drop_leading_lines: tuple[str, ...]
    segment_header: str | None


@dataclass(frozen=True)
class Repair:
    find: str
    replace: str
    note: str


@dataclass(frozen=True)
class PageConfig:
    source_id: str
    pdf_page: int
    printed_page: int
    unit: str
    section: str
    experiment_id: str | None
    initial_heading: str | None
    headings: tuple[str, ...]
    out_of_scope_headings: tuple[str, ...]
    repairs: tuple[Repair, ...]


@dataclass(frozen=True)
class KnowledgeConfig:
    knowledge_version: str
    extractor_version: str
    sources: dict[str, SourceConfig]
    pages: tuple[PageConfig, ...]


@dataclass(frozen=True)
class KnowledgeChunk:
    chunk_id: str
    knowledge_version: str
    source_id: str
    document_title: str
    edition: str
    document_sha256: str
    pdf_page: int
    printed_page: int
    unit: str
    section: str
    heading: str
    headings: tuple[str, ...]
    language: str
    experiment_id: str | None
    in_scope: bool
    ordinal: int
    text: str
    text_sha256: str
    token_count: int
    extractor_version: str
    embedding_model: str | None = None
    model_revision: str | None = None
    embedding: tuple[float, ...] | None = field(default=None, repr=False)

    def metadata(self) -> dict[str, Any]:
        """Metadata only (no text, no embedding): safe for the committed manifest."""
        return {
            "chunkId": self.chunk_id,
            "sourceId": self.source_id,
            "documentTitle": self.document_title,
            "edition": self.edition,
            "documentSha256": self.document_sha256,
            "pdfPage": self.pdf_page,
            "printedPage": self.printed_page,
            "unit": self.unit,
            "section": self.section,
            "heading": self.heading,
            "headings": list(self.headings),
            "language": self.language,
            "experimentId": self.experiment_id,
            "inScope": self.in_scope,
            "ordinal": self.ordinal,
            "textSha256": self.text_sha256,
            "tokenCount": self.token_count,
            "extractorVersion": self.extractor_version,
        }
