"""Knowledge-base runtime shared by the assistant (retrieval) and the admin knowledge feed.

* memory (default): the committed manifest + private chunk file are loaded at startup; versions
  built by the admin feed are persisted privately under ``<admin_data_dir>/knowledge/`` and
  reloaded, together with the admin's active-version pointer.
* postgres: pgvector tables (``knowledge_versions`` / ``knowledge_chunks``); the database holds
  the active flag.

Missing data never crashes the API: the assistant then answers "unavailable" (503) as before.
"""

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from app.rag.embeddings import EmbeddingProvider, build_embedding_provider
from app.rag.repository import (
    InMemoryKnowledgeRepository,
    KnowledgeRepository,
    KnowledgeUnavailable,
    KnowledgeVersion,
    PostgresKnowledgeRepository,
    chunk_from_record,
    load_knowledge_files,
)

if TYPE_CHECKING:
    from app.settings import Settings

logger = logging.getLogger("vlab.knowledge")
ACTIVE_POINTER = "active.json"


@dataclass
class KnowledgeRuntime:
    repository: KnowledgeRepository | None
    embeddings: EmbeddingProvider | None
    #: Where admin-built versions are persisted in memory mode (None for postgres).
    persist_dir: Path | None
    #: Version shipped with the committed manifest (the approved NIE pages), if loaded.
    base_version: str | None

    @property
    def available(self) -> bool:
        return self.repository is not None and self.embeddings is not None


def _manifest_revision(path: Path) -> str | None:
    try:
        return str(json.loads(path.read_text(encoding="utf-8"))["modelRevision"])
    except (OSError, ValueError, KeyError):
        return None


def load_persisted(repository: KnowledgeRepository, folder: Path) -> list[str]:
    """Reload admin-built versions (memory mode) and apply the admin's active pointer."""
    loaded: list[str] = []
    if not folder.is_dir():
        return loaded
    for meta_path in sorted(folder.glob("*/version.json")):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            version = KnowledgeVersion(**meta)
            lines = (meta_path.parent / "chunks.jsonl").read_text(encoding="utf-8").splitlines()
            chunks = [chunk_from_record(json.loads(line)) for line in lines if line]
            repository.ingest(version, chunks)
            loaded.append(version.knowledge_version)
        except (OSError, ValueError, TypeError, KeyError, KnowledgeUnavailable) as exc:
            logger.warning("admin knowledge version not loaded (%s): %s", meta_path.parent, exc)
    pointer = folder / ACTIVE_POINTER
    if pointer.is_file():
        try:
            repository.set_active(json.loads(pointer.read_text(encoding="utf-8"))["active"])
        except (OSError, ValueError, KeyError, KnowledgeUnavailable) as exc:
            logger.warning("admin knowledge pointer ignored: %s", exc)
    return loaded


def build_knowledge_runtime(settings: "Settings") -> KnowledgeRuntime:
    if settings.embedding_provider == "disabled":
        return KnowledgeRuntime(None, None, None, None)
    revision = settings.embedding_revision or _manifest_revision(settings.knowledge_manifest)
    embeddings = build_embedding_provider(
        settings.embedding_provider, settings.embedding_model, revision
    )
    if settings.knowledge_repository == "postgres" and settings.database_url:
        repo = PostgresKnowledgeRepository(settings.database_url.get_secret_value())
        return KnowledgeRuntime(repo, embeddings, None, None)
    memory = InMemoryKnowledgeRepository()
    base: str | None = None
    try:
        version, chunks = load_knowledge_files(
            settings.knowledge_manifest, settings.knowledge_data_dir
        )
        memory.ingest(version, chunks)
        memory.set_active(version.knowledge_version)
        base = version.knowledge_version
    except KnowledgeUnavailable as exc:
        logger.warning("base knowledge not loaded: %s", exc)
    persist = settings.admin_data_dir / "knowledge"
    load_persisted(memory, persist)
    return KnowledgeRuntime(memory, embeddings, persist, base)
