"""Deterministic hybrid retrieval over the active knowledge version.

1. Exact heading match: a specific (multi-word) section heading quoted in the question.
2. Exact cosine vector search (E5 "query: " embedding) over in-scope chunks.
3. Merge: heading matches first, then vector order; de-duplicated by chunk ID; ties broken by
   chunk ID. At most 8 candidates; at most 4 are passed to generation.

A similarity score is never the sole sufficiency test: sufficiency is decided by the generator
and then checked against the evidence (see generation.py).
"""

import re
import unicodedata
from dataclasses import dataclass

from app.knowledge.models import KnowledgeChunk
from app.rag.embeddings import EmbeddingProvider
from app.rag.repository import KnowledgeRepository, KnowledgeUnavailable

MAX_CANDIDATES = 8
MAX_EVIDENCE = 4

#: Headings that occur in many sections are too generic to count as an exact match.
_GENERIC_HEADINGS = {
    "aims",
    "introduction",
    "procedure",
    "precautions",
    "methods",
    "contents",
    "outcomes",
    "pre lab questions",
    "post lab questions",
}


def normalize_question(text: str) -> str:
    """NFC, case-folded, single-spaced. Used for heading matching and the answer cache key."""
    text = unicodedata.normalize("NFC", text).casefold()
    return re.sub(r"\s+", " ", text).strip()


def _heading_key(heading: str) -> str:
    text = normalize_question(heading)
    text = re.sub(r"^(experiment \d+:|\d+(\.\d+)*)\s*", "", text).rstrip(":")
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text)).strip()


def _words(text: str) -> str:
    return " " + re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text)).strip() + " "


@dataclass(frozen=True)
class Candidate:
    chunk: KnowledgeChunk
    vector_score: float | None
    heading_match: bool


@dataclass(frozen=True)
class Retrieval:
    knowledge_version: str
    candidates: tuple[Candidate, ...]
    evidence: tuple[Candidate, ...]


def heading_matches(question: str, chunks: list[KnowledgeChunk]) -> list[KnowledgeChunk]:
    q = _words(normalize_question(question))
    hits: list[KnowledgeChunk] = []
    for chunk in chunks:
        if not chunk.in_scope:
            continue
        for heading in chunk.headings:
            key = _heading_key(heading)
            if len(key.split()) >= 2 and key not in _GENERIC_HEADINGS and f" {key} " in q:
                hits.append(chunk)
                break
    return hits


class Retriever:
    def __init__(self, repository: KnowledgeRepository, embeddings: EmbeddingProvider) -> None:
        self._repository = repository
        self._embeddings = embeddings

    def config_id(self) -> str:
        """Identifies everything that shapes retrieval (part of the answer cache key)."""
        return (
            f"{self._embeddings.model_id}@{self._embeddings.revision}"
            f"|heading+cosine|candidates={MAX_CANDIDATES}|evidence={MAX_EVIDENCE}"
        )

    def active_version(self) -> str:
        active = self._repository.active()
        if active is None:
            raise KnowledgeUnavailable("no active knowledge version")
        return active.knowledge_version

    def retrieve(self, question: str, *, vector_only: bool = False) -> Retrieval:
        active = self._repository.active()
        if active is None:
            raise KnowledgeUnavailable("no active knowledge version")
        if (active.embedding_model, active.model_revision) != (
            self._embeddings.model_id,
            self._embeddings.revision,
        ):
            raise KnowledgeUnavailable("query embedding model differs from the knowledge base")
        [query] = self._embeddings.embed_queries([question])
        scored = self._repository.vector_search(active.knowledge_version, query, MAX_CANDIDATES)
        scores = {c.chunk_id: s for c, s in scored}

        merged: list[Candidate] = []
        seen: set[str] = set()
        if not vector_only:
            chunks = self._repository.chunks(active.knowledge_version)
            heading_hits = heading_matches(question, chunks)
            # Heading matches without a vector score rank after scored ones, then by chunk ID.
            heading_hits.sort(key=lambda c: (-scores.get(c.chunk_id, -2.0), c.chunk_id))
            for chunk in heading_hits:
                merged.append(Candidate(chunk, scores.get(chunk.chunk_id), True))
                seen.add(chunk.chunk_id)
        for chunk, score in scored:
            if chunk.chunk_id not in seen:
                merged.append(Candidate(chunk, score, False))
                seen.add(chunk.chunk_id)
        candidates = tuple(merged[:MAX_CANDIDATES])
        return Retrieval(active.knowledge_version, candidates, candidates[:MAX_EVIDENCE])
