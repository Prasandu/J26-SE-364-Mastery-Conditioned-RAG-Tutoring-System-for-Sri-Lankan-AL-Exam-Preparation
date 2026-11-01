"""Admin knowledge feed: approved practical drafts -> chunks -> local embeddings -> a new,
immutable knowledge version (staged, then explicitly activated; rollback = activate another).

* Chunks are built from the human-reviewed draft fields, not from raw OCR-like page text, so
  the knowledge base only contains approved content. Each chunk cites the PDF page recorded
  for its field.
* A new version carries the currently active chunks forward unchanged (same IDs, same vectors)
  and adds the new practicals. A draft that is rebuilt replaces its own earlier chunks.
* Duplicates are removed twice: exact (same text checksum) and by vector similarity (cosine
  >= NEAR_DUPLICATE_COSINE to a chunk already in the version).
* After ingest, a retrieval self-check asks each new practical's title and checks that one of
  its own chunks is among the top results.
* Embeddings come only from the configured local provider; nothing is sent to an external model.
"""

import dataclasses
import hashlib
import json
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.knowledge.build import chunk_record
from app.knowledge.chunker import ChunkingError, chunk_page
from app.knowledge.models import KnowledgeChunk, PageConfig, SourceConfig
from app.knowledge_runtime import ACTIVE_POINTER, KnowledgeRuntime
from app.rag.embeddings import EMBEDDING_DIMENSION
from app.rag.repository import KnowledgeVersion

FEED_VERSION = "admin-feed-1.0.0"
NEAR_DUPLICATE_COSINE = 0.98
CHECK_TOP_K = 4
FIELD_LABELS = {
    "aims": "Aims",
    "apparatus": "Apparatus",
    "chemicals": "Chemicals",
    "precautions": "Precautions",
    "procedure": "Procedure",
    "observations": "Observations",
    "calculations": "Calculations",
    "preLabQuestions": "Pre-lab questions",
    "postLabQuestions": "Post-lab questions",
}


class FeedError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def draft_experiment_id(draft_id: str) -> str:
    return f"draft_{draft_id}"


def draft_chunks(
    draft: dict[str, Any], knowledge_version: str, count_tokens: Any
) -> list[KnowledgeChunk]:
    content = draft["content"]
    provenance = draft["provenance"]
    sha = provenance["sourceSha256"]
    number = content["experimentNumber"]
    title = content["title"] or "Untitled practical"
    label = f"Experiment {number}: {title}" if number else title
    source = SourceConfig(
        source_id=f"upload-{sha[:12]}",
        filename=provenance["documentName"],
        document_title=provenance["documentName"],
        edition=f"admin upload {draft['createdAt'][:10]}",
        drop_leading_lines=(),
        segment_header=None,
    )
    chunks: list[KnowledgeChunk] = []
    for field, field_label in FIELD_LABELS.items():
        items = content.get(field) or []
        pages = draft["sourcePages"].get(field) or []
        if not items or not pages:
            continue
        heading = f"{label}: {field_label}"
        numbered = field == "procedure"
        lines = [heading] + [
            f"{i}. {item}" if numbered else f"• {item}" for i, item in enumerate(items, start=1)
        ]
        page = PageConfig(
            source_id=source.source_id,
            pdf_page=pages[0],
            printed_page=pages[0],
            unit=content["syllabusUnit"] or "Unit not stated",
            section=label,
            experiment_id=draft_experiment_id(draft["id"]),
            initial_heading=heading,
            headings=(heading,),
            out_of_scope_headings=(),
            repairs=(),
        )
        try:
            chunks.extend(
                chunk_page(
                    lines,
                    source,
                    page,
                    document_sha256=sha,
                    knowledge_version=knowledge_version,
                    extractor_version=FEED_VERSION,
                    count_tokens=count_tokens,
                )
            )
        except ChunkingError as exc:
            raise FeedError("chunking_failed", f"{label} / {field_label}: {exc}") from exc
    return chunks


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))  # unit vectors


def build_version(
    runtime: KnowledgeRuntime, drafts: list[dict[str, Any]], now: datetime | None = None
) -> tuple[KnowledgeVersion, dict[str, Any]]:
    repo, embeddings = runtime.repository, runtime.embeddings
    if repo is None or embeddings is None:
        raise FeedError(
            "knowledge_unavailable",
            "No embedding provider is configured (LAB_EMBEDDING_PROVIDER).",
        )
    active = repo.active()
    if active and (active.embedding_model, active.model_revision) != (
        embeddings.model_id,
        embeddings.revision,
    ):
        raise FeedError(
            "embedding_model_mismatch",
            "The active knowledge version was embedded with a different model.",
        )
    stamp = (now or datetime.now(UTC)).strftime("%Y%m%d%H%M%S")
    draft_ids = sorted(d["id"] for d in drafts)
    version_id = f"kb-admin-{stamp}-{hashlib.sha256(''.join(draft_ids).encode()).hexdigest()[:8]}"
    rebuilt = {draft_experiment_id(d["id"]) for d in drafts}
    carried = [
        dataclasses.replace(c, knowledge_version=version_id)
        for c in (repo.chunks(active.knowledge_version) if active else [])
        if c.experiment_id not in rebuilt
    ]
    seen_text = {c.text_sha256 for c in carried}
    fresh: list[KnowledgeChunk] = []
    skipped_exact = 0
    for draft in drafts:
        for chunk in draft_chunks(draft, version_id, embeddings.count_tokens):
            if chunk.text_sha256 in seen_text:
                skipped_exact += 1
                continue
            seen_text.add(chunk.text_sha256)
            fresh.append(chunk)
    vectors = embeddings.embed_passages([c.text for c in fresh]) if fresh else []
    if any(len(v) != EMBEDDING_DIMENSION for v in vectors):
        raise FeedError("embedding_failed", "Embedding dimension mismatch.")
    accepted: list[KnowledgeChunk] = []
    skipped_near = 0
    pool = [c.embedding for c in carried if c.embedding]
    for chunk, vector in zip(fresh, vectors, strict=True):
        if any(_cosine(vector, other) >= NEAR_DUPLICATE_COSINE for other in pool):
            skipped_near += 1
            continue
        pool.append(vector)
        accepted.append(
            dataclasses.replace(
                chunk,
                embedding=tuple(vector),
                embedding_model=embeddings.model_id,
                model_revision=embeddings.revision,
            )
        )
    chunks = carried + accepted
    if not chunks:
        raise FeedError("nothing_to_build", "The selected drafts produced no knowledge chunks.")
    digest = hashlib.sha256(
        "\n".join(sorted(f"{c.chunk_id}:{c.text_sha256}" for c in chunks)).encode()
    ).hexdigest()
    version = KnowledgeVersion(
        knowledge_version=version_id,
        embedding_model=embeddings.model_id,
        model_revision=embeddings.revision,
        dimension=EMBEDDING_DIMENSION,
        chunk_count=len(chunks),
        manifest_sha256=digest,
    )
    repo.ingest(version, chunks)
    if runtime.persist_dir is not None:
        persist_version(runtime.persist_dir, version, chunks)
    checks = []
    for draft in drafts:
        query = draft["content"]["title"] or ""
        hits = repo.vector_search(version_id, embeddings.embed_queries([query])[0], CHECK_TOP_K)
        own = draft_experiment_id(draft["id"])
        checks.append(
            {
                "draftId": draft["id"],
                "query": query,
                "hit": any(c.experiment_id == own for c, _ in hits),
            }
        )
    report = {
        "knowledgeVersion": version_id,
        "baseVersion": active.knowledge_version if active else None,
        "draftIds": draft_ids,
        "chunkCount": len(chunks),
        "carriedChunks": len(carried),
        "newChunks": len(accepted),
        "skippedExact": skipped_exact,
        "skippedNear": skipped_near,
        "embeddingModel": embeddings.model_id,
        "modelRevision": embeddings.revision,
        "checks": checks,
        "checkPassed": all(c["hit"] for c in checks),
    }
    return version, report


def persist_version(folder: Path, version: KnowledgeVersion, chunks: list[KnowledgeChunk]) -> None:
    """Memory mode: keep admin-built versions across restarts (private, gitignored)."""
    target = folder / version.knowledge_version
    target.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(chunk_record(c), ensure_ascii=False, sort_keys=True) for c in chunks]
    (target / "chunks.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (target / "version.json").write_text(
        json.dumps(dataclasses.asdict(version), indent=1) + "\n", encoding="utf-8"
    )


def activate(runtime: KnowledgeRuntime, knowledge_version: str) -> None:
    if runtime.repository is None:
        raise FeedError("knowledge_unavailable", "No knowledge repository is configured.")
    runtime.repository.set_active(knowledge_version)
    if runtime.persist_dir is not None:
        runtime.persist_dir.mkdir(parents=True, exist_ok=True)
        (runtime.persist_dir / ACTIVE_POINTER).write_text(
            json.dumps({"active": knowledge_version}) + "\n", encoding="utf-8"
        )
