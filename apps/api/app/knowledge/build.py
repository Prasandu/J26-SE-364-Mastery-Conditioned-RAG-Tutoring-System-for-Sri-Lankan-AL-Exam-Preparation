"""End-to-end knowledge build: verify -> extract -> normalise -> chunk -> embed -> write.

Outputs (private, gitignored): <out>/<knowledgeVersion>/chunks.jsonl with text and embeddings.
Committed: a metadata-only manifest (no text, no vectors).
"""

import dataclasses
import hashlib
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.knowledge.chunker import chunk_page
from app.knowledge.extract import approved_checksums, extract_pages, load_config, verify_sources
from app.knowledge.models import KnowledgeChunk, KnowledgeConfig
from app.knowledge.normalize import normalize_page
from app.rag.embeddings import EMBEDDING_DIMENSION, EmbeddingProvider

#: Regression anchors: facts that must survive extraction in in-scope chunks.
REQUIRED_ANCHORS = {
    "Na₂CO₃": "Na₂CO₃",
    "26.5 g": "26.5 g",
    "250 cm³": "250 cm³",
    "1 mol dm⁻³": "1 mol dm⁻³",
    "transfer": "transferred to the flask using a funnel",
    "rinsing": "Wash the watch glass with distilled water",
    "complete dissolution": "complete dissolving of all the solute",
    "final mixing": "further mixing is done to homogenize",
}


class RegressionError(RuntimeError):
    pass


def chunk_corpus(
    config: KnowledgeConfig,
    raw_pages: dict[tuple[str, int], str],
    document_sha: dict[str, str],
    count_tokens: Callable[[str], int],
) -> list[KnowledgeChunk]:
    chunks: list[KnowledgeChunk] = []
    for page in config.pages:
        source = config.sources[page.source_id]
        lines = normalize_page(raw_pages[(page.source_id, page.pdf_page)], source, page)
        chunks.extend(
            chunk_page(
                lines,
                source,
                page,
                document_sha256=document_sha[page.source_id],
                knowledge_version=config.knowledge_version,
                extractor_version=config.extractor_version,
                count_tokens=count_tokens,
            )
        )
    ids = [c.chunk_id for c in chunks]
    if len(ids) != len(set(ids)):
        raise RegressionError("duplicate chunk IDs")
    return chunks


def check_anchors(chunks: list[KnowledgeChunk]) -> dict[str, str]:
    """Every anchor must appear in an in-scope chunk; returns anchor -> chunkId."""
    found: dict[str, str] = {}
    for name, phrase in REQUIRED_ANCHORS.items():
        hit = next((c for c in chunks if c.in_scope and phrase in c.text), None)
        if hit is None:
            raise RegressionError(f"regression anchor missing after extraction: {name}")
        found[name] = hit.chunk_id
    return found


def embed_chunks(chunks: list[KnowledgeChunk], provider: EmbeddingProvider) -> list[KnowledgeChunk]:
    vectors = provider.embed_passages([c.text for c in chunks])
    if any(len(v) != EMBEDDING_DIMENSION for v in vectors):
        raise RegressionError("embedding dimension mismatch")
    return [
        dataclasses.replace(
            c, embedding=v, embedding_model=provider.model_id, model_revision=provider.revision
        )
        for c, v in zip(chunks, vectors, strict=True)
    ]


def chunk_record(c: KnowledgeChunk) -> dict[str, Any]:
    return {
        **c.metadata(),
        "knowledgeVersion": c.knowledge_version,
        "text": c.text,
        "embeddingModel": c.embedding_model,
        "modelRevision": c.model_revision,
        "embedding": list(c.embedding) if c.embedding else None,
    }


def write_outputs(
    chunks: list[KnowledgeChunk],
    config: KnowledgeConfig,
    provider: EmbeddingProvider,
    out_dir: Path,
    manifest: Path,
) -> dict[str, Any]:
    target = out_dir / config.knowledge_version
    target.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(chunk_record(c), ensure_ascii=False, sort_keys=True) for c in chunks]
    body = ("\n".join(lines) + "\n").encode("utf-8")
    (target / "chunks.jsonl").write_bytes(body)
    by_page: dict[str, int] = {}
    for c in chunks:
        key = f"{c.source_id} p{c.pdf_page} (printed {c.printed_page})"
        by_page[key] = by_page.get(key, 0) + 1
    data = {
        "schemaVersion": 1,
        "knowledgeVersion": config.knowledge_version,
        "extractorVersion": config.extractor_version,
        "embeddingModel": provider.model_id,
        "modelRevision": provider.revision,
        "dimension": EMBEDDING_DIMENSION,
        "chunkCount": len(chunks),
        "inScopeChunkCount": sum(1 for c in chunks if c.in_scope),
        "chunksFileSha256": hashlib.sha256(body).hexdigest(),
        "chunksByPage": by_page,
        "chunks": [c.metadata() for c in chunks],
    }
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return data


def build_knowledge(
    repo_root: Path, pdf_dir: Path, out_dir: Path, manifest: Path, provider: EmbeddingProvider
) -> dict[str, Any]:
    config = load_config(repo_root / "content" / "knowledge" / "approved-pages.v1.json")
    registry = approved_checksums(repo_root / "content" / "sources.v1.json")
    document_sha = verify_sources(config, registry, pdf_dir)
    raw = extract_pages(config, pdf_dir)
    chunks = chunk_corpus(config, raw, document_sha, provider.count_tokens)
    check_anchors(chunks)
    return write_outputs(embed_chunks(chunks, provider), config, provider, out_dir, manifest)
