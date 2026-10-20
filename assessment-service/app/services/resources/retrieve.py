"""Similarity search over published resource chunks.

Cosine distance, via pgvector's `<=>` operator: scale-invariant, so it compares
embeddings by direction regardless of their length (see app/ai/embeddings.py). A raw,
parameterized SQL query is used for the actual search -
the embedding is always passed as a bound parameter, never interpolated into the
query string - because pgvector's operators are not part of plain SQLAlemy Core, and
the project's existing JSON_DOC columns show the same willingness to drop to a little
raw SQL where the ORM layer does not reach (see app/services/export.py).

Only Postgres can run this: SQLite (tests only) stores the embedding as plain JSON
with no similarity operator, which is why the unit tests here mock this function
rather than exercising real search, and why a dedicated integration test
(tests/test_resources_retrieval_pg.py) exists to run the real query against Supabase.
"""

import time
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.ai.embeddings import EmbeddingModel
from app.models import ResourceStatus

DEFAULT_LIMIT = 5
MAX_LIMIT = 20


@dataclass(frozen=True)
class Passage:
    """One retrieved chunk, with everything a citation needs and how well it matched."""

    chunk_id: int
    resource_code: str
    resource_title: str
    resource_version: int
    page_number: int | None
    heading: str | None
    text: str
    similarity: float  # 1.0 = identical direction, 0.0 = unrelated, by cosine


@dataclass(frozen=True)
class SearchResult:
    passages: list[Passage]
    query_embedded: bool  # False if the embedding call itself failed
    elapsed_seconds: float


_SEARCH_SQL = text(
    """
    SELECT
        resource_chunks.id,
        resources.code,
        resources.title,
        resources.version,
        resource_chunks.page_number,
        resource_chunks.heading,
        resource_chunks.text,
        1 - (resource_chunks.embedding <=> CAST(:query_vector AS vector)) AS similarity
    FROM resource_chunks
    JOIN resources ON resources.id = resource_chunks.resource_id
    WHERE resources.status = :status
      AND resource_chunks.embedding IS NOT NULL
      AND (CAST(:topic_code AS text) IS NULL OR resources.topic_code = CAST(:topic_code AS text))
      AND (CAST(:resource_code AS text) IS NULL OR resources.code = CAST(:resource_code AS text))
    ORDER BY resource_chunks.embedding <=> CAST(:query_vector AS vector)
    LIMIT :limit
    """
)


def search(
    db: Session,
    embedder: EmbeddingModel,
    query: str,
    *,
    topic_code: str | None = None,
    resource_code: str | None = None,
    limit: int = DEFAULT_LIMIT,
    min_similarity: float = 0.0,
) -> SearchResult:
    """The published chunks most like `query`, above `min_similarity`.

    A passage below the threshold is left out rather than returned anyway: padding
    the result with something irrelevant is worse than returning fewer passages, or
    none, when nothing in the library actually matches.
    """
    started = time.monotonic()
    # SQLite (local development, and the test suite outside of the one dedicated
    # integration test below) stores the embedding as plain JSON with no similarity
    # operator at all - there is no query to run here, not just a worse one, so this
    # is checked before paying for an embedding call that could not be used anyway.
    if db.get_bind().dialect.name != "postgresql":
        return SearchResult([], query_embedded=True, elapsed_seconds=time.monotonic() - started)

    result = embedder.embed([query])
    vector = result.vectors[0]
    if vector is None:
        return SearchResult([], query_embedded=False, elapsed_seconds=time.monotonic() - started)

    rows = db.execute(
        _SEARCH_SQL,
        {
            "query_vector": _as_vector_literal(vector),
            "status": ResourceStatus.PUBLISHED.value,
            "topic_code": topic_code,
            "resource_code": resource_code,
            "limit": min(limit, MAX_LIMIT),
        },
    ).all()

    passages = [
        Passage(
            chunk_id=row[0],
            resource_code=row[1],
            resource_title=row[2],
            resource_version=row[3],
            page_number=row[4],
            heading=row[5],
            text=row[6],
            similarity=row[7],
        )
        for row in rows
        if row[7] >= min_similarity
    ]
    return SearchResult(passages, query_embedded=True, elapsed_seconds=time.monotonic() - started)


def _as_vector_literal(vector: list[float]) -> str:
    """pgvector's own text format, "[0.1,0.2,...]". Built from a Python list of
    floats that already came back from the embedding call, never from user text, so
    there is nothing here for a caller to inject."""
    return "[" + ",".join(repr(value) for value in vector) + "]"
