"""Manually test retrieval quality against the ingested knowledge base.

Usage:
    python scripts/search_knowledge.py "What is a mole?"
"""

import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal  # noqa: E402
from app.services.rag.retrieval import search_chunks  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        print('Usage: python scripts/search_knowledge.py "your question"')
        return

    query = sys.argv[1]
    db = SessionLocal()
    try:
        results = search_chunks(db, query, top_k=5)
        print(f"Query: {query}\n")
        for i, r in enumerate(results, 1):
            print(f"#{i} similarity={r.similarity:.3f} unit={r.unit} page={r.page_number}")
            print(f"    {r.document_title} | {r.section}")
            print(f"    {r.content[:200]}...")
            print()
    finally:
        db.close()


if __name__ == "__main__":
    main()
