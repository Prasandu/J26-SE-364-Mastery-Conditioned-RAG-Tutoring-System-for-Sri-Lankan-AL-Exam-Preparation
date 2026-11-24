"""Approved-page extraction: allow-list + checksum verification, then pypdf text per physical page.

Fails closed on a missing file, a checksum mismatch or a page outside the approved list.
"""

import hashlib
import json
from pathlib import Path

from app.knowledge.models import KnowledgeConfig, PageConfig, Repair, SourceConfig


class ExtractionError(RuntimeError):
    pass


def load_config(path: Path) -> KnowledgeConfig:
    raw = json.loads(path.read_text(encoding="utf-8"))
    sources = {
        s["sourceId"]: SourceConfig(
            source_id=s["sourceId"],
            filename=s["filename"],
            document_title=s["documentTitle"],
            edition=s["edition"],
            drop_leading_lines=tuple(s["dropLeadingLines"]),
            segment_header=s["segmentHeader"],
        )
        for s in raw["sources"]
    }
    pages = tuple(
        PageConfig(
            source_id=p["sourceId"],
            pdf_page=p["pdfPage"],
            printed_page=p["printedPage"],
            unit=p["unit"],
            section=p["section"],
            experiment_id=p["experimentId"],
            initial_heading=p["initialHeading"],
            headings=tuple(p["headings"]),
            out_of_scope_headings=tuple(p["outOfScopeHeadings"]),
            repairs=tuple(Repair(r["find"], r["replace"], r["note"]) for r in p["repairs"]),
        )
        for p in raw["pages"]
    )
    for page in pages:
        if page.source_id not in sources:
            raise ExtractionError(f"Page references unknown source {page.source_id}")
    return KnowledgeConfig(raw["knowledgeVersion"], raw["extractorVersion"], sources, pages)


def approved_checksums(sources_registry: Path) -> dict[str, tuple[str, str]]:
    """sourceId -> (filename, sha256) from content/sources.v1.json (the recorded approvals)."""
    raw = json.loads(sources_registry.read_text(encoding="utf-8"))
    return {d["sourceId"]: (d["filename"], d["sha256"]) for d in raw["documents"]}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_sources(
    config: KnowledgeConfig, registry: dict[str, tuple[str, str]], pdf_dir: Path
) -> dict[str, str]:
    """Return sourceId -> verified sha256 for every source the config uses."""
    verified: dict[str, str] = {}
    for source_id in sorted({p.source_id for p in config.pages}):
        source = config.sources[source_id]
        if source_id not in registry:
            raise ExtractionError(f"{source_id} is not an approved source")
        filename, expected = registry[source_id]
        if filename != source.filename:
            raise ExtractionError(f"{source_id}: filename differs from the approved registry")
        path = pdf_dir / filename
        if not path.is_file():
            raise ExtractionError(f"{source_id}: approved PDF is missing")
        actual = sha256_file(path)
        if actual != expected:
            raise ExtractionError(f"{source_id}: checksum mismatch")
        verified[source_id] = actual
    return verified


def extract_pages(config: KnowledgeConfig, pdf_dir: Path) -> dict[tuple[str, int], str]:
    """Raw text for exactly the approved (sourceId, pdfPage) pairs, one physical page at a time."""
    from pypdf import PdfReader

    texts: dict[tuple[str, int], str] = {}
    by_source: dict[str, list[PageConfig]] = {}
    for page in config.pages:
        by_source.setdefault(page.source_id, []).append(page)
    for source_id, pages in by_source.items():
        reader = PdfReader(pdf_dir / config.sources[source_id].filename)
        for page in pages:
            if not 1 <= page.pdf_page <= len(reader.pages):
                raise ExtractionError(f"{source_id}: page {page.pdf_page} out of range")
            texts[(source_id, page.pdf_page)] = reader.pages[page.pdf_page - 1].extract_text() or ""
    return texts
