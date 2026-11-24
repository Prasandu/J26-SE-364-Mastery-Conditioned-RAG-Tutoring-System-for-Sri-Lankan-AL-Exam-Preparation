"""Draft lifecycle: creation from extraction candidates, validation, edits and review states.

States: draft -> needs_review -> content_approved (and archived). Content approval is separate
from simulation readiness: no draft is ever runnable in this slice, because none has a validated
deterministic simulation definition. Nothing here touches the active student catalog.
"""

import re
from collections.abc import Iterable
from typing import Any, Protocol

from app.admin.extract import REQUIRED_FIELDS, Candidate


class UploadCheck(Protocol):
    def upload_ok(self, sha256: str) -> bool: ...


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


#: Word-shingle Jaccard similarity at which two practicals count as the same content.
CONTENT_DUPLICATE_THRESHOLD = 0.6
#: Fields compared for content duplicates (the experimental substance, not the questions).
CONTENT_FIELDS = ("aims", "apparatus", "chemicals", "procedure", "precautions")
SHINGLE = 4

#: A published practical as seen by duplicate checks: (id, number, English title, English text).
Published = tuple[str, int, str | None, str]


#: Longest list item kept as one entry; longer extracted paragraphs are split at sentences.
MAX_ITEM_CHARS = 1000
#: Dotted / underlined answer spaces copied from worksheets ("......", "______").
PLACEHOLDER = re.compile(r"[.·…_]{4,}|[-–—]{4,}")
#: Required list fields a reviewer may confirm as "not given in the source document".
CONFIRMABLE_ABSENT = tuple(f for f in REQUIRED_FIELDS if f in LIST_FIELDS)


class TransitionError(ValueError):
    pass


def split_long(item: str, limit: int = MAX_ITEM_CHARS) -> list[str]:
    """Splits an over-long extracted paragraph at sentence ends (words are never cut)."""
    if len(item) <= limit:
        return [item]
    parts: list[str] = []
    current = ""
    for sentence in re.split(r"(?<=[.!?;])\s+", item):
        while len(sentence) > limit:  # a single very long sentence: break at a space
            cut = sentence.rfind(" ", 0, limit)
            cut = cut if cut > limit // 2 else limit
            head, sentence = sentence[:cut].strip(), sentence[cut:].strip()
            if current:
                parts.append(current)
                current = ""
            parts.append(head)
        if current and len(current) + 1 + len(sentence) > limit:
            parts.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        parts.append(current)
    return [x for x in parts if x]


def clean_items(items: list[str]) -> list[str]:
    """Deterministic clean-up: answer-space dots removed, blank and repeated items dropped,
    over-long paragraphs split. Never adds or rewrites words."""
    out: list[str] = []
    for item in items:
        text = re.sub(r"\s+", " ", PLACEHOLDER.sub(" ", item)).strip(" :;,")
        if not re.search(r"[^\W_]", text):
            continue
        for part in split_long(text):
            if part not in out:
                out.append(part)
    return out


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
        **{f: [p for i in data["fields"][f] for p in split_long(i)] for f in LIST_FIELDS},
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
        "distinctFrom": [],
        "absentConfirmed": [],
    }


def _present(content: dict[str, Any], name: str) -> bool:
    value = content.get(name)
    return bool(value) if isinstance(value, list) else value is not None


def _norm_title(title: str | None) -> str:
    text = re.sub(r"^experiment\s*\d+\s*[:.\-–]\s*", "", (title or "").casefold())
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def shingles(text: str) -> set[str]:
    """Overlapping 4-word sequences of the normalised text (a content fingerprint)."""
    words = re.findall(r"[a-z0-9]+", text.casefold())
    if len(words) < SHINGLE:
        return set(words)
    return {" ".join(words[i : i + SHINGLE]) for i in range(len(words) - SHINGLE + 1)}


def content_text(content: dict[str, Any]) -> str:
    return "\n".join(item for f in CONTENT_FIELDS for item in content.get(f) or [])


def similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def duplicates(
    draft: dict[str, Any],
    others: Iterable[dict[str, Any]],
    published: Iterable[Published],
) -> list[dict[str, Any]]:
    """Duplicate findings, by identity (same experiment number) and by content (shingle
    similarity of the experimental substance, whatever the number says).

    * Same number in another live draft or the same document: blocks approval.
    * Near-identical content in another live draft: blocks approval unless a reviewer recorded
      that the two practicals are distinct (``distinctFrom``) or archives one of them.
    * A published practical with the same number or near-identical content: informational (an
      update candidate); publishing replaces nothing here.
    """
    content = draft["content"]
    number = content["experimentNumber"]
    title = _norm_title(content["title"])
    mine = shingles(content_text(content))
    distinct = set(draft.get("distinctFrom") or [])
    found: list[dict[str, Any]] = []
    for other in others:
        if other["id"] == draft["id"] or other["status"] == "archived":
            continue
        same_import = other["importId"] == draft["importId"]
        other_number = other["content"]["experimentNumber"]
        if number is not None and other_number == number:
            found.append(
                {
                    "kind": "document" if same_import else "draft",
                    "experimentNumber": number,
                    "otherId": other["id"],
                    "otherTitle": other["content"]["title"],
                    "conflictingTitle": _norm_title(other["content"]["title"]) != title,
                    "similarity": None,
                    "blocking": True,
                }
            )
            continue
        score = similarity(mine, shingles(content_text(other["content"])))
        if score >= CONTENT_DUPLICATE_THRESHOLD:
            found.append(
                {
                    "kind": "content",
                    "experimentNumber": other_number,
                    "otherId": other["id"],
                    "otherTitle": other["content"]["title"],
                    "conflictingTitle": _norm_title(other["content"]["title"]) != title,
                    "similarity": round(score, 3),
                    "blocking": other["id"] not in distinct,
                }
            )
    for experiment_id, published_number, published_title, published_text in published:
        score = similarity(mine, shingles(published_text))
        same_number = number is not None and published_number == number
        if same_number or score >= CONTENT_DUPLICATE_THRESHOLD:
            found.append(
                {
                    "kind": "published",
                    "experimentNumber": published_number,
                    "otherId": experiment_id,
                    "otherTitle": published_title,
                    "conflictingTitle": bool(published_title)
                    and _norm_title(published_title) != title,
                    "similarity": round(score, 3) if score else None,
                    "blocking": False,
                }
            )
    return found


def validate(
    draft: dict[str, Any],
    store: UploadCheck,
    others: Iterable[dict[str, Any]],
    published: Iterable[Published],
) -> dict[str, Any]:
    content = draft["content"]
    absent = set(draft.get("absentConfirmed") or [])
    missing = [f for f in APPROVAL_FIELDS if not _present(content, f) and f not in absent]
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
        + [f"absent_confirmed:{f}" for f in sorted(absent)]
        + (["quick_approved"] if draft.get("quickApproved") else [])
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
    # A field that now has content is no longer "not given in the source".
    absent = [f for f in record.get("absentConfirmed") or [] if not content.get(f)]
    return {
        **record,
        "content": content,
        "sourcePages": source_pages,
        "fieldReview": review,
        "fieldEdited": edited,
        "status": status,
        "absentConfirmed": absent,
        "quickApproved": record.get("quickApproved", False) and not changed,
    }


def quick_fix(record: dict[str, Any]) -> dict[str, Any]:
    """Safe, deterministic repairs for common extraction problems (never invents content):

    * list items cleaned (answer-space dots, blanks, repeats) and long paragraphs split;
    * required list fields that are empty are confirmed as "not given in the source document";
    * list fields with content but no source pages get the practical's own page range.

    Changed fields lose their review mark, like any edit. The applied repairs are logged.
    """
    if record["status"] == "archived":
        raise TransitionError("archived drafts cannot change")
    content = dict(record["content"])
    pages = {k: list(v) for k, v in record["sourcePages"].items()}
    review = dict(record["fieldReview"])
    edited = dict(record["fieldEdited"])
    log: list[str] = []
    for field in LIST_FIELDS:
        cleaned = clean_items(content[field])
        if cleaned != content[field]:
            content[field] = cleaned
            review[field], edited[field] = False, True
            log.append(f"cleaned:{field}")
    first, last = record["provenance"]["pageRange"]
    span = list(range(max(1, first), max(first, last) + 1))
    for field in LIST_FIELDS:
        if content[field] and not pages.get(field) and span:
            pages[field] = span
            review[field] = False
            log.append(f"pages:{field}")
    absent = set(record.get("absentConfirmed") or [])
    for field in CONFIRMABLE_ABSENT:
        if not content[field] and field not in absent:
            absent.add(field)
            log.append(f"absent:{field}")
    status = record["status"]
    if log and status == "content_approved":
        status = "needs_review"
    return {
        **record,
        "content": content,
        "sourcePages": pages,
        "fieldReview": review,
        "fieldEdited": edited,
        "absentConfirmed": sorted(absent),
        "quickFixLog": log,
        "status": status,
    }


def apply_review(
    record: dict[str, Any],
    action: str,
    field: str | None,
    reviewed: bool | None,
    validation: dict[str, Any],
    other_id: str | None = None,
) -> dict[str, Any]:
    status = record["status"]
    if status == "archived":
        raise TransitionError("archived drafts cannot change")
    if action == "quick_fix":
        return quick_fix(record)
    if action == "quick_approve":
        if status == "content_approved":
            raise TransitionError("already approved")
        hard = [b for b in validation["blocking"]]
        if hard:
            raise TransitionError("fix the blocking issues first (try Quick fix)")
        present = [f for f in ALL_FIELDS if _present(record["content"], f)]
        review = {**record["fieldReview"], **{f: True for f in present}}
        return {
            **record,
            "fieldReview": review,
            "status": "content_approved",
            "quickApproved": True,
        }
    if action == "mark_distinct":
        flagged = {d["otherId"] for d in validation["duplicates"] if d["kind"] == "content"}
        if not other_id or other_id not in flagged:
            raise TransitionError("mark_distinct needs a content duplicate to dismiss")
        distinct = sorted(set(record.get("distinctFrom") or []) | {other_id})
        return {**record, "distinctFrom": distinct}
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
