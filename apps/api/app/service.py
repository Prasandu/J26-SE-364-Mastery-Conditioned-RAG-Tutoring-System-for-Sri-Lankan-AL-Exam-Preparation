"""Session use cases. The server never trusts client state, consequences, scores or reports: it
rebuilds everything from the canonical definition, assessment and stored events via the verifier."""

import asyncio
import hashlib
import json
import secrets
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from starlette.concurrency import run_in_threadpool

from app.errors import ApiError
from app.models import ActionSubmission, CreateSessionRequest, NotebookSaveRequest
from app.principal import Principal
from app.repositories import (
    ConflictError,
    ExperimentRecord,
    ReportCacheKey,
    Repositories,
    SessionRecord,
    StoredEvent,
)
from app.verifier import ExperimentContext, Verifier, VerifierFailure, VerifierRejected

_FAILURE = {
    "unavailable": (503, "verifier_unavailable", "Simulation verifier is unavailable", True),
    "timeout": (504, "verifier_timeout", "Simulation verifier timed out", True),
    "invalid_response": (
        500,
        "verifier_invalid_response",
        "Simulation verifier returned an invalid response",
        False,
    ),
}


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def payload_hash(envelope: dict[str, Any]) -> str:
    """Hash of what the learner asked for (action, actor, acknowledgement); used for idempotency."""
    canonical = json.dumps(envelope, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class SessionService:
    def __init__(
        self,
        repos: Repositories,
        verifier: Verifier,
        *,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        seed: Callable[[], int] = lambda: secrets.randbelow(2**32),
        utc_offset_minutes: int = 330,
    ) -> None:
        self._repos = repos
        self._verifier = verifier
        self._now = now
        self._seed = seed
        self._tz = timezone(timedelta(minutes=utc_offset_minutes))
        self._locks: dict[UUID, asyncio.Lock] = {}

    # ------------------------------------------------------------------ helpers
    def _lock(self, session_id: UUID) -> asyncio.Lock:
        return self._locks.setdefault(session_id, asyncio.Lock())

    @staticmethod
    def _context(exp: ExperimentRecord) -> ExperimentContext:
        return ExperimentContext(
            exp.definition, exp.assessment, exp.definition_version, exp.assessment_version
        )

    async def _verify(
        self, op: str, exp: ExperimentRecord, init: dict[str, Any], **kwargs: Any
    ) -> dict[str, Any]:
        try:
            return await run_in_threadpool(
                self._verifier.call, op, self._context(exp), init, **kwargs
            )
        except VerifierFailure as failure:
            status, code, message, retryable = _FAILURE[failure.kind]
            raise ApiError(status, code, message, retryable=retryable) from failure
        except VerifierRejected as rejected:
            if rejected.code == "event_chain_invalid":
                # Stored data no longer replays: never serve it.
                raise ApiError(
                    500, "event_chain_invalid", "Stored event chain failed verification"
                ) from rejected
            if rejected.code == "not_submitted":
                raise ApiError(
                    409, "report_not_available", "The experiment has not been submitted"
                ) from rejected
            if rejected.code == "preview_not_available":
                raise ApiError(
                    400, "preview_not_available", "Preview is not available in this mode"
                ) from rejected
            if rejected.code == "system_action_not_permitted":
                raise ApiError(
                    400, "system_action_not_permitted", "System actions are not permitted"
                ) from rejected
            raise ApiError(
                500, "verifier_invalid_response", "Simulation verifier rejected the request"
            ) from rejected

    def _experiment(self, experiment_id: str) -> ExperimentRecord:
        exp = self._repos.experiments.get(experiment_id)
        if exp is None:
            raise ApiError(404, "not_found", "Experiment not found")
        return exp

    def _experiment_version(
        self, experiment_id: str, definition_version: str, assessment_version: str
    ) -> ExperimentRecord:
        exp = self._repos.experiments.get_version(
            experiment_id, definition_version, assessment_version
        )
        if exp is None:
            raise ApiError(
                409,
                "experiment_version_unavailable",
                "The session's experiment version is no longer available",
                details={
                    "experimentId": experiment_id,
                    "definitionVersion": definition_version,
                    "assessmentVersion": assessment_version,
                },
            )
        return exp

    def _session(
        self, principal: Principal, session_id: UUID
    ) -> tuple[SessionRecord, ExperimentRecord]:
        session = self._repos.sessions.get(session_id, principal.id)
        if session is None:
            raise ApiError(404, "not_found", "Session not found")
        return session, self._experiment_version(
            session.experiment_id, session.definition_version, session.assessment_version
        )

    def owned_session(self, principal: Principal, session_id: UUID) -> SessionRecord:
        """The principal's own session (404 otherwise); the assistant's only view of a session."""
        return self._session(principal, session_id)[0]

    def _notebook_state(self, session_id: UUID) -> dict[str, Any]:
        record = self._repos.notebooks.get(session_id)
        if record is None:
            return {"version": 0, "document": None, "updatedAt": None}
        return {
            "version": record.version,
            "document": record.document,
            "updatedAt": _iso(record.updated_at),
        }

    def _resource(self, session: SessionRecord, view: dict[str, Any]) -> dict[str, Any]:
        return {
            "session": view,
            "locale": session.locale,
            "createdAt": _iso(session.created_at),
            "notebook": self._notebook_state(session.session_id),
        }

    # ------------------------------------------------------------------ experiments
    def list_experiments(self) -> list[dict[str, Any]]:
        return [self._summary(e) for e in self._repos.experiments.list()]

    def experiment_details(self, experiment_id: str) -> dict[str, Any]:
        exp = self._experiment(experiment_id)
        return {"summary": self._summary(exp), "definition": exp.definition}

    @staticmethod
    def _summary(exp: ExperimentRecord) -> dict[str, Any]:
        return {
            "experimentId": exp.experiment_id,
            "experimentNumber": exp.experiment_number,
            "titleKey": exp.title_key,
            "definitionVersion": exp.definition_version,
            "assessmentVersion": exp.assessment_version,
            "active": exp.active,
            "modes": ["automatic", "guided", "manual"],
            "locales": ["en", "si"],
        }

    # ------------------------------------------------------------------ sessions
    async def create_session(
        self, principal: Principal, req: CreateSessionRequest
    ) -> dict[str, Any]:
        exp = self._experiment(req.experimentId)
        if (
            not exp.active
            or req.experimentVersion != exp.definition_version
            or req.assessmentVersion != exp.assessment_version
        ):
            raise ApiError(
                422,
                "experiment_version_unavailable",
                "Requested experiment or assessment version is not available",
                details={
                    "definitionVersion": exp.definition_version,
                    "assessmentVersion": exp.assessment_version,
                },
            )
        now = self._now()
        session_id = uuid.uuid4()
        guidance = (req.guidanceLevel or "beginner") if req.mode == "guided" else None
        seed = self._seed()
        started_on = now.astimezone(self._tz).date().isoformat()
        init: dict[str, Any] = {
            "sessionId": str(session_id),
            "mode": req.mode,
            "guidanceLevel": guidance,
            "seed": seed,
            "startedOn": started_on,
        }
        result = await self._verify("initialize", exp, init)
        record = SessionRecord(
            session_id=session_id,
            owner_id=principal.id,
            experiment_id=exp.experiment_id,
            definition_version=exp.definition_version,
            assessment_version=exp.assessment_version,
            mode=req.mode,
            guidance_level=guidance,
            locale=req.locale,
            seed=seed,
            started_on=started_on,
            created_at=now,
            prelab=req.preLab.model_dump() if req.preLab else None,
            status="active",
            next_sequence=0,
            head_fingerprint=result["headFingerprint"],
        )
        self._repos.sessions.create(record)
        return self._resource(record, result["view"])

    async def get_session(self, principal: Principal, session_id: UUID) -> dict[str, Any]:
        session, exp = self._session(principal, session_id)
        events = [e.event for e in self._repos.events.list(session_id)]
        result = await self._verify("view", exp, session.init(), events=events)
        return self._resource(session, result["view"])

    async def submit_action(
        self, principal: Principal, session_id: UUID, sub: ActionSubmission
    ) -> dict[str, Any]:
        session, exp = self._session(principal, session_id)
        submitted = sub.envelope.model_dump()
        async with self._lock(session_id):
            session, exp = self._session(principal, session_id)
            if not sub.preview:
                existing = self._repos.events.find_by_client_action(session_id, sub.clientActionId)
                if existing is not None:
                    if existing.payload_sha256 != payload_hash(submitted):
                        raise ApiError(
                            409,
                            "idempotency_key_reused",
                            "clientActionId was used for a different action",
                        )
                    return existing.response  # a retry: same response, no new event
            if sub.expectedSequence != session.next_sequence:
                raise ApiError(
                    409,
                    "stale_sequence",
                    "The session has moved on; reload before acting",
                    details={"currentSequence": session.next_sequence},
                )
            stored = self._repos.events.list(session_id)
            events = [e.event for e in stored]
            last_elapsed = events[-1]["elapsedMs"] if events else 0
            elapsed = max(
                last_elapsed, int((self._now() - session.created_at).total_seconds() * 1000)
            )
            # The server stamps elapsed time; the rest of the envelope is limited by its contract.
            envelope = {**submitted, "elapsedMs": elapsed}

            if sub.preview:
                return await self._verify(
                    "preview", exp, session.init(), events=events, envelope=envelope
                )

            result = await self._verify(
                "apply", exp, session.init(), events=events, envelope=envelope
            )
            view = result["view"]
            response = {
                "event": view["events"][-1],
                "feedback": result["feedback"],
                "session": view,
            }
            try:
                self._repos.events.commit_action(
                    StoredEvent(
                        session_id=session_id,
                        sequence=result["event"]["seq"],
                        client_action_id=sub.clientActionId,
                        payload_sha256=payload_hash(submitted),
                        event=result["event"],
                        response=response,
                        created_at=self._now(),
                    ),
                    head_fingerprint=result["headFingerprint"],
                    status=view["status"],
                )
            except ConflictError as conflict:
                raise ApiError(409, "stale_sequence", "Concurrent update detected") from conflict
            return response

    # ------------------------------------------------------------------ notebook
    def save_notebook(
        self, principal: Principal, session_id: UUID, req: NotebookSaveRequest
    ) -> dict[str, Any]:
        self._session(principal, session_id)
        try:
            record = self._repos.notebooks.save(
                session_id, req.expectedVersion, req.document, self._now()
            )
        except ConflictError as conflict:
            raise ApiError(
                409,
                "notebook_version_conflict",
                "The notebook was saved elsewhere; reload before saving",
                details={"currentVersion": conflict.current},
            ) from conflict
        return {"version": record.version, "updatedAt": _iso(record.updated_at)}

    # ------------------------------------------------------------------ report
    async def report(self, principal: Principal, session_id: UUID) -> dict[str, Any]:
        session, exp = self._session(principal, session_id)
        if session.status != "submitted":
            raise ApiError(409, "report_not_available", "The experiment has not been submitted")
        key = ReportCacheKey(
            session_id=session_id,
            engine_version=self._verifier.engine_version,
            definition_version=session.definition_version,
            assessment_version=session.assessment_version,
            head_fingerprint=session.head_fingerprint,
        )
        cached = self._repos.reports.get(key)
        if cached is not None:
            return cached
        events = [e.event for e in self._repos.events.list(session_id)]
        result = await self._verify("report", exp, session.init(), events=events)
        if result["headFingerprint"] != session.head_fingerprint:
            raise ApiError(500, "event_chain_invalid", "Stored event chain failed verification")
        report: dict[str, Any] = result["report"]
        self._repos.reports.put(key, report)
        return report
