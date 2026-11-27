"""DAT-009: map another component's topic code to the planner's canonical topic id.

The canonical ids are the planner taxonomy (shared/contracts/topics.json). The registry
(shared/contracts/topic-registry.v1.json) lists aliases: one source component's code
(e.g. assessment "U03_5") -> exactly one canonical id. Rules:

- Only an alias a Chemistry reviewer approved (named reviewer + date) resolves.
- Anything else - an unknown code, one awaiting review, a rejected one - is
  quarantined with a reason, never guessed: no case-folding, prefix, name or fuzzy
  matching, so a wrong topic can never silently receive a student's marks.
- The registry itself is validated on load and fails closed: an alias pointing at a
  topic id that does not exist, or one code mapped twice, refuses to load.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

CONTRACTS = Path(__file__).resolve().parents[3] / "shared" / "contracts"
STATUSES = {"pending_review", "approved", "rejected"}


class RegistryError(ValueError):
    """The registry file is inconsistent; nothing may be resolved from it."""


@dataclass(frozen=True)
class Resolved:
    topic_id: str


@dataclass(frozen=True)
class Quarantined:
    source: str
    code: str
    reason: str


def canonical_topic_ids(topics_document: dict[str, Any]) -> set[str]:
    """Every id in the planner taxonomy: units, topics and their sub-topics."""
    found: set[str] = set()

    def walk(node: dict[str, Any]) -> None:
        if isinstance(node.get("id"), str):
            found.add(node["id"])
        for key in ("topics", "subtopics", "sub_topics", "children"):
            for child in node.get(key) or []:
                walk(child)

    for unit in topics_document.get("units", []):
        walk(unit)
    return found


class TopicRegistry:
    def __init__(self, registry: dict[str, Any], canonical_ids: set[str]) -> None:
        sources = set(registry.get("sources") or [])
        self._approved: dict[tuple[str, str], str] = {}
        self._other: dict[tuple[str, str], str] = {}
        seen: dict[tuple[str, str], str] = {}
        for index, alias in enumerate(registry.get("aliases") or []):
            where = f"alias #{index}"
            source, code, topic_id = alias.get("source"), alias.get("code"), alias.get("topicId")
            status = alias.get("status")
            if source not in sources:
                raise RegistryError(f"{where}: unknown source {source!r}")
            if not isinstance(code, str) or not code.strip():
                raise RegistryError(f"{where}: missing code")
            if topic_id not in canonical_ids:
                raise RegistryError(f"{where}: {topic_id!r} is not a canonical topic id")
            if status not in STATUSES:
                raise RegistryError(f"{where}: status must be one of {sorted(STATUSES)}")
            if status == "approved" and not (alias.get("reviewedBy") and alias.get("reviewedAt")):
                raise RegistryError(f"{where}: an approved alias needs reviewedBy and reviewedAt")
            key = (source, code)
            if key in seen and seen[key] != topic_id:
                raise RegistryError(f"{where}: {source} code {code!r} is mapped to two topics")
            seen[key] = topic_id
            if status == "approved":
                self._approved[key] = topic_id
            else:
                self._other[key] = status

    def resolve(self, source: str, code: str) -> Resolved | Quarantined:
        key = (source, code)
        if key in self._approved:
            return Resolved(self._approved[key])
        if key in self._other:
            reason = (
                "awaiting Chemistry review" if self._other[key] == "pending_review" else "rejected by review"
            )
            return Quarantined(source, code, reason)
        return Quarantined(source, code, "no reviewed mapping for this code")


def load_registry(
    registry_path: Path = CONTRACTS / "topic-registry.v1.json",
    topics_path: Path = CONTRACTS / "topics.json",
) -> TopicRegistry:
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    if registry.get("schemaVersion") != "1.0.0":
        raise RegistryError(f"unsupported registry schemaVersion {registry.get('schemaVersion')!r}")
    topics = json.loads(topics_path.read_text(encoding="utf-8"))
    return TopicRegistry(registry, canonical_topic_ids(topics))
