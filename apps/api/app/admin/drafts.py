"""Draft lifecycle: creation from extraction candidates, validation, edits and review states.

States: draft -> needs_review -> content_approved (and archived). Content approval is separate
from simulation readiness: no draft is ever runnable in this slice, because none has a validated
deterministic simulation definition. Nothing here touches the active student catalog.
"""

import re
from collections.abc import Iterable
from typing import Any

from app.admin.extract import REQUIRED_FIELDS, Candidate
from app.admin.store import AdminStore

LIST_FIELDS = (
    "aims",
    "apparatus",
    "chemicals",
    "procedure",
    "precautions",
    "calculations",
    "observations",
    "preLabQuestions",
    "postLabQuestions",
)
SCALAR_FIELDS = ("experimentNumber", "title", "syllabusUnit")
ALL_FIELDS = SCALAR_FIELDS + LIST_FIELDS
#: Fields that must be present before content approval.
APPROVAL_FIELDS = ("experimentNumber", "title", *REQUIRED_FIELDS)
#: Simulation kinds the deterministic engine can run (ExperimentDefinitionSchema.kind).
SUPPORTED_SIMULATION_KINDS = ("standard_solution_by_mass",)


class TransitionError(ValueError):
    pass


def draft_from_candidate(
    candidate: Candidate,
    *,
    import_id: str,
    sha256: str,
    document_name: str,
    kind: str,
    extractor: str,
) -> dict[str, Any]:
    data = candidate.as_dict()
    content: dict[str, Any] = {
        "experimentNumber": data["experimentNumber"],
        "title": data["title"],
        "syllabusUnit": data["syllabusUnit"],
        **{f: list(data["fields"][f]) for f in LIST_FIELDS},
    }
    return {
        "importId": import_id,
        "status": "draft",
        "content": content,
        "sourcePages": data["sourcePages"],
        "fieldReview": {f: False for f in ALL_FIELDS},
        "fieldEdited": {f: False for f in ALL_FIELDS},
        "extractionIssues": data["issues"][:200],
        "provenance": {
            "sourceSha256": sha256,
            "documentName": document_name,
            "importKind": kind,
            "extractorVersion": extractor,
            "pageRange": data["pageRange"],
        },
        "translation": {"si": "not_started"},
    }


def _present(content: dict[str, Any], name: str) -> bool:
    value = content.get(name)
    return bool(value) if isinstance(value, list) else value is not None


def _norm_title(title: str | None) -> str:
    text = re.sub(r"^experiment\s*\d+\s*[:.\-–]\s*", "", (title or "").casefold())
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def duplicates(
    draft: dict[str, Any],
    others: Iterable[dict[str, Any]],
    published: Iterable[tuple[str, int, str | None]],
) -> list[dict[str, Any]]:
    """Same experiment number elsewhere. Same-document and conflicting drafts block approval;
    a published practical with the same number is informational (a future update candidate)."""
    number = draft["content"]["experimentNumber"]
    if number is None:
        return []
    title = _norm_title(draft["content"]["title"])
    found: list[dict[str, Any]] = []
    for other in others:
        if other["id"] == draft["id"] or other["status"] == "archived":
            continue
        if other["content"]["experimentNumber"] != number:
            continue
        same_import = other["importId"] == draft["importId"]
        conflicting = _norm_title(other["content"]["title"]) != title
        found.append(
            {
                "kind": "document" if same_import else "draft",
                "experimentNumber": number,
                "otherId": other["id"],
                "otherTitle": other["content"]["title"],
                "conflictingTitle": conflicting,
                "blocking": True,
            }
        )
    for experiment_id, published_number, published_title in published:
        if published_number == number:
            found.append(
                {
                    "kind": "published",
                    "experimentNumber": number,
                    "otherId": experiment_id,
                    "otherTitle": published_title,
                    "conflictingTitle": bool(published_title)
                    and _norm_title(published_title) != title,
                    "blocking": False,
                }
            )
    return found


def validate(
    draft: dict[str, Any],
    store: AdminStore,
    others: Iterable[dict[str, Any]],
    published: Iterable[tuple[str, int, str | None]],
) -> dict[str, Any]:
    content = draft["content"]
    missing = [f for f in APPROVAL_FIELDS if not _present(content, f)]
    provenance_issues: list[str] = []
    if not store.upload_ok(draft["provenance"]["sourceSha256"]):
        provenance_issues.append("source_document_missing_or_changed")
    unsourced = [f for f in LIST_FIELDS if content[f] and not draft["sourcePages"].get(f)]
    if unsourced:
        provenance_issues.append("fields_without_source_pages")
    dups = duplicates(draft, others, published)
    present = [f for f in ALL_FIELDS if _present(content, f)]
    unreviewed = [f for f in present if not draft["fieldReview"].get(f)]
    blocking = (
        [f"missing:{f}" for f in missing]
        + [f"provenance:{p}" for p in provenance_issues]
        + [f"duplicate:{d['kind']}:{d['otherId']}" for d in dups if d["blocking"]]
    )
    warnings = (
        [f"published_number:{d['otherId']}" for d in dups if not d["blocking"]]
        + ["sinhala_translation_not_started"]
        + ["simulation_definition_missing"]
        + [f"edited:{f}" for f, edited in draft["fieldEdited"].items() if edited]
        + [
            f"extraction:{i['code']}"
            for i in draft["extractionIssues"]
            if i["code"] != "missing_field"
        ]
    )
    return {
        "contentComplete": not missing,
        "missingFields": missing,
        "provenanceOk": not provenance_issues,
        "provenanceIssues": provenance_issues,
        "duplicates": dups,
        "sinhalaReview": draft["translation"]["si"],
        "reviewComplete": not unreviewed,
        "unreviewedFields": unreviewed,
        "simulation": {
            "status": "simulation_pending",
            "reason": "no_validated_definition",
            "supportedKinds": list(SUPPORTED_SIMULATION_KINDS),
        },
        "runnable": False,
        "canApproveContent": not blocking and not unreviewed,
        "blocking": blocking,
        "warnings": sorted(set(warnings)),
    }


def apply_edit(
    record: dict[str, Any], content: dict[str, Any], source_pages: dict[str, list[int]]
) -> dict[str, Any]:
    if record["status"] == "archived":
        raise TransitionError("archived drafts cannot be edited")
    changed = [
        f
        for f in ALL_FIELDS
        if record["content"].get(f) != content.get(f)
        or record["sourcePages"].get(f, []) != source_pages.get(f, [])
    ]
    review = dict(record["fieldReview"])
    edited = dict(record["fieldEdited"])
    for name in changed:
        review[name] = False  # a corrected field must be reviewed again
        edited[name] = True
    status = record["status"]
    if changed and status == "content_approved":
        status = "needs_review"
    return {
        **record,
        "content": content,
        "sourcePages": source_pages,
        "fieldReview": review,
        "fieldEdited": edited,
        "status": status,
    }


def apply_review(
    record: dict[str, Any],
    action: str,
    field: str | None,
    reviewed: bool | None,
    validation: dict[str, Any],
) -> dict[str, Any]:
    status = record["status"]
    if status == "archived":
        raise TransitionError("archived drafts cannot change")
    if action == "mark_field":
        if field not in ALL_FIELDS or reviewed is None:
            raise TransitionError("mark_field needs a field and a reviewed value")
        review = {**record["fieldReview"], field: reviewed}
        new_status = "needs_review" if status == "content_approved" else status
        return {**record, "fieldReview": review, "status": new_status}
    if action == "submit_for_review":
        if status != "draft":
            raise TransitionError("only drafts can be submitted for review")
        return {**record, "status": "needs_review"}
    if action == "approve_content":
        if status != "needs_review":
            raise TransitionError("only drafts under review can be approved")
        if not validation["canApproveContent"]:
            raise TransitionError("validation does not allow content approval yet")
        return {**record, "status": "content_approved"}
    if action == "return_to_draft":
        if status not in ("needs_review", "content_approved"):
            raise TransitionError("only reviewed drafts can be returned")
        return {**record, "status": "draft"}
    if action == "archive":
        return {**record, "status": "archived"}
    raise TransitionError("unknown action")


def summary(draft: dict[str, Any], validation: dict[str, Any]) -> dict[str, Any]:
    content = draft["content"]
    return {
        "id": draft["id"],
        "version": draft["version"],
        "status": draft["status"],
        "experimentNumber": content["experimentNumber"],
        "title": content["title"],
        "syllabusUnit": content["syllabusUnit"],
        "documentName": draft["provenance"]["documentName"],
        "importId": draft["importId"],
        "updatedAt": draft["updatedAt"],
        "validation": {
            "contentComplete": validation["contentComplete"],
            "blockingCount": len(validation["blocking"]),
            "warningCount": len(validation["warnings"]),
            "canApproveContent": validation["canApproveContent"],
            "simulation": "simulation_pending",
        },
    }
