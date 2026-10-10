import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.contracts import ContractRegistry
from app.verifier import ExperimentContext, NodeCliVerifier, VerifierFailure, VerifierRejected
from tests.conftest import build_app, create_request, make_settings

SETTINGS = make_settings()
CONTRACTS = ContractRegistry(SETTINGS.schema_dir)
DEFINITION = json.loads(
    (SETTINGS.content_dir / "experiments/exp04/definition.v1.json").read_text("utf-8")
)
ASSESSMENT = json.loads(
    (SETTINGS.content_dir / "experiments/exp04/assessment.v1.json").read_text("utf-8")
)
EXPERIMENT = ExperimentContext(DEFINITION, ASSESSMENT, "1.1.0", "1.0.0")
INIT = {
    "sessionId": "s",
    "mode": "manual",
    "guidanceLevel": None,
    "seed": 1,
    "startedOn": "2026-10-10",
}


def real_verifier(**over: Any) -> NodeCliVerifier:
    kwargs: dict[str, Any] = {
        "node": SETTINGS.resolved_node(),
        "script": SETTINGS.verifier_script,
        "engine_version": SETTINGS.engine_version(),
        "contracts": CONTRACTS,
        "timeout_seconds": 10.0,
        "max_bytes": 4 * 1024 * 1024,
    }
    return NodeCliVerifier(**{**kwargs, **over})


def fake_verifier(tmp_path: Path, body: str, **over: Any) -> NodeCliVerifier:
    """A stand-in 'CLI' run by the Python interpreter, to simulate misbehaviour."""
    script = tmp_path / "fake_cli.py"
    script.write_text(body, encoding="utf-8")
    return real_verifier(node=sys.executable, script=script, **over)


def test_initialize_and_verify_with_the_built_cli() -> None:
    verifier = real_verifier()
    assert verifier.ready()
    result = verifier.call("initialize", EXPERIMENT, INIT)
    assert result["view"]["nextSequence"] == 0
    assert verifier.call("verify", EXPERIMENT, INIT, events=[])["eventCount"] == 0


def test_invocation_uses_fixed_argv_without_shell(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}
    real_popen = subprocess.Popen

    def spy(argv: list[str], **kwargs: Any) -> Any:
        captured["argv"] = argv
        captured["kwargs"] = kwargs
        return real_popen(argv, **kwargs)

    monkeypatch.setattr(subprocess, "Popen", spy)
    real_verifier().call("initialize", EXPERIMENT, {**INIT, "sessionId": "x; rm -rf /"})
    assert captured["argv"] == [SETTINGS.resolved_node(), str(SETTINGS.verifier_script)]
    assert captured["kwargs"]["shell"] is False
    assert set(captured["kwargs"]["env"]) <= {
        "SYSTEMROOT",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "NODE_ENV",
    }
    assert captured["kwargs"]["cwd"] == str(SETTINGS.verifier_script.parent)


def test_missing_executable_is_unavailable(tmp_path: Path) -> None:
    verifier = real_verifier(script=tmp_path / "missing.mjs")
    assert not verifier.ready()
    with pytest.raises(VerifierFailure) as exc:
        verifier.call("initialize", EXPERIMENT, INIT)
    assert exc.value.kind == "unavailable"


def test_timeout(tmp_path: Path) -> None:
    verifier = fake_verifier(tmp_path, "import time\ntime.sleep(5)\n", timeout_seconds=0.5)
    with pytest.raises(VerifierFailure) as exc:
        verifier.call("initialize", EXPERIMENT, INIT)
    assert exc.value.kind == "timeout"


VERIFY_OK = {
    "protocol": 1,
    "ok": True,
    "engineVersion": SETTINGS.engine_version(),
    "op": "verify",
    "result": {"headFingerprint": "a", "eventCount": 0},
}


def respond(payload: dict[str, Any]) -> str:
    """Fake CLI body that ignores its input and prints a fixed JSON payload."""
    return f"import sys\nsys.stdin.read()\nsys.stdout.write({json.dumps(json.dumps(payload))})\n"


@pytest.mark.parametrize(
    "body",
    [
        "import sys\nsys.stdin.read()\nprint('not json')\n",
        "import sys\nsys.stdin.read()\nsys.stdout.write('x' * 5000)\n",
        "import sys\nsys.stdin.read()\nsys.stderr.write('secret path C:/x')\nsys.exit(3)\n",
        respond({**VERIFY_OK, "engineVersion": "9.9.9"}),
        respond({**VERIFY_OK, "extra": 1}),
        respond({**VERIFY_OK, "op": "initialize", "result": {}}),
    ],
    ids=[
        "malformed-json",
        "excessive-output",
        "non-zero-exit",
        "engine-version",
        "extra-field",
        "contract",
    ],
)
def test_invalid_responses(tmp_path: Path, body: str) -> None:
    verifier = fake_verifier(tmp_path, body, max_bytes=4096 * 1024 if "5000" not in body else 1000)
    with pytest.raises(VerifierFailure) as exc:
        verifier.call("initialize", EXPERIMENT, INIT)
    assert exc.value.kind == "invalid_response"


def test_version_mismatch_is_a_server_fault() -> None:
    mismatched = ExperimentContext(DEFINITION, ASSESSMENT, "0.0.1", "1.0.0")
    with pytest.raises(VerifierFailure):
        real_verifier().call("initialize", mismatched, INIT)
    with pytest.raises(VerifierFailure):
        real_verifier(engine_version="9.9.9").call("initialize", EXPERIMENT, INIT)


def test_tampered_chain_is_rejected() -> None:
    verifier = real_verifier()
    from tests.conftest import load_fixture

    fixture = load_fixture("parity/perfect-guided-beginner.json")
    guided_init = {**fixture["init"]}
    # Rebuild a genuine chain through the CLI, then tamper with one event.
    events: list[dict[str, Any]] = []
    for i, step in enumerate(fixture["steps"][:4]):
        envelope = {**step["envelope"], "elapsedMs": (i + 1) * 1000}
        events.append(
            verifier.call("apply", EXPERIMENT, guided_init, events=events, envelope=envelope)[
                "event"
            ]
        )
    events[2]["fingerprintAfter"] = "0" * 14
    with pytest.raises(VerifierRejected) as exc:
        verifier.call("verify", EXPERIMENT, guided_init, events=events)
    assert exc.value.code == "event_chain_invalid"
    assert exc.value.diverged_at_seq == 2


@pytest.mark.parametrize(
    ("kind", "status", "code", "retryable"),
    [
        ("unavailable", 503, "verifier_unavailable", True),
        ("timeout", 504, "verifier_timeout", True),
        ("invalid_response", 500, "verifier_invalid_response", False),
    ],
)
def test_api_maps_verifier_failures(kind: str, status: int, code: str, retryable: bool) -> None:
    class Broken:
        engine_version = "0.0.0"

        def ready(self) -> bool:
            return True

        def call(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
            raise VerifierFailure(kind)

    with TestClient(build_app(verifier=Broken())) as client:
        response = client.post("/sessions", json=create_request())
    assert response.status_code == status
    error = response.json()["error"]
    assert error["code"] == code and error["retryable"] is retryable
    assert "fake_cli" not in response.text and "stderr" not in response.text
