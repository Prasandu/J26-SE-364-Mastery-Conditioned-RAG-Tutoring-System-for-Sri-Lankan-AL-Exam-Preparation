from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.concept import Concept
from app.models.concept_edge import ConceptEdge

MAX_DEPTH = 5  # safety cap against an accidental cycle in the seed data


@dataclass
class PrerequisiteConcept:
    concept_id: str
    name: str
    unit: str
    depth: int  # 1 = direct prerequisite, 2 = prerequisite of a prerequisite, etc.


def get_direct_prerequisites(db: Session, concept_id: str) -> list[str]:
    edges = db.execute(select(ConceptEdge).where(ConceptEdge.concept_id == concept_id)).scalars().all()
    return [e.prerequisite_id for e in edges]


def get_prerequisite_chain(db: Session, concept_id: str) -> list[PrerequisiteConcept]:
    """Walk upstream through the prerequisite graph (breadth-first),
    returning every ancestor concept with how many hops away it is.
    """
    visited: set[str] = {concept_id}
    chain: list[PrerequisiteConcept] = []
    frontier = [concept_id]
    depth = 0

    while frontier and depth < MAX_DEPTH:
        depth += 1
        next_frontier: list[str] = []
        for current_id in frontier:
            for prereq_id in get_direct_prerequisites(db, current_id):
                if prereq_id in visited:
                    continue
                visited.add(prereq_id)
                next_frontier.append(prereq_id)
                concept = db.get(Concept, prereq_id)
                if concept:
                    chain.append(
                        PrerequisiteConcept(
                            concept_id=concept.concept_id,
                            name=concept.name,
                            unit=concept.unit,
                            depth=depth,
                        )
                    )
        frontier = next_frontier

    return chain
