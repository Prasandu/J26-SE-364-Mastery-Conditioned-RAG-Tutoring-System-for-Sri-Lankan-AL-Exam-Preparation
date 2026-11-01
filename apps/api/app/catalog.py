"""Immutable catalog domain and offline staging comparison.

This module deliberately has no filesystem, database, or HTTP dependencies.  It is the
validation boundary for a future catalog adapter; staging a draft cannot change the active
student catalog.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


class CatalogValidationError(ValueError):
    pass


@dataclass(frozen=True)
class VersionRef:
    practical_id: str
    practical_version: str
    source_content_version: str
    simulation_definition_version: str
    assessment_definition_version: str
    knowledge_base_version: str | None

    def __post_init__(self) -> None:
        if not self.practical_id or not all(
            SEMVER.fullmatch(value)
            for value in (
                self.practical_version,
                self.source_content_version,
                self.simulation_definition_version,
                self.assessment_definition_version,
            )
        ):
            raise CatalogValidationError("invalid practical version reference")


@dataclass(frozen=True)
class Provenance:
    source_id: str
    document_sha256: str
    pdf_page: int
    printed_page: int

    def __post_init__(self) -> None:
        if not re.fullmatch(r"[0-9a-f]{64}", self.document_sha256):
            raise CatalogValidationError("invalid source checksum")
        if self.pdf_page < 1 or self.printed_page < 1:
            raise CatalogValidationError("source pages must be positive")


@dataclass(frozen=True)
class ReviewMetadata:
    status: str
    reviewer: str | None = None
    reviewed_at: str | None = None

    def __post_init__(self) -> None:
        if self.status not in {"draft", "teacher_review_pending", "approved"}:
            raise CatalogValidationError("invalid review status")
        if self.status == "approved" and not self.reviewer:
            raise CatalogValidationError("approved content requires a reviewer")


@dataclass(frozen=True)
class CatalogEntry:
    ref: VersionRef
    experiment_number: int
    title: str
    provenance: tuple[Provenance, ...]
    review: ReviewMetadata
    simulation_kind: str | None
    runnable: bool
    content: dict[str, Any]

    def __post_init__(self) -> None:
        if self.experiment_number < 1 or not self.title.strip():
            raise CatalogValidationError("catalog entry identity is incomplete")
        if not self.provenance:
            raise CatalogValidationError("catalog entry requires provenance")
        if self.runnable and self.simulation_kind != "standard_solution_by_mass":
            raise CatalogValidationError("unsupported simulation cannot be runnable")

    @property
    def content_hash(self) -> str:
        canonical = json.dumps(
            self.content, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class CatalogVersion:
    catalog_version: str
    entries: tuple[CatalogEntry, ...]
    created_at: str
    source_manifest_sha256: str

    def __post_init__(self) -> None:
        if not SEMVER.fullmatch(self.catalog_version):
            raise CatalogValidationError("invalid catalog version")
        if not re.fullmatch(r"[0-9a-f]{64}", self.source_manifest_sha256):
            raise CatalogValidationError("invalid catalog manifest checksum")
        numbers = [entry.experiment_number for entry in self.entries]
        if len(numbers) != len(set(numbers)):
            raise CatalogValidationError("duplicate experiment number")

    def by_id(self) -> dict[str, CatalogEntry]:
        return {entry.ref.practical_id: entry for entry in self.entries}


@dataclass(frozen=True)
class CatalogComparison:
    added: tuple[CatalogEntry, ...]
    modified: tuple[tuple[CatalogEntry, CatalogEntry], ...]
    removed: tuple[CatalogEntry, ...]
    duplicate_numbers: tuple[int, ...]
    unsupported_simulations: tuple[str, ...]
    source_or_review_blockers: tuple[str, ...]

    @property
    def can_stage(self) -> bool:
        return not self.duplicate_numbers


def compare_catalog(active: CatalogVersion, proposed: CatalogVersion) -> CatalogComparison:
    old = active.by_id()
    new = proposed.by_id()
    duplicate_numbers = tuple(
        sorted(
            number
            for number in {entry.experiment_number for entry in proposed.entries}
            if sum(entry.experiment_number == number for entry in proposed.entries) > 1
        )
    )
    modified = tuple(
        (old[identifier], new[identifier])
        for identifier in sorted(old.keys() & new.keys())
        if old[identifier].content_hash != new[identifier].content_hash
        or old[identifier].ref != new[identifier].ref
    )
    unsupported = tuple(
        sorted(
            entry.ref.practical_id
            for entry in proposed.entries
            if not entry.runnable or entry.simulation_kind is None
        )
    )
    blockers = tuple(
        sorted(
            f"{entry.ref.practical_id}:review"
            for entry in proposed.entries
            if entry.review.status != "approved"
        )
        + [
            f"{entry.ref.practical_id}:provenance"
            for entry in proposed.entries
            if not entry.provenance
        ]
    )
    return CatalogComparison(
        added=tuple(new[identifier] for identifier in sorted(new.keys() - old.keys())),
        modified=modified,
        removed=tuple(old[identifier] for identifier in sorted(old.keys() - new.keys())),
        duplicate_numbers=duplicate_numbers,
        unsupported_simulations=unsupported,
        source_or_review_blockers=blockers,
    )


def manifest_checksum(entries: Iterable[CatalogEntry]) -> str:
    payload = [
        {
            "id": entry.ref.practical_id,
            "version": entry.ref.practical_version,
            "contentHash": entry.content_hash,
        }
        for entry in sorted(entries, key=lambda item: item.ref.practical_id)
    ]
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
