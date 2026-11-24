from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import KnowledgeChunk, KnowledgeDocument
from app.services.rag.embeddings import embed_texts

# How many candidates each leg of the hybrid search contributes before fusion.
# Wider than top_k so a term that only one side ranks highly still gets a chance.
_CANDIDATE_POOL = 20

# Reciprocal rank fusion constant (standard default; de-emphasizes rank-1 dominance).
_RRF_K = 60


@dataclass
class RetrievedChunk:
    content: str
    unit: str | None
    section: str | None
    page_number: int | None
    document_title: str
    similarity: float


def _vector_candidates(db: Session, query_embedding: list[float], pool_size: int) -> list[tuple]:
    """Dense retrieval leg: cosine similarity over embeddings."""
    distance = KnowledgeChunk.embedding.cosine_distance(query_embedding)
    stmt = (
        select(KnowledgeChunk, KnowledgeDocument.title, distance.label("distance"))
        .join(KnowledgeDocument, KnowledgeChunk.document_id == KnowledgeDocument.id)
        .where(KnowledgeChunk.embedding.is_not(None))
        .order_by(distance)
        .limit(pool_size)
    )
    return db.execute(stmt).all()


def _lexical_candidates(
    db: Session, query: str, query_embedding: list[float], pool_size: int
) -> list[tuple]:
    """Sparse retrieval leg: Postgres full-text search over knowledge_chunks.content_tsv.

    Catches exact-terminology matches (e.g. "mole", "Avogadro constant") that a
    dense embedding can rank low for if the query's phrasing differs from the
    textbook's, even though the term appears verbatim in the chunk. Also computes
    cosine distance against the same query embedding, so a chunk that only this
    leg surfaces still gets a real similarity score (not a fabricated 0.0) for
    downstream relevance filtering.
    """
    tsquery = func.plainto_tsquery("english", query)
    rank = func.ts_rank(KnowledgeChunk.content_tsv, tsquery)
    distance = KnowledgeChunk.embedding.cosine_distance(query_embedding)
    stmt = (
        select(KnowledgeChunk, KnowledgeDocument.title, rank.label("rank"), distance.label("distance"))
        .join(KnowledgeDocument, KnowledgeChunk.document_id == KnowledgeDocument.id)
        .where(KnowledgeChunk.content_tsv.op("@@")(tsquery))
        .order_by(rank.desc())
        .limit(pool_size)
    )
    return db.execute(stmt).all()


def search_chunks(db: Session, query: str, top_k: int = 5) -> list[RetrievedChunk]:
    """Hybrid retrieval: fuse dense (vector) and sparse (full-text) search via RRF.

    Pure vector search under-retrieves when a query's wording diverges from the
    source text's exact terminology (e.g. "mole and Avogadro constant" scoring
    below unrelated chunks). Running a parallel keyword search and fusing ranks
    recovers these without needing a reranker model or a different embedder.
    """
    query_embedding = embed_texts([query])[0]

    vector_rows = _vector_candidates(db, query_embedding, _CANDIDATE_POOL)
    lexical_rows = _lexical_candidates(db, query, query_embedding, _CANDIDATE_POOL)

    # Reciprocal rank fusion: each chunk's score is the sum of 1/(k + rank) across
    # whichever leg(s) it appeared in. Chunks found by both legs rank highest.
    scores: dict[int, float] = {}
    chunks_by_id: dict[int, tuple] = {}
    similarity_by_id: dict[int, float] = {}

    for rank, (chunk, title, distance) in enumerate(vector_rows, start=1):
        scores[chunk.id] = scores.get(chunk.id, 0.0) + 1.0 / (_RRF_K + rank)
        chunks_by_id[chunk.id] = (chunk, title)
        similarity_by_id[chunk.id] = max(similarity_by_id.get(chunk.id, 0.0), 1 - distance)

    for rank, (chunk, title, _text_rank, distance) in enumerate(lexical_rows, start=1):
        scores[chunk.id] = scores.get(chunk.id, 0.0) + 1.0 / (_RRF_K + rank)
        chunks_by_id.setdefault(chunk.id, (chunk, title))
        similarity_by_id[chunk.id] = max(similarity_by_id.get(chunk.id, 0.0), 1 - distance)

    ranked_ids = sorted(scores, key=lambda cid: scores[cid], reverse=True)[:top_k]

    return [
        RetrievedChunk(
            content=chunks_by_id[cid][0].content,
            unit=chunks_by_id[cid][0].unit,
            section=chunks_by_id[cid][0].section,
            page_number=chunks_by_id[cid][0].page_number,
            document_title=chunks_by_id[cid][1],
            similarity=similarity_by_id[cid],
        )
        for cid in ranked_ids
    ]
