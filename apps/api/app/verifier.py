"""Python adapter for the bundled simulation-core verifier CLI (D1).

Security: fixed executable and script paths from configuration, an argument array with
``shell=False``, JSON only on stdin/stdout, a strict timeout, size limits, a minimal inherited
environment and a controlled working directory. stderr is never returned to clients.
Every call starts a new Node process; that overhead is an accepted M1 limitation.
"""

import json
import logging
import os
import subprocess  # noqa: S404 - fixed argv, shell=False, no user input in the command
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from app.contracts import ContractRegistry

logger = logging.getLogger("vlab.verifier")

PROTOCOL = 1
_ENV_ALLOWLIST = ("SYSTEMROOT", "SystemRoot", "WINDIR", "TEMP", "TMP")


class VerifierFailure(Exception):
    """Infrastructure failure: unavailable (503), timeout (504) or invalid response (500)."""

    def __init__(self, kind: str) -> None:
        super().__init__(kind)
        self.kind = kind  # 'unavailable' | 'timeout' | 'invalid_response'


class VerifierRejected(Exception):
    """Protocol-level rejection reported by the engine (e.g. tampered chain, not submitted)."""

    def __init__(self, code: str, diverged_at_seq: int | None) -> None:
        super().__init__(code)
        self.code = code
        self.diverged_at_seq = diverged_at_seq


@dataclass(frozen=True)
class ExperimentContext:
    definition: dict[str, Any]
    assessment: dict[str, Any]
    definition_version: str
    assessment_version: str


class Verifier(Protocol):
    def call(
        self,
        op: str,
        experiment: ExperimentContext,
        init: dict[str, Any],
        events: list[dict[str, Any]] | None = None,
        envelope: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...

    def ready(self) -> bool: ...

    @property
    def engine_version(self) -> str: ...


class NodeCliVerifier:
    def __init__(
        self,
        *,
        node: str | None,
        script: Path,
        engine_version: str,
        contracts: ContractRegistry,
        timeout_seconds: float,
        max_bytes: int,
    ) -> None:
        self._node = node
        self._script = script
        self._engine_version = engine_version
        self._contracts = contracts
        self._timeout = timeout_seconds
        self._max_bytes = max_bytes

    @property
    def engine_version(self) -> str:
        return self._engine_version

    def ready(self) -> bool:
        return bool(self._node) and Path(self._node or "").is_file() and self._script.is_file()

    def _argv(self) -> list[str]:
        if not self.ready() or self._node is None:
            raise VerifierFailure("unavailable")
        return [self._node, str(self._script)]

    @staticmethod
    def _env() -> dict[str, str]:
        env = {k: v for k, v in os.environ.items() if k in _ENV_ALLOWLIST}
        env["NODE_ENV"] = "production"
        return env

    def call(
        self,
        op: str,
        experiment: ExperimentContext,
        init: dict[str, Any],
        events: list[dict[str, Any]] | None = None,
        envelope: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        request: dict[str, Any] = {
            "protocol": PROTOCOL,
            "op": op,
            "expected": {
                "engineVersion": self._engine_version,
                "definitionVersion": experiment.definition_version,
                "assessmentVersion": experiment.assessment_version,
            },
            "definition": experiment.definition,
            "assessment": experiment.assessment,
            "init": init,
        }
        if events is not None:
            request["events"] = events
        if envelope is not None:
            request["envelope"] = envelope
        payload = json.dumps(request, separators=(",", ":")).encode("utf-8")
        if len(payload) > self._max_bytes:
            logger.error("verifier_request_too_large bytes=%d", len(payload))
            raise VerifierFailure("invalid_response")

        argv = self._argv()
        try:
            proc = subprocess.Popen(  # noqa: S603 - fixed argv from configuration
                argv,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(self._script.parent),
                env=self._env(),
                shell=False,
            )
        except OSError as exc:
            logger.error("verifier_spawn_failed type=%s", type(exc).__name__)
            raise VerifierFailure("unavailable") from exc
        try:
            stdout, stderr = proc.communicate(payload, timeout=self._timeout)
        except subprocess.TimeoutExpired as exc:
            proc.kill()
            proc.communicate()
            logger.error("verifier_timeout op=%s", op)
            raise VerifierFailure("timeout") from exc

        if proc.returncode != 0:
            logger.error(
                "verifier_exit op=%s code=%s stderr_bytes=%d", op, proc.returncode, len(stderr)
            )
            raise VerifierFailure("invalid_response")
        if len(stdout) > self._max_bytes:
            logger.error("verifier_output_too_large op=%s bytes=%d", op, len(stdout))
            raise VerifierFailure("invalid_response")
        try:
            response = json.loads(stdout)
        except ValueError as exc:
            logger.error("verifier_malformed_json op=%s", op)
            raise VerifierFailure("invalid_response") from exc
        if not self._contracts.is_valid("verifier-response", response):
            logger.error("verifier_contract_violation op=%s", op)
            raise VerifierFailure("invalid_response")
        if response["engineVersion"] != self._engine_version:
            logger.error("verifier_engine_version_mismatch")
            raise VerifierFailure("invalid_response")
        if not response["ok"]:
            error = response["error"]
            if error["code"] in ("version_mismatch", "invalid_request", "internal"):
                logger.error("verifier_rejected_request code=%s", error["code"])
                raise VerifierFailure("invalid_response")
            raise VerifierRejected(error["code"], error.get("divergedAtSeq"))
        if response["op"] != op:
            logger.error("verifier_op_mismatch op=%s", op)
            raise VerifierFailure("invalid_response")
        result: dict[str, Any] = response["result"]
        return result
