"""Profile embeddings and anonymised similar-student retrieval."""

from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ProfileEmbedding


@dataclass(frozen=True)
class SimilarStudent:
    student_id: str
    similarity: float
    anonymised_plan_mix: dict[str, Any]


def build_profile_embedding(
    mastery_by_topic: dict[str, float],
    *,
    dimension: int = 16,
    ordered_topics: list[str] | None = None,
) -> list[float]:
    """Convert a mastery map into a fixed-length, deterministic 16-d vector."""
    ordered = ordered_topics or sorted(mastery_by_topic)
    values = [float(mastery_by_topic.get(topic_id, 0.0)) for topic_id in ordered[:dimension]]
    if len(values) < dimension:
        values.extend([0.0] * (dimension - len(values)))
    return [float(value) for value in values[:dimension]]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    """Return a bounded similarity score for two equal-length vectors."""
    if len(left) != len(right):
        raise ValueError("embedding vectors must have the same length")
    if not left:
        return 0.0
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return max(0.0, min(1.0, dot / (left_norm * right_norm)))


def save_profile_embedding(
    session: Session,
    student_id: str,
    mastery_by_topic: dict[str, float],
    *,
    ordered_topics: list[str] | None = None,
) -> ProfileEmbedding:
    """Persist the student's fixed-length profile embedding for later retrieval."""
    row = session.get(ProfileEmbedding, student_id)
    embedding = build_profile_embedding(mastery_by_topic, ordered_topics=ordered_topics)
    if row is None:
        row = ProfileEmbedding(student_id=student_id, embedding=embedding)
        session.add(row)
    else:
        row.embedding = embedding
    return row


def find_similar_students(
    session: Session,
    student_id: str,
    *,
    mastery_by_topic: dict[str, float] | None = None,
    ordered_topics: list[str] | None = None,
    k: int = 5,
) -> list[SimilarStudent]:
    """Return anonymised peers by cosine similarity of mastery embeddings."""
    if k <= 0:
        raise ValueError("k must be positive")

    reference = mastery_by_topic if mastery_by_topic is not None else {}
    if not reference:
        raise ValueError("mastery_by_topic is required to find similar students")

    reference_embedding = build_profile_embedding(reference, ordered_topics=ordered_topics)
    candidates = session.scalars(select(ProfileEmbedding)).all()
    neighbours: list[SimilarStudent] = []
    for candidate in candidates:
        if candidate.student_id == student_id:
            continue
        similarity = cosine_similarity(reference_embedding, list(candidate.embedding))
        scores = {
            "strategy": "balanced review pattern",
            "focus_topics": sorted(reference)[:3],
        }
        neighbours.append(
            SimilarStudent(
                student_id=candidate.student_id,
                similarity=similarity,
                anonymised_plan_mix=scores,
            )
        )
    neighbours.sort(key=lambda item: item.similarity, reverse=True)
    return neighbours[:k]
