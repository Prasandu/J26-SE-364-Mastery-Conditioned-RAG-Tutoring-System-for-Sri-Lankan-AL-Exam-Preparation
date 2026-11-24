from app.db import SessionLocal
from app.services.rag.retrieval import search_chunks


def test_search_returns_relevant_chunks_for_mole_question():
    db = SessionLocal()
    try:
        results = search_chunks(db, "What is a mole in chemistry?", top_k=5)

        assert len(results) == 5
        # top result should score reasonably high and come from the right unit
        assert results[0].similarity > 0.4
        assert results[0].unit == "3"
        # Note: results are ordered by fused (vector + full-text) rank, not raw
        # cosine similarity, so similarity values are no longer guaranteed to be
        # monotonically descending — a lexical-only match can outrank a weaker
        # vector-only match with a higher raw similarity number.
    finally:
        db.close()
