"""The syllabus as a graph: which topics need which, and which belong together.

The topics table holds a containment tree - U01_5 is part of U01 - and nothing more.
It cannot say that electrochemistry needs the mole concept first, which is exactly
what a tutoring system has to know: to retrieve the right material for a question,
and to tell a student which weak topic is holding the others back.

Edges are derived from the syllabus the NIE published, not from question tags. A
question carries one topic in this system, so questions almost never show two topics
together - measured on real data, the whole corpus gave two co-occurring pairs.
The syllabus text gives far more, because a later unit's contents name what it
builds on.

Derivation only ever proposes. Nothing is used for retrieval until a teacher has
approved it, the same rule the system applies to AI topic tags and to marking.
"""

import math
import re
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ConflictError, ContentValidationError, NotFoundError
from app.models import EdgeKind, EdgeStatus, Topic, TopicEdge, utcnow

SOURCE_SYLLABUS = "syllabus-text"

# Words that carry no subject meaning, so they never count as evidence of a link.
_STOP_WORDS = (
    "the and for with from using uses used their there are its into between of in to on by as is "
    "be that which this these those or an a at it they them then than when where how what why each "
    "such other others more most some any all both same different various given above below within "
    "including include includes relevant simple basic general common specific following"
)
STOP = frozenset(_STOP_WORDS.split())

MIN_WORD = 4  # shorter words are almost all grammar, not chemistry
MIN_TERMS = 2  # one shared word is a coincidence
MIN_SCORE = 0.25  # below this a teacher is only being given noise to reject
MOST_PER_TOPIC = 8  # a topic with forty candidates is a list nobody reviews
# At least one shared term has to be this distinctive. Without it, a handful of
# broad words ("block", "elements", "compounds") link whole units to each other:
# true of any two inorganic topics, and no use to anyone.
DISTINCTIVE = 0.6  # as a fraction of the most distinctive term in the syllabus


@dataclass(frozen=True)
class ProposedEdge:
    from_code: str
    to_code: str
    kind: EdgeKind
    weight: float
    evidence: str


def derive_edges(db: Session, *, nie_only: bool = True) -> list[ProposedEdge]:
    """Edges the syllabus text suggests, strongest first.

    A topic whose contents use another topic's distinctive vocabulary is building on
    it. Distinctive is the point: "elements" appears in half the syllabus and means
    nothing, while "resonance" appears in two places and means a great deal, so terms
    are weighted by how rare they are across the syllabus (an idf weight).
    """
    topics = _topics(db, nie_only)
    vocabulary = {topic.code: _terms(topic.name) for topic in topics}
    weights = _idf(vocabulary.values())

    proposed: list[ProposedEdge] = []
    for topic in topics:
        body = (topic.content or "").lower()
        if not body.strip():
            continue
        found = [
            candidate
            for candidate in _candidates(topic, topics, body, vocabulary, weights)
            if candidate.weight >= MIN_SCORE
        ]
        found.sort(key=lambda edge: edge.weight, reverse=True)
        proposed.extend(found[:MOST_PER_TOPIC])

    proposed.sort(key=lambda edge: edge.weight, reverse=True)
    return proposed


def save_proposals(db: Session, proposed: list[ProposedEdge]) -> int:
    """Store new proposals. An edge already decided on is left exactly as it is."""
    by_code = {topic.code: topic.id for topic in db.scalars(select(Topic))}
    existing = {
        (edge.from_topic_id, edge.to_topic_id, edge.kind)
        for edge in db.scalars(select(TopicEdge))
    }

    added = 0
    for edge in proposed:
        key = (by_code[edge.from_code], by_code[edge.to_code], edge.kind)
        if key in existing:
            continue
        db.add(
            TopicEdge(
                from_topic_id=key[0],
                to_topic_id=key[1],
                kind=edge.kind,
                status=EdgeStatus.PROPOSED,
                weight=round(edge.weight, 4),
                source=SOURCE_SYLLABUS,
                evidence=edge.evidence,
                created_at=utcnow(),
            )
        )
        existing.add(key)
        added += 1

    db.commit()
    return added


def _topics(db: Session, nie_only: bool) -> list[Topic]:
    topics = list(db.scalars(select(Topic).order_by(Topic.code)))
    if not nie_only:
        return topics
    # The U codes are the NIE syllabus. Earlier seed topics overlap them by meaning
    # ("ATOMIC" against "U01 Atomic Structure"), so mixing the two invents edges
    # between a topic and its own duplicate.
    return [topic for topic in topics if topic.code.startswith("U")]


def _candidates(
    topic: Topic,
    topics: list[Topic],
    body: str,
    vocabulary: dict[str, set[str]],
    weights: dict[str, float],
) -> list[ProposedEdge]:
    found = []
    for other in topics:
        if _same_branch(topic.code, other.code):
            continue  # the tree already says a topic contains its own parts
        shared = {term for term in vocabulary.get(other.code, set()) if term in body}
        if len(shared) < MIN_TERMS or not _distinctive(shared, weights):
            continue
        score = _score(shared, vocabulary[other.code], weights)
        found.append(
            ProposedEdge(
                from_code=topic.code,
                to_code=other.code,
                kind=_kind(topic.code, other.code),
                weight=score,
                evidence="mentions " + ", ".join(sorted(shared)[:5]),
            )
        )
    return found


def _distinctive(shared: set[str], weights: dict[str, float]) -> bool:
    """Whether any shared term is specific enough to mean something on its own."""
    if not weights:
        return False
    strongest = max(weights.values())
    return any(weights.get(term, 0.0) >= DISTINCTIVE * strongest for term in shared)


def _score(shared: set[str], all_terms: set[str], weights: dict[str, float]) -> float:
    """How much of the other topic's distinctive vocabulary this one actually uses."""
    got = sum(weights.get(term, 0.0) for term in shared)
    whole = sum(weights.get(term, 0.0) for term in all_terms)
    return got / whole if whole else 0.0


def _idf(vocabularies) -> dict[str, float]:
    """A term's weight: rare across the syllabus means it carries subject meaning."""
    seen: Counter[str] = Counter()
    total = 0
    for terms in vocabularies:
        total += 1
        seen.update(terms)
    return {term: math.log(total / count) + 1 for term, count in seen.items()}


def _terms(name: str) -> set[str]:
    words = re.findall(rf"[a-z]{{{MIN_WORD},}}", name.lower())
    return {word for word in words if word not in STOP}


def _kind(from_code: str, to_code: str) -> EdgeKind:
    """Syllabus order decides direction: a later unit builds on an earlier one.

    The NIE syllabus is taught in unit order, so when U13's contents use U03's
    vocabulary it is U13 that needs U03, not the other way round. Within one unit
    neither comes first, so the link is only a related one.
    """
    return EdgeKind.REQUIRES if _unit(from_code) > _unit(to_code) else EdgeKind.RELATED_TO


def _unit(code: str) -> int:
    match = re.match(r"U(\d+)", code)
    return int(match.group(1)) if match else 0


def _same_branch(left: str, right: str) -> bool:
    return left.startswith(right) or right.startswith(left)


# Review, then use


def list_edges(
    db: Session, *, status: EdgeStatus | None = None, limit: int = 200
) -> list[TopicEdge]:
    """Edges for a teacher to look at, strongest first."""
    stmt = select(TopicEdge).order_by(TopicEdge.weight.desc(), TopicEdge.id)
    if status is not None:
        stmt = stmt.where(TopicEdge.status == status)
    return list(db.scalars(stmt.limit(limit)))


def decide_edge(db: Session, edge_id: int, *, approved: bool, decided_by: str) -> TopicEdge:
    """Approve or reject one proposed edge. Only an approved edge is ever traversed."""
    edge = db.get(TopicEdge, edge_id)
    if edge is None:
        raise NotFoundError("No such topic edge")
    if edge.status != EdgeStatus.PROPOSED:
        raise ConflictError("That edge has already been decided")

    edge.status = EdgeStatus.APPROVED if approved else EdgeStatus.REJECTED
    edge.decided_by = decided_by
    edge.decided_at = utcnow()
    db.commit()
    return edge


def add_edge(
    db: Session,
    *,
    from_code: str,
    to_code: str,
    kind: EdgeKind,
    decided_by: str,
    weight: float = 1.0,
) -> TopicEdge:
    """An edge a teacher writes themselves. Approved as it is created - a person
    stating a prerequisite is the evidence, so there is nothing left to review."""
    codes = {topic.code: topic for topic in db.scalars(select(Topic))}
    missing = sorted({from_code, to_code} - set(codes))
    if missing:
        raise ContentValidationError("The edge has problems", [f"Unknown topic {c}" for c in missing])
    if from_code == to_code:
        raise ContentValidationError("The edge has problems", ["A topic cannot require itself"])

    edge = TopicEdge(
        from_topic_id=codes[from_code].id,
        to_topic_id=codes[to_code].id,
        kind=kind,
        status=EdgeStatus.APPROVED,
        weight=weight,
        source="teacher",
        evidence=None,
        decided_by=decided_by,
        decided_at=utcnow(),
        created_at=utcnow(),
    )
    db.add(edge)
    db.commit()
    return edge


# Walking the graph

MAX_HOPS = 2  # two steps out; past that everything is related to everything


@dataclass(frozen=True)
class Reached:
    """A topic the walk arrived at, and how far away it was."""

    code: str
    hops: int
    through: EdgeKind


def neighbours(
    db: Session,
    codes: list[str],
    *,
    kinds: tuple[EdgeKind, ...] = (EdgeKind.REQUIRES, EdgeKind.RELATED_TO),
    hops: int = 1,
) -> list[Reached]:
    """Topics reachable from these, over approved edges only.

    Used two ways. Retrieval walks REQUIRES outwards so a generated question can be
    grounded in what its topic builds on; mastery walks the same edges backwards to
    say which topics a weak one puts at risk.
    """
    start = {code for code in codes}
    out = _edges_by_source(db, kinds)

    seen: dict[str, Reached] = {}
    frontier = start
    for hop in range(1, min(hops, MAX_HOPS) + 1):
        nxt: set[str] = set()
        for code in frontier:
            for to_code, kind in out.get(code, ()):
                if to_code in start or to_code in seen:
                    continue
                seen[to_code] = Reached(to_code, hop, kind)
                nxt.add(to_code)
        frontier = nxt
        if not frontier:
            break

    return sorted(seen.values(), key=lambda reached: (reached.hops, reached.code))


def prerequisites(db: Session, codes: list[str], *, hops: int = 2) -> list[Reached]:
    """What these topics need in place first."""
    return neighbours(db, codes, kinds=(EdgeKind.REQUIRES,), hops=hops)


def dependents(db: Session, codes: list[str], *, hops: int = 1) -> list[Reached]:
    """What is held back while these topics are weak - the edges read backwards."""
    into = _edges_by_target(db, (EdgeKind.REQUIRES,))
    start = set(codes)
    return sorted(
        (
            Reached(from_code, 1, EdgeKind.REQUIRES)
            for code in codes
            for from_code, _ in into.get(code, ())
            if from_code not in start
        ),
        key=lambda reached: reached.code,
    )


def _approved(db: Session, kinds: tuple[EdgeKind, ...]) -> list[tuple[str, str, EdgeKind]]:
    rows = db.execute(
        select(TopicEdge.kind, Topic.code, TopicEdge.to_topic_id)
        .join(Topic, Topic.id == TopicEdge.from_topic_id)
        .where(TopicEdge.status == EdgeStatus.APPROVED, TopicEdge.kind.in_(kinds))
    ).all()
    by_id = {topic.id: topic.code for topic in db.scalars(select(Topic))}
    return [(from_code, by_id[to_id], kind) for kind, from_code, to_id in rows]


def _edges_by_source(db: Session, kinds: tuple[EdgeKind, ...]) -> dict[str, list[tuple[str, EdgeKind]]]:
    out: dict[str, list[tuple[str, EdgeKind]]] = {}
    for from_code, to_code, kind in _approved(db, kinds):
        out.setdefault(from_code, []).append((to_code, kind))
        if kind is EdgeKind.RELATED_TO:  # symmetric, stored once
            out.setdefault(to_code, []).append((from_code, kind))
    return out


def _edges_by_target(db: Session, kinds: tuple[EdgeKind, ...]) -> dict[str, list[tuple[str, EdgeKind]]]:
    into: dict[str, list[tuple[str, EdgeKind]]] = {}
    for from_code, to_code, kind in _approved(db, kinds):
        into.setdefault(to_code, []).append((from_code, kind))
    return into


def decide_edges(db: Session, edge_ids: list[int], *, approved: bool, decided_by: str) -> int:
    """Decide several edges at once, naming them explicitly.

    The ids come from what the reviewer had on screen, so a decision still covers a
    set someone looked at - there is deliberately no "approve everything" here, and
    an edge already decided is left alone rather than overwritten.
    """
    if not edge_ids:
        return 0

    wanted = EdgeStatus.APPROVED if approved else EdgeStatus.REJECTED
    edges = db.scalars(
        select(TopicEdge).where(
            TopicEdge.id.in_(edge_ids), TopicEdge.status == EdgeStatus.PROPOSED
        )
    ).all()
    for edge in edges:
        edge.status = wanted
        edge.decided_by = decided_by
        edge.decided_at = utcnow()
    db.commit()
    return len(edges)
