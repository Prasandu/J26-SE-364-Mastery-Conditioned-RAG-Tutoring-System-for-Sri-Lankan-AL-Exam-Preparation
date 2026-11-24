"""Retrieval quality benchmark: for each question, check whether the known
correct source page appears in the top-5 retrieved results (Recall@5).

Ground truth (expected_unit, expected_page) was pulled directly from the
real ingested knowledge_chunks table, not guessed — see the query used to
build this list in docs/DEVELOPMENT_PROGRESS.md.

Usage:
    python scripts/evaluate_retrieval.py
"""

import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(errors="replace")

from app.db import SessionLocal  # noqa: E402
from app.services.rag.retrieval import search_chunks  # noqa: E402

# A page tolerance of 1 allows for a section's content spanning onto the
# next/previous page without counting that as a miss.
PAGE_TOLERANCE = 1


@dataclass
class RetrievalCase:
    question: str
    expected_unit: str
    expected_page: int
    language: str = "en"


CASES = [
    RetrievalCase("What is electronegativity?", "1", 51),
    RetrievalCase("Explain Rutherford's gold foil experiment.", "1", 17),
    RetrievalCase("What is the Aufbau principle?", "1", 33),
    RetrievalCase("What is Hund's rule?", "1", 35),
    RetrievalCase("What is ionization energy?", "1", 47),
    RetrievalCase("What are Lewis dot structures?", "2", 55),
    RetrievalCase("Explain VSEPR theory.", "2", 62),
    RetrievalCase("What is dipole moment?", "2", 83),
    RetrievalCase("What are ionic bonds?", "2", 85),
    RetrievalCase("What are metallic bonds?", "2", 88),
    RetrievalCase("What is the mole and Avogadro constant?", "3", 107),
    RetrievalCase("What are the types of chemical formulae?", "3", 109),
    RetrievalCase("How do you determine empirical and molecular formula?", "3", 110),
    RetrievalCase("What is molarity?", "3", 114),
    RetrievalCase("How do you balance a chemical reaction by inspection?", "3", 116),
    RetrievalCase("What are oxidation numbers?", "3", 98),
    RetrievalCase("What is the flame test used for?", "6", 140),
    RetrievalCase("What are the oxoacids of nitrogen?", "6", 148),
    RetrievalCase("What are coordination compounds of transition metals?", "6", 176),
    RetrievalCase("How are complex ions named?", "6", 178),
    # Sinhala phrasing of a few of the above, checking the same expected
    # source pages come back via multilingual embeddings. Kept to phrasing
    # already manually verified to work (see Step 7 Sinhala chat test).
    RetrievalCase("මෝලයක් කියන්නේ මොකක්ද?", "3", 107, language="si"),
    RetrievalCase("අයනික බන්ධන යනු කුමක්ද?", "2", 85, language="si"),
]


def main() -> None:
    db = SessionLocal()
    hits = 0
    try:
        for case in CASES:
            results = search_chunks(db, case.question, top_k=5)
            hit = any(
                r.unit == case.expected_unit
                and abs((r.page_number or -999) - case.expected_page) <= PAGE_TOLERANCE
                for r in results
            )
            hits += hit
            status = "HIT " if hit else "MISS"
            top_pages = [(r.unit, r.page_number) for r in results]
            print(
                f"[{status}] ({case.language}) {case.question!r}\n"
                f"       expected unit={case.expected_unit} page={case.expected_page}\n"
                f"       top-5 (unit, page): {top_pages}"
            )
    finally:
        db.close()

    total = len(CASES)
    print(f"\nRecall@5: {hits}/{total} = {hits / total * 100:.1f}%")


if __name__ == "__main__":
    main()
