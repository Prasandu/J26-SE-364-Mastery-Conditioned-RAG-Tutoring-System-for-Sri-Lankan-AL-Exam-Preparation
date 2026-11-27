"""DAT-009 / R13: an unknown or unreviewed topic code is quarantined, never fuzzy-mapped.

Pure file logic (no database, no app import): runs with
`pytest --noconftest tests/test_topic_registry.py`.
"""

import pytest

from app.services.topic_registry import (
    Quarantined,
    RegistryError,
    Resolved,
    TopicRegistry,
    canonical_topic_ids,
    load_registry,
)

TOPICS = {
    "units": [
        {
            "id": "chem-u3",
            "topics": [{"id": "chem-u3-mole-concept", "subtopics": [{"id": "chem-u3-molar-mass"}]}],
        }
    ]
}
CANONICAL = canonical_topic_ids(TOPICS)


def registry(*aliases):
    return {"schemaVersion": "1.0.0", "sources": ["assessment", "support", "lab"], "aliases": list(aliases)}


def alias(code="U03_5", topic="chem-u3-mole-concept", status="approved", **extra):
    base = {"source": "assessment", "code": code, "topicId": topic, "status": status}
    if status == "approved":
        base |= {"reviewedBy": "chemistry-reviewer", "reviewedAt": "2026-11-26"}
    return base | extra


def test_canonical_ids_include_units_topics_and_subtopics():
    assert CANONICAL == {"chem-u3", "chem-u3-mole-concept", "chem-u3-molar-mass"}


def test_an_approved_alias_resolves_exactly():
    reg = TopicRegistry(registry(alias()), CANONICAL)

    assert reg.resolve("assessment", "U03_5") == Resolved("chem-u3-mole-concept")


@pytest.mark.parametrize("code", ["u03_5", "U03_5 ", "U03", "U03_5a", "Mole concept"])
def test_near_misses_are_quarantined_not_guessed(code):
    reg = TopicRegistry(registry(alias()), CANONICAL)

    result = reg.resolve("assessment", code)

    assert isinstance(result, Quarantined)
    assert result.reason == "no reviewed mapping for this code"


def test_the_same_code_from_another_source_is_not_borrowed():
    reg = TopicRegistry(registry(alias()), CANONICAL)

    assert isinstance(reg.resolve("support", "U03_5"), Quarantined)


@pytest.mark.parametrize(
    "status,reason", [("pending_review", "awaiting Chemistry review"), ("rejected", "rejected by review")]
)
def test_unapproved_aliases_are_quarantined_with_their_reason(status, reason):
    reg = TopicRegistry(registry(alias(status=status)), CANONICAL)

    assert reg.resolve("assessment", "U03_5") == Quarantined("assessment", "U03_5", reason)


@pytest.mark.parametrize(
    "bad,message",
    [
        (alias(topic="chem-u3-not-a-topic"), "not a canonical topic id"),
        (alias(status="approved", reviewedBy=None), "needs reviewedBy"),
        (alias(status="maybe"), "status must be one of"),
        ({**alias(), "source": "planner-typo"}, "unknown source"),
        ({**alias(), "code": " "}, "missing code"),
    ],
    ids=["unknown-topic", "approved-without-reviewer", "bad-status", "unknown-source", "blank-code"],
)
def test_an_inconsistent_registry_refuses_to_load(bad, message):
    with pytest.raises(RegistryError, match=message):
        TopicRegistry(registry(bad), CANONICAL)


def test_one_code_mapped_to_two_topics_refuses_to_load():
    with pytest.raises(RegistryError, match="mapped to two topics"):
        TopicRegistry(registry(alias(), alias(topic="chem-u3-molar-mass")), CANONICAL)


def test_the_shipped_registry_loads_and_has_no_unreviewed_mapping():
    reg = load_registry()

    # Nothing is reviewed yet, so every assessment code is (correctly) quarantined.
    assert isinstance(reg.resolve("assessment", "U03_5"), Quarantined)
