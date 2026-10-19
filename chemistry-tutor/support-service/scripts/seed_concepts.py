"""Seed a small prerequisite-concept graph (GraphRAG foundation).

Concept IDs are chosen to exactly match the `topic_id` values already used
in `verified_questions`, so looking up a question's prerequisites is a
direct lookup, no mapping table needed. One extra foundational root
concept (atomic structure basics) is added since it underlies both the
isotopes and mole topics but has no question of its own yet.

Usage:
    python scripts/seed_concepts.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal  # noqa: E402
from app.models import Concept, ConceptEdge  # noqa: E402

CONCEPTS = [
    # Unit 1
    Concept(concept_id="U01-ATOMIC-STRUCTURE", name="Atomic structure basics", unit="1"),
    Concept(concept_id="U01-ISOTOPES", name="Isotopes and mass number", unit="1"),
    Concept(concept_id="U01-ELECTRON-CONFIG", name="Electron configuration", unit="1"),
    # Unit 2
    Concept(concept_id="U02-ELECTRONEGATIVITY", name="Electronegativity", unit="2"),
    Concept(concept_id="U02-LEWIS-STRUCTURE", name="Lewis dot structures", unit="2"),
    # Unit 3
    Concept(concept_id="U03-MOLE", name="The mole concept", unit="3"),
    Concept(concept_id="U03-MOLAR-MASS", name="Molar mass", unit="3"),
    Concept(concept_id="U03-MOLARITY", name="Molarity", unit="3"),
    Concept(concept_id="U03-PERCENTAGE-COMPOSITION", name="Percentage composition", unit="3"),
]

# (concept_id, prerequisite_id) — concept_id requires prerequisite_id first.
EDGES = [
    ("U01-ISOTOPES", "U01-ATOMIC-STRUCTURE"),
    ("U01-ELECTRON-CONFIG", "U01-ATOMIC-STRUCTURE"),
    ("U02-ELECTRONEGATIVITY", "U01-ELECTRON-CONFIG"),
    ("U02-LEWIS-STRUCTURE", "U02-ELECTRONEGATIVITY"),
    ("U03-MOLE", "U01-ATOMIC-STRUCTURE"),
    ("U03-MOLAR-MASS", "U03-MOLE"),
    ("U03-MOLARITY", "U03-MOLE"),
    ("U03-PERCENTAGE-COMPOSITION", "U03-MOLAR-MASS"),
]


def main() -> None:
    db = SessionLocal()
    try:
        for concept in CONCEPTS:
            existing = db.get(Concept, concept.concept_id)
            if existing:
                print(f"skip (already exists): {concept.concept_id}")
                continue
            db.add(concept)
            print(f"added concept: {concept.concept_id}")
        db.flush()

        for concept_id, prerequisite_id in EDGES:
            existing = (
                db.query(ConceptEdge)
                .filter_by(concept_id=concept_id, prerequisite_id=prerequisite_id)
                .first()
            )
            if existing:
                print(f"skip (already exists): {concept_id} -> {prerequisite_id}")
                continue
            db.add(ConceptEdge(concept_id=concept_id, prerequisite_id=prerequisite_id))
            print(f"added edge: {concept_id} -> requires -> {prerequisite_id}")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
