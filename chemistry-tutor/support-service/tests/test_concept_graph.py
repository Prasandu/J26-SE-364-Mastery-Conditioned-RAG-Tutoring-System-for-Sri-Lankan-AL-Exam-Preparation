from app.db import SessionLocal
from app.services.rag.concept_graph import get_direct_prerequisites, get_prerequisite_chain


def test_direct_prerequisites_for_seeded_concept():
    db = SessionLocal()
    try:
        prereqs = get_direct_prerequisites(db, "U03-MOLAR-MASS")
        assert prereqs == ["U03-MOLE"]
    finally:
        db.close()


def test_concept_with_no_prerequisites_returns_empty():
    db = SessionLocal()
    try:
        prereqs = get_direct_prerequisites(db, "U01-ATOMIC-STRUCTURE")
        assert prereqs == []
    finally:
        db.close()


def test_multi_level_prerequisite_chain():
    db = SessionLocal()
    try:
        chain = get_prerequisite_chain(db, "U03-PERCENTAGE-COMPOSITION")
        ids_by_depth = {c.concept_id: c.depth for c in chain}

        assert ids_by_depth["U03-MOLAR-MASS"] == 1
        assert ids_by_depth["U03-MOLE"] == 2
        assert ids_by_depth["U01-ATOMIC-STRUCTURE"] == 3
    finally:
        db.close()


def test_unknown_concept_returns_empty_chain():
    db = SessionLocal()
    try:
        chain = get_prerequisite_chain(db, "DOES-NOT-EXIST")
        assert chain == []
    finally:
        db.close()


def test_unit_6_concept_has_expected_prerequisite():
    db = SessionLocal()
    try:
        prereqs = get_direct_prerequisites(db, "U06-OXOACIDS-NITROGEN")
        assert prereqs == ["U03-OXIDATION-NUMBERS"]
    finally:
        db.close()


def test_unit_6_concept_with_multiple_prerequisites():
    db = SessionLocal()
    try:
        prereqs = set(get_direct_prerequisites(db, "U06-COORDINATION-COMPOUNDS"))
        assert prereqs == {"U01-ELECTRON-CONFIG", "U02-LEWIS-STRUCTURE"}
    finally:
        db.close()


def test_unit_6_chain_crosses_back_to_unit_1_and_unit_3():
    db = SessionLocal()
    try:
        chain = get_prerequisite_chain(db, "U06-OXOACIDS-NITROGEN")
        ids_by_depth = {c.concept_id: c.depth for c in chain}

        assert ids_by_depth["U03-OXIDATION-NUMBERS"] == 1
        assert ids_by_depth["U01-ELECTRON-CONFIG"] == 2
        assert ids_by_depth["U01-ATOMIC-STRUCTURE"] == 3
    finally:
        db.close()
