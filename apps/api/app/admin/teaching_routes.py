"""Data-only simulation authoring on the developer's machine. Never a public publisher.

Records use the existing atomic/integrity-checked file store in a separate private subtree.
PostgreSQL is deliberately unsupported here; no database/schema changes are made.
"""

import threading
import math
from typing import Any

from fastapi import FastAPI, Request
from pydantic import BaseModel, ConfigDict

from app.admin.common import AdminApi, storage_errors
from app.admin.store import AdminStore, VersionConflict, now_iso
from app.errors import ApiError

_lock = threading.RLock()
_stores: dict[str, AdminStore] = {}


class SaveModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    expectedVersion: int | None
    definition: dict[str, Any]


class ActivateModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    expectedVersion: int
    reviewer: str
    reviewedSources: bool


def semantic_issues(d: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    def nonblank(value: Any) -> bool:
        if isinstance(value, dict):
            if set(value) == {"en", "si"}:
                return bool(value["en"].strip() and value["si"].strip())
            return all(nonblank(v) for v in value.values())
        if isinstance(value, list):
            return all(nonblank(v) for v in value)
        return not isinstance(value, float) or math.isfinite(value)
    if not nonblank(d) or any(not s["title"].strip() for s in d["sources"]):
        issues.append("invalid_value")
    kinds = {a["kind"] for a in d["apparatus"]}
    if len(kinds) != len(d["apparatus"]):
        issues.append("duplicate_instrument_kind")
    required = {
        "test_tubes": {"test_tube"},
        "gas_collection": {"boiling_tube", "retort_stand", "burner", "delivery_tube", "gas_collector", "water_bath"},
        "ice_bath": {"ice_bath", "test_tube"},
        "inverted_tube": {"gas_collector", "beaker", "stopwatch"},
    }[d["layout"]]
    if not required.issubset(kinds):
        issues.append("layout_instruments")
    if d["template"] == "fixed_volume_kinetics" and d["layout"] != "inverted_tube":
        issues.append("kinetics_layout")
    for group in (d["apparatus"], d["samples"], d["tests"]):
        if len({x["id"] for x in group}) != len(group):
            issues.append("duplicate_id")
    instruments = {x["id"] for x in d["apparatus"]}
    samples = {x["id"] for x in d["samples"]}
    tests = {x["id"] for x in d["tests"]}
    for source in d["sources"]:
        if not source["pdfPages"] and not source["url"]:
            issues.append("source_reference")
    for test in d["tests"]:
        if len({s["id"] for s in test["steps"]}) != len(test["steps"]):
            issues.append("duplicate_step")
        if any(s["apparatusId"] not in instruments for s in test["steps"]):
            issues.append("unknown_apparatus")
        span = test["temperatureRangeC"]
        if span and span[0] > span[1]:
            issues.append("temperature_range")
    seen: set[tuple[str, str]] = set()
    for o in d["outcomes"]:
        if (o["visual"] == "precipitate") != (o["precipitateColour"] is not None):
            issues.append("precipitate_appearance")
        pair = (o["sampleId"], o["testId"])
        if pair in seen:
            issues.append("duplicate_outcome")
        seen.add(pair)
        if o["sampleId"] not in samples or o["testId"] not in tests:
            issues.append("unknown_selection")
        if any(i >= len(d["sources"]) for i in o["sourceIndexes"]):
            issues.append("outcome_source")
    concentrations = d["concentrationsMolDm3"]
    if d["template"] == "reaction_comparison":
        if concentrations:
            issues.append("unexpected_concentrations")
        if any((s, t) not in seen for s in samples for t in tests):
            issues.append("missing_outcome")
    elif (
        len(concentrations) < 3
        or len(set(concentrations)) != len(concentrations)
        or d["outcomes"]
        or len(samples) != 1
        or len(tests) != 1
    ):
        issues.append("kinetics_configuration")
    return sorted(set(issues))


def register_teaching_routes(app: FastAPI, api: AdminApi) -> None:
    def guarded(request: Request) -> tuple[Any, AdminStore, AdminStore]:
        st, audit_store = api.guard(request)
        if not isinstance(audit_store, AdminStore):
            raise ApiError(409, "invalid_request", "Local simulation authoring requires file storage")
        root = str(audit_store.root / "teaching-models")
        with _lock:
            if root not in _stores:
                _stores[root] = AdminStore(audit_store.root / "teaching-models")
            return st, _stores[root], audit_store

    def public(st: Any, record: dict[str, Any]) -> dict[str, Any]:
        result = api.public(record)
        return api.checked(st, "api-teaching-record", result)

    @app.get("/admin/dev/simulation-models")
    def list_models(request: Request) -> list[dict[str, Any]]:
        st, store, _ = guarded(request)
        return [public(st, r) for r in api.records(store, "drafts")]

    async def save(request: Request, record_id: str | None) -> dict[str, Any]:
        st, store, audit_store = guarded(request)
        req = await api.read_json(request, "api-teaching-save", SaveModel)
        definition = req.definition
        issues = semantic_issues(definition)
        if definition["experimentNumber"] <= 30 or definition["id"].startswith("handbook-"):
            issues.append("reserved_practical")
        if issues:
            raise ApiError(422, "invalid_request", "Simulation package failed validation", details={"issues": issues})
        with _lock:
            records = api.records(store, "drafts")
            if any(
                r["id"] != record_id and (
                    r["definition"]["id"] == definition["id"]
                    or r["definition"]["experimentNumber"] == definition["experimentNumber"]
                ) for r in records
            ):
                raise ApiError(409, "duplicate_practical", "Choose a different local model identity and number")
            data = {"definition": definition, "status": "staged", "review": None}
            with storage_errors():
                if record_id is None:
                    if req.expectedVersion is not None:
                        raise ApiError(422, "invalid_request", "A new model has no record version")
                    record = store.create("drafts", data)
                else:
                    old = api.load(store, "drafts", record_id)
                    if req.expectedVersion != old["version"]:
                        raise VersionConflict(old["version"])
                    if req.expectedVersion is None or definition["id"] != old["definition"]["id"] or definition["experimentNumber"] != old["definition"]["experimentNumber"] or definition["revision"] <= old["definition"]["revision"]:
                        raise ApiError(422, "invalid_request", "Keep the identity and increment the definition revision")
                    record = store.update("drafts", record_id, req.expectedVersion, lambda _old: data)
            api.audit(audit_store, "simulation.saved", "simulation", record["id"], revision=definition["revision"], template=definition["template"])
        return public(st, record)

    @app.post("/admin/dev/simulation-models", status_code=201)
    async def create_model(request: Request) -> dict[str, Any]:
        return await save(request, None)

    @app.put("/admin/dev/simulation-models/{record_id}")
    async def update_model(record_id: str, request: Request) -> dict[str, Any]:
        return await save(request, record_id)

    @app.post("/admin/dev/simulation-models/{record_id}/activate-local")
    async def activate_model(record_id: str, request: Request) -> dict[str, Any]:
        st, store, audit_store = guarded(request)
        req = await api.read_json(request, "api-teaching-activate", ActivateModel)
        if not req.reviewer.strip():
            raise ApiError(422, "invalid_request", "Enter a local review attestation name")
        with _lock:
            old = api.load(store, "drafts", record_id)
            if semantic_issues(old["definition"]):
                raise ApiError(422, "invalid_request", "Invalid simulation package")
            with storage_errors():
                record = store.update("drafts", record_id, req.expectedVersion, lambda current: {
                    **current, "status": "local_active",
                    "review": {"reviewer": req.reviewer.strip(), "date": now_iso()},
                })
            api.audit(audit_store, "simulation.activated_local", "simulation", record_id, revision=record["definition"]["revision"])
        return public(st, record)
