"""Gold-set integrity and metric definitions (no model, no private data)."""

import json
from collections import Counter

from app.knowledge.extract import load_config
from app.knowledge.models import KnowledgeChunk
from app.rag.evaluation import (
    GoldQuestion,
    Label,
    load_gold,
    recall_at,
    reciprocal_rank,
    score_question,
)
from app.settings import REPO_ROOT

GOLD = REPO_ROOT / "content" / "knowledge" / "gold" / "retrieval-gold.v1.json"
CONFIG = REPO_ROOT / "content" / "knowledge" / "approved-pages.v1.json"


def test_gold_set_shape() -> None:
    meta, questions = load_gold(GOLD)
    assert meta["goldVersion"] == "gold-exp04-1.0.0"
    supported = [q for q in questions if q.kind == "supported"]
    concepts = Counter(q.concept for q in supported)
    assert len(concepts) >= 10
    for concept in concepts:
        langs = sorted(q.language for q in supported if q.concept == concept)
        assert langs == ["en", "si"], concept
    assert all(q.review_status == "teacher_review_pending" for q in questions if q.language == "si")
    assert all(q.labels for q in supported)
    assert any(q.kind == "unsupported" for q in questions)
    assert any(q.kind == "injection" for q in questions)
    assert all(not q.labels for q in questions if q.kind != "supported")
    assert len({q.question_id for q in questions}) == len(questions)


def test_gold_labels_point_at_approved_in_scope_headings() -> None:
    config = load_config(CONFIG)
    pages = {(p.source_id, p.pdf_page): p for p in config.pages}
    _, questions = load_gold(GOLD)
    for q in questions:
        for label in q.labels:
            page = pages[(label.source_id, label.pdf_page)]
            allowed = set(page.headings) | {page.initial_heading}
            assert label.heading in allowed, (q.question_id, label)
            assert label.heading not in page.out_of_scope_headings


def test_gold_file_contains_no_pdf_text() -> None:
    raw = json.loads(GOLD.read_text(encoding="utf-8"))
    for item in raw["items"]:
        assert set(item) == {"concept", "kind", "relevant", "questions"}
        for label in item["relevant"]:
            assert set(label) == {"sourceId", "pdfPage", "heading"}


def chunk(page: int, heading: str) -> KnowledgeChunk:
    return KnowledgeChunk(
        chunk_id=f"kc_{page:020x}", knowledge_version="kb", source_id="s", document_title="t",
        edition="e", document_sha256="d" * 64, pdf_page=page, printed_page=page, unit="u",
        section="s", heading=heading, headings=(heading,), language="en", experiment_id=None,
        in_scope=True, ordinal=0, text="x", text_sha256="0" * 64, token_count=1,
        extractor_version="x",
    )  # fmt: skip


def test_metric_definitions() -> None:
    labels = (Label("s", 2, "B"), Label("s", 4, "D"))
    ranked = [chunk(1, "A"), chunk(2, "B"), chunk(3, "C"), chunk(5, "E"), chunk(4, "D")]
    assert recall_at(labels, ranked, 1) == 0.0
    assert recall_at(labels, ranked, 2) == 0.5
    assert recall_at(labels, ranked, 4) == 0.5
    assert recall_at(labels, ranked, 8) == 1.0
    assert reciprocal_rank(labels, ranked) == 0.5
    assert reciprocal_rank(labels, ranked[2:4]) == 0.0

    row = score_question(
        GoldQuestion("q", "c", "en", "supported", "?", "canonical", labels), ranked
    )
    assert row["missedAt4"] == ["s p4 · D"] and row["mrr@8"] == 0.5
