from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import KnowledgeChunk, KnowledgeDocument
from app.services.rag.embeddings import embed_texts


@dataclass
class RetrievedChunk:
    content: str
    unit: str | None
    section: str | None
    page_number: int | None
    document_title: str
    similarity: float


def search_chunks(db: Session, query: str, top_k: int = 5) -> list[RetrievedChunk]:
    """Embed the query and return the top_k most similar chunks (cosine similarity)."""
    query_embedding = embed_texts([query])[0]

    # cosine_distance: 0 = identical, 2 = opposite. similarity = 1 - distance.
    distance = KnowledgeChunk.embedding.cosine_distance(query_embedding)
    stmt = (
        select(KnowledgeChunk, KnowledgeDocument.title, distance.label("distance"))
        .join(KnowledgeDocument, KnowledgeChunk.document_id == KnowledgeDocument.id)
        .order_by(distance)
        .limit(top_k)
    )

    results = db.execute(stmt).all()
    return [
        RetrievedChunk(
            content=chunk.content,
            unit=chunk.unit,
            section=chunk.section,
            page_number=chunk.page_number,
            document_title=title,
            similarity=1 - dist,
        )
        for chunk, title, dist in results
    ]
