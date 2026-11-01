import pytest

from app.catalog import (
    CatalogEntry,
    CatalogValidationError,
    CatalogVersion,
    Provenance,
    ReviewMetadata,
    VersionRef,
    compare_catalog,
    manifest_checksum,
)


def entry(
    identifier: str, number: int, *, practical_version: str = "1.0.0", runnable: bool = True
) -> CatalogEntry:
    return CatalogEntry(
        ref=VersionRef(identifier, practical_version, "1.0.0", "1.0.0", "1.0.0", "kb-1"),
        experiment_number=number,
        title=f"Practical {number}",
        provenance=(Provenance("handbook", "a" * 64, 21, 13),),
        review=ReviewMetadata("approved", "teacher-1", "2026-10-10T00:00:00Z"),
        simulation_kind="standard_solution_by_mass" if runnable else None,
        runnable=runnable,
        content={"procedure": [f"step-{number}"]},
    )


def catalog(*entries: CatalogEntry) -> CatalogVersion:
    return CatalogVersion("1.0.0", tuple(entries), "2026-10-10T00:00:00Z", "b" * 64)


def test_catalog_comparison_reports_add_modify_remove_and_pending_simulation() -> None:
    active = catalog(entry("exp-1", 1), entry("exp-2", 2))
    changed = entry("exp-1", 1, practical_version="2.0.0")
    proposed = catalog(changed, entry("exp-3", 3, runnable=False))

    comparison = compare_catalog(active, proposed)

    assert [item.ref.practical_id for item in comparison.added] == ["exp-3"]
    assert [
        (old.ref.practical_id, new.ref.practical_version) for old, new in comparison.modified
    ] == [("exp-1", "2.0.0")]
    assert [item.ref.practical_id for item in comparison.removed] == ["exp-2"]
    assert comparison.unsupported_simulations == ("exp-3",)
    assert comparison.source_or_review_blockers == ()


def test_catalog_rejects_duplicate_numbers_and_unreviewed_entries() -> None:
    with pytest.raises(CatalogValidationError, match="duplicate"):
        catalog(entry("exp-1", 1), entry("exp-2", 1))

    pending = entry("exp-2", 2)
    pending = CatalogEntry(
        **{**pending.__dict__, "review": ReviewMetadata("teacher_review_pending")}
    )
    comparison = compare_catalog(catalog(entry("exp-1", 1)), catalog(pending))
    assert comparison.source_or_review_blockers == ("exp-2:review",)


def test_manifest_checksum_is_order_independent() -> None:
    assert manifest_checksum([entry("exp-1", 1), entry("exp-2", 2)]) == manifest_checksum(
        [entry("exp-2", 2), entry("exp-1", 1)]
    )
