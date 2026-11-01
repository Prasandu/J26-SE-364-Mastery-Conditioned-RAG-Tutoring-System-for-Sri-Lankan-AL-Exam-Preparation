"""Retrieval evaluation against the versioned gold set.

Relevance is label-based and text-free: a label is (sourceId, pdfPage, heading) and a retrieved
chunk satisfies it when it comes from that page and carries that heading. Labels therefore stay
valid when chunk boundaries (and chunk IDs) change.

* Recall@k: per question, the fraction of its labels satisfied by the top-k candidates; averaged.
* MRR@8: per question, 1 / rank of the first relevant candidate within the top 8 (0 if none).
"""

import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.knowledge.models import KnowledgeChunk

K_VALUES = (1, 3, 4, 8)


@dataclass(frozen=True)
class Label:
    source_id: str
    pdf_page: int
    heading: str

    def matches(self, chunk: KnowledgeChunk) -> bool:
        return (
            chunk.source_id == self.source_id
            and chunk.pdf_page == self.pdf_page
            and self.heading in chunk.headings
        )


@dataclass(frozen=True)
class GoldQuestion:
    question_id: str
    concept: str
    language: str
    kind: str  # "supported" | "unsupported" | "injection"
    question: str
    review_status: str
    labels: tuple[Label, ...]


def load_gold(path: Path) -> tuple[dict[str, Any], list[GoldQuestion]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    questions: list[GoldQuestion] = []
    for item in raw["items"]:
        labels = tuple(Label(x["sourceId"], x["pdfPage"], x["heading"]) for x in item["relevant"])
        for q in item["questions"]:
            questions.append(
                GoldQuestion(
                    question_id=q["id"],
                    concept=item["concept"],
                    language=q["language"],
                    kind=item["kind"],
                    question=q["text"],
                    review_status=q["reviewStatus"],
                    labels=labels,
                )
            )
    meta = {k: v for k, v in raw.items() if k != "items"}
    return meta, questions


def recall_at(labels: Sequence[Label], ranked: Sequence[KnowledgeChunk], k: int) -> float:
    if not labels:
        return 0.0
    top = ranked[:k]
    return sum(1 for label in labels if any(label.matches(c) for c in top)) / len(labels)


def reciprocal_rank(labels: Sequence[Label], ranked: Sequence[KnowledgeChunk], k: int = 8) -> float:
    for rank, chunk in enumerate(ranked[:k], start=1):
        if any(label.matches(chunk) for label in labels):
            return 1.0 / rank
    return 0.0


def summarize(rows: Sequence[dict[str, Any]]) -> dict[str, float | int]:
    """Mean metrics over rows produced by `score_question`."""
    n = len(rows)
    out: dict[str, float | int] = {"questions": n}
    for k in K_VALUES:
        out[f"recall@{k}"] = round(sum(r[f"recall@{k}"] for r in rows) / n, 3) if n else 0.0
    out["mrr@8"] = round(sum(r["mrr@8"] for r in rows) / n, 3) if n else 0.0
    return out


def score_question(question: GoldQuestion, ranked: Sequence[KnowledgeChunk]) -> dict[str, Any]:
    row: dict[str, Any] = {"id": question.question_id, "language": question.language}
    for k in K_VALUES:
        row[f"recall@{k}"] = recall_at(question.labels, ranked, k)
    row["mrr@8"] = reciprocal_rank(question.labels, ranked)
    row["missedAt4"] = [
        f"{label.source_id} p{label.pdf_page} · {label.heading}"
        for label in question.labels
        if not any(label.matches(c) for c in ranked[:4])
    ]
    return row
