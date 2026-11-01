"""Knowledge repository boundary (server-side only; chunk text never reaches a client).

* Ingestion is idempotent: the same chunk for the same knowledge version and embedding model is
  stored once.
* Older knowledge versions are never deleted automatically; one version is explicitly active.
* Vector search is exact cosine similarity (no approximate index in M1).
"""

import dataclasses
import json
import threading
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from app.knowledge.models import KnowledgeChunk
from app.rag.embeddings import EMBEDDING_DIMENSION, Vector


class KnowledgeUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class KnowledgeVersion:
    knowledge_version: str
    embedding_model: str
    model_revision: str
    dimension: int
    chunk_count: int
    manifest_sha256: str


class KnowledgeRepository(Protocol):
    def ingest(self, version: KnowledgeVersion, chunks: Sequence[KnowledgeChunk]) -> int: ...
    def set_active(self, knowledge_version: str) -> None: ...
    def active(self) -> KnowledgeVersion | None: ...
    def chunks(self, knowledge_version: str) -> list[KnowledgeChunk]: ...
    def vector_search(
        self, knowledge_version: str, query: Vector, limit: int
    ) -> list[tuple[KnowledgeChunk, float]]: ...


def _validate(version: KnowledgeVersion, chunks: Sequence[KnowledgeChunk]) -> None:
    if version.dimension != EMBEDDING_DIMENSION:
        raise KnowledgeUnavailable("knowledge version has the wrong embedding dimension")
    for c in chunks:
        if c.knowledge_version != version.knowledge_version:
            raise KnowledgeUnavailable("chunk belongs to a different knowledge version")
        if c.embedding is None or len(c.embedding) != EMBEDDING_DIMENSION:
            raise KnowledgeUnavailable("chunk embedding missing or wrong dimension")
        if c.embedding_model != version.embedding_model:
            raise KnowledgeUnavailable("chunk embedded with a different model")


class InMemoryKnowledgeRepository:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._versions: dict[str, KnowledgeVersion] = {}
        self._chunks: dict[str, dict[tuple[str, str], KnowledgeChunk]] = {}
        self._active: str | None = None

    def ingest(self, version: KnowledgeVersion, chunks: Sequence[KnowledgeChunk]) -> int:
        _validate(version, chunks)
        with self._lock:
            self._versions.setdefault(version.knowledge_version, version)
            store = self._chunks.setdefault(version.knowledge_version, {})
            inserted = 0
            for c in chunks:
                key = (c.chunk_id, c.embedding_model or "")
                if key not in store:
                    store[key] = c
                    inserted += 1
            return inserted

    def set_active(self, knowledge_version: str) -> None:
        with self._lock:
            if knowledge_version not in self._versions:
                raise KnowledgeUnavailable("unknown knowledge version")
            self._active = knowledge_version

    def active(self) -> KnowledgeVersion | None:
        with self._lock:
            return self._versions.get(self._active) if self._active else None

    def chunks(self, knowledge_version: str) -> list[KnowledgeChunk]:
        with self._lock:
            store = self._chunks.get(knowledge_version, {})
            return sorted(store.values(), key=lambda c: (c.source_id, c.pdf_page, c.ordinal))

    def vector_search(
        self, knowledge_version: str, query: Vector, limit: int
    ) -> list[tuple[KnowledgeChunk, float]]:
        scored = [
            (c, sum(a * b for a, b in zip(query, c.embedding or (), strict=True)))
            for c in self.chunks(knowledge_version)
            if c.in_scope
        ]
        # Exact cosine (vectors are unit length); ties broken by stable chunk identity.
        scored.sort(key=lambda pair: (-pair[1], pair[0].chunk_id))
        return scored[:limit]


def chunk_from_record(record: dict[str, Any]) -> KnowledgeChunk:
    return KnowledgeChunk(
        chunk_id=record["chunkId"],
        knowledge_version=record["knowledgeVersion"],
        source_id=record["sourceId"],
        document_title=record["documentTitle"],
        edition=record["edition"],
        document_sha256=record["documentSha256"],
        pdf_page=record["pdfPage"],
        printed_page=record["printedPage"],
        unit=record["unit"],
        section=record["section"],
        heading=record["heading"],
        headings=tuple(record["headings"]),
        language=record["language"],
        experiment_id=record["experimentId"],
        in_scope=record["inScope"],
        ordinal=record["ordinal"],
        text=record["text"],
        text_sha256=record["textSha256"],
        token_count=record["tokenCount"],
        extractor_version=record["extractorVersion"],
        embedding_model=record["embeddingModel"],
        model_revision=record["modelRevision"],
        embedding=tuple(record["embedding"]) if record.get("embedding") else None,
    )


def load_knowledge_files(
    manifest_path: Path, data_dir: Path
) -> tuple[KnowledgeVersion, list[KnowledgeChunk]]:
    """Load the committed manifest and the matching private chunk file; fail closed on mismatch."""
    import hashlib

    if not manifest_path.is_file():
        raise KnowledgeUnavailable("knowledge manifest missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    path = data_dir / manifest["knowledgeVersion"] / "chunks.jsonl"
    if not path.is_file():
        raise KnowledgeUnavailable("knowledge data missing")
    body = path.read_bytes()
    if hashlib.sha256(body).hexdigest() != manifest["chunksFileSha256"]:
        raise KnowledgeUnavailable("knowledge data does not match the manifest")
    chunks = [
        chunk_from_record(json.loads(line)) for line in body.decode("utf-8").splitlines() if line
    ]
    version = KnowledgeVersion(
        knowledge_version=manifest["knowledgeVersion"],
        embedding_model=manifest["embeddingModel"],
        model_revision=manifest["modelRevision"],
        dimension=manifest["dimension"],
        chunk_count=manifest["chunkCount"],
        manifest_sha256=hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
    )
    return version, chunks


class PostgresKnowledgeRepository:
    """pgvector implementation. Access is server-side only (RLS has no client policies)."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def _connect(self) -> Any:
        import psycopg
        from pgvector.psycopg import register_vector

        conn = psycopg.connect(self._dsn, autocommit=False)
        conn.execute("set search_path = public, extensions")  # pgvector lives in `extensions`
        register_vector(conn)
        return conn

    def ingest(self, version: KnowledgeVersion, chunks: Sequence[KnowledgeChunk]) -> int:
        _validate(version, chunks)
        from pgvector import Vector as PgVector

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                "insert into public.knowledge_versions (knowledge_version, embedding_model,"
                " model_revision, dimension, chunk_count, manifest_sha256)"
                " values (%s, %s, %s, %s, %s, %s)"
                " on conflict (knowledge_version) do nothing",
                (
                    version.knowledge_version,
                    version.embedding_model,
                    version.model_revision,
                    version.dimension,
                    version.chunk_count,
                    version.manifest_sha256,
                ),
            )
            inserted = 0
            for c in chunks:
                cur.execute(
                    f"insert into public.knowledge_chunks ({self._COLUMNS})"  # noqa: S608
                    f" values ({', '.join(['%s'] * len(self._COLUMN_NAMES))})"
                    " on conflict (chunk_id, knowledge_version, embedding_model) do nothing",
                    (
                        c.chunk_id,
                        c.knowledge_version,
                        c.source_id,
                        c.document_title,
                        c.edition,
                        c.document_sha256,
                        c.pdf_page,
                        c.printed_page,
                        c.unit,
                        c.section,
                        c.heading,
                        list(c.headings),
                        c.language,
                        c.experiment_id,
                        c.in_scope,
                        c.ordinal,
                        c.text,
                        c.text_sha256,
                        c.token_count,
                        c.extractor_version,
                        c.embedding_model,
                        c.model_revision,
                        PgVector(list(c.embedding or ())),
                    ),
                )
                inserted += cur.rowcount
            conn.commit()
            return inserted

    def set_active(self, knowledge_version: str) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("update public.knowledge_versions set is_active = false where is_active")
            cur.execute(
                "update public.knowledge_versions set is_active = true"
                " where knowledge_version = %s",
                (knowledge_version,),
            )
            if cur.rowcount != 1:
                conn.rollback()
                raise KnowledgeUnavailable("unknown knowledge version")
            conn.commit()

    def active(self) -> KnowledgeVersion | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                "select knowledge_version, embedding_model, model_revision, dimension, chunk_count,"
                " manifest_sha256 from public.knowledge_versions where is_active"
            )
            row = cur.fetchone()
            return KnowledgeVersion(*row) if row else None

    _COLUMN_NAMES = (
        "chunk_id", "knowledge_version", "source_id", "document_title", "edition",
        "document_sha256", "pdf_page", "printed_page", "unit", "section", "heading", "headings",
        "language", "experiment_id", "in_scope", "ordinal", "content", "text_sha256",
        "token_count", "extractor_version", "embedding_model", "model_revision", "embedding",
    )  # fmt: skip
    _COLUMNS = ", ".join(_COLUMN_NAMES)

    @staticmethod
    def _row(row: Sequence[Any]) -> KnowledgeChunk:
        values = dict(zip(PostgresKnowledgeRepository._COLUMN_NAMES, row, strict=True))
        raw = values.pop("embedding")
        vector = tuple(float(x) for x in (raw.to_list() if hasattr(raw, "to_list") else raw))
        values["headings"] = tuple(values["headings"])
        values["text"] = values.pop("content")
        return KnowledgeChunk(**values, embedding=vector)

    def chunks(self, knowledge_version: str) -> list[KnowledgeChunk]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                f"select {self._COLUMNS} from public.knowledge_chunks where knowledge_version = %s"  # noqa: S608
                " order by source_id, pdf_page, ordinal",
                (knowledge_version,),
            )
            return [self._row(r) for r in cur.fetchall()]

    def vector_search(
        self, knowledge_version: str, query: Vector, limit: int
    ) -> list[tuple[KnowledgeChunk, float]]:
        from pgvector import Vector as PgVector

        with self._connect() as conn, conn.cursor() as cur:
            q = PgVector(list(query))
            cur.execute(
                f"select {self._COLUMNS}, 1 - (embedding <=> %s) as score"  # noqa: S608
                " from public.knowledge_chunks"
                " where knowledge_version = %s and in_scope"
                " order by embedding <=> %s, chunk_id limit %s",
                (q, knowledge_version, q, limit),
            )
            return [(self._row(r[:-1]), float(r[-1])) for r in cur.fetchall()]


def with_embedding(
    chunk: KnowledgeChunk, vector: Vector, model: str, revision: str
) -> KnowledgeChunk:
    return dataclasses.replace(
        chunk, embedding=vector, embedding_model=model, model_revision=revision
    )
