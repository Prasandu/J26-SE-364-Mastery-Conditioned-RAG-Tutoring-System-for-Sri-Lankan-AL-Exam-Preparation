"""Cross-implementation checks.

* Parity: action sequences recorded from the in-process TypeScript engine (packages/contracts/
  fixtures/parity) replayed over HTTP must yield the same public events, feedback, views and
  report, ignoring server-assigned session IDs and elapsed times.
* Compatibility: representative TypeScript-generated API payloads validate against the exported
  JSON Schemas and parse into the Pydantic request models.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.contracts import ContractRegistry
from app.models import ActionSubmission, CreateSessionRequest, NotebookSaveRequest
from tests.conftest import lab, load_fixture, make_settings, start, strip_volatile, submission

CONTRACTS = ContractRegistry(make_settings().schema_dir)


@pytest.mark.parametrize(
    "name", ["perfect-guided-beginner", "manual-hidden-errors", "manual-zero-solute"]
)
def test_api_matches_local_engine_public_behaviour(client: TestClient, name: str) -> None:
    fixture = load_fixture(f"parity/{name}.json")
    init = fixture["init"]
    sid = start(client, init["mode"], init["guidanceLevel"])["session"]["sessionId"]
    for i, step in enumerate(fixture["steps"]):
        response = client.post(f"/sessions/{sid}/actions", json=submission(step["envelope"], i))
        assert response.status_code == 200
        assert strip_volatile(response.json()) == strip_volatile(step["expected"]), f"step {i}"
    report = client.get(f"/sessions/{sid}/report").json()
    assert strip_volatile(report) == strip_volatile(fixture["finalReport"])


@pytest.mark.parametrize(
    ("fixture", "schema", "model"),
    [
        ("api/create-session-request.json", "api-create-session-request", CreateSessionRequest),
        ("api/action-submission.json", "api-action-submission", ActionSubmission),
        ("api/notebook-save-request.json", "api-notebook-save-request", NotebookSaveRequest),
    ],
)
def test_typescript_requests_parse_in_python(fixture: str, schema: str, model: Any) -> None:
    data = load_fixture(fixture)
    assert CONTRACTS.errors(schema, data) == []
    parsed = model.model_validate(data)
    assert parsed.model_dump(mode="json") == data


@pytest.mark.parametrize(
    ("fixture", "schema"),
    [("api/session-resource.json", "api-session-resource"), ("api/error.json", "api-error")],
)
def test_typescript_responses_match_schemas(fixture: str, schema: str) -> None:
    assert CONTRACTS.errors(schema, load_fixture(fixture)) == []


def test_python_responses_match_typescript_schemas(client: TestClient) -> None:
    contracts = lab(client.app).contracts  # type: ignore[arg-type]
    assert contracts.errors("api-health", client.get("/health").json()) == []
    for summary in client.get("/experiments").json():
        assert contracts.errors("api-experiment-summary", summary) == []
    details = client.get("/experiments/exp04_standard_solution").json()
    assert contracts.errors("api-experiment-details", details) == []
    error = client.get("/sessions/00000000-0000-4000-8000-000000000000").json()
    assert contracts.errors("api-error", error) == []
