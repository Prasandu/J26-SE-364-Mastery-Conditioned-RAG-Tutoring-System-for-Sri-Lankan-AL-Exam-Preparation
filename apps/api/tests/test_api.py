import json
import threading
import uuid
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.principal import FixedPrincipalProvider
from tests.conftest import create_request, lab, load_fixture, start, student, submission

CHECKLIST = [
    "read_procedure",
    "goggles",
    "no_food_drink",
    "closed_shoes",
    "hair_restrained",
    "report_incidents",
]
CONFIRM = student({"type": "confirm_safety", "checklistItemIds": CHECKLIST})


def act(client: TestClient, sid: str, envelope: dict[str, Any], seq: int, **over: Any) -> Any:
    return client.post(f"/sessions/{sid}/actions", json=submission(envelope, seq, **over))


def assert_error(response: Any, status: int, code: str) -> dict[str, Any]:
    assert response.status_code == status, response.text
    body: dict[str, Any] = response.json()
    assert body["error"]["code"] == code
    assert body["error"]["correlationId"]
    text = response.text
    assert "Traceback" not in text and "verifier.mjs" not in text and "stderr" not in text
    return body


# ---------------------------------------------------------------- experiments


def test_list_and_get_experiments(client: TestClient) -> None:
    listed = client.get("/experiments").json()
    assert [e["experimentId"] for e in listed] == ["exp04_standard_solution"]
    assert listed[0]["definitionVersion"] == "1.1.0"
    details = client.get("/experiments/exp04_standard_solution").json()
    assert details["definition"]["experimentNumber"] == 4
    assert_error(client.get("/experiments/exp36"), 404, "not_found")


# ---------------------------------------------------------------- sessions


def test_create_session_returns_201_with_server_generated_state(client: TestClient) -> None:
    body = start(client, "guided", "beginner")
    view = body["session"]
    uuid.UUID(view["sessionId"])
    assert view["mode"] == "guided" and view["guidanceLevel"] == "beginner"
    assert view["nextSequence"] == 0
    assert view["startedOn"] == "2026-10-10"
    assert body["notebook"] == {"version": 0, "document": None, "updatedAt": None}
    assert lab(client.app).contracts.is_valid("api-session-resource", body)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("override", "status", "code"),
    [
        ({"experimentVersion": "0.9.0"}, 422, "experiment_version_unavailable"),
        ({"assessmentVersion": "2.0.0"}, 422, "experiment_version_unavailable"),
        ({"experimentId": "exp99"}, 404, "not_found"),
        ({"mode": "freestyle"}, 422, "invalid_request"),
        ({"lab": {"stage": "complete"}}, 422, "invalid_request"),
        ({"ownerId": "someone-else"}, 422, "invalid_request"),
    ],
)
def test_create_session_rejections(
    client: TestClient, override: dict[str, Any], status: int, code: str
) -> None:
    assert_error(client.post("/sessions", json=create_request(**override)), status, code)


def test_malformed_and_oversized_bodies(client: TestClient) -> None:
    bad = client.post(
        "/sessions", content=b"{not json", headers={"Content-Type": "application/json"}
    )
    assert_error(bad, 400, "invalid_request")
    huge = client.post(
        "/sessions", content=b"x" * 300_000, headers={"Content-Type": "application/json"}
    )
    assert_error(huge, 413, "request_too_large")


def test_unknown_session_and_bad_id(client: TestClient) -> None:
    assert_error(client.get(f"/sessions/{uuid.uuid4()}"), 404, "not_found")
    assert_error(client.get("/sessions/not-a-uuid"), 404, "not_found")


def test_sessions_are_isolated_between_principals(app: FastAPI, client: TestClient) -> None:
    sid = start(client)["session"]["sessionId"]
    lab(app).principal_provider = FixedPrincipalProvider("00000000-0000-4000-8000-0000000000bb")
    assert_error(client.get(f"/sessions/{sid}"), 404, "not_found")
    assert_error(act(client, sid, CONFIRM, 0), 404, "not_found")
    assert_error(client.get(f"/sessions/{sid}/report"), 404, "not_found")


# ---------------------------------------------------------------- actions


def test_action_round_trip_and_get_session(client: TestClient) -> None:
    sid = start(client)["session"]["sessionId"]
    response = act(client, sid, CONFIRM, 0)
    assert response.status_code == 200
    body = response.json()
    assert body["event"]["seq"] == 0 and body["event"]["accepted"] is True
    assert body["session"]["nextSequence"] == 1
    assert lab(client.app).contracts.is_valid("api-action-result", body)  # type: ignore[arg-type]
    again = client.get(f"/sessions/{sid}").json()
    assert again["session"] == body["session"]


def test_idempotent_retry_returns_original_response_without_new_event(
    app: FastAPI, client: TestClient
) -> None:
    sid = start(client)["session"]["sessionId"]
    sub = submission(CONFIRM, 0)
    first = client.post(f"/sessions/{sid}/actions", json=sub)
    retry = client.post(f"/sessions/{sid}/actions", json=sub)
    assert retry.status_code == 200
    assert retry.json() == first.json()
    assert len(lab(app).store.list(uuid.UUID(sid))) == 1


def test_idempotency_key_reuse_with_different_payload_is_rejected(client: TestClient) -> None:
    sid = start(client)["session"]["sessionId"]
    sub = submission(CONFIRM, 0)
    client.post(f"/sessions/{sid}/actions", json=sub)
    changed = {**sub, "envelope": student({"type": "request_hint"})}
    assert_error(
        client.post(f"/sessions/{sid}/actions", json=changed), 409, "idempotency_key_reused"
    )


def test_stale_expected_sequence_is_rejected(client: TestClient) -> None:
    sid = start(client)["session"]["sessionId"]
    act(client, sid, CONFIRM, 0)
    body = assert_error(
        act(client, sid, student({"type": "request_hint"}), 0), 409, "stale_sequence"
    )
    assert body["error"]["details"] == {"currentSequence": 1}


def test_concurrent_duplicate_submissions_create_one_event(
    app: FastAPI, client: TestClient
) -> None:
    sid = start(client)["session"]["sessionId"]
    sub = submission(CONFIRM, 0)
    results: list[Any] = []

    def send() -> None:
        results.append(client.post(f"/sessions/{sid}/actions", json=sub))

    threads = [threading.Thread(target=send) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert {r.status_code for r in results} == {200}
    assert len({json.dumps(r.json(), sort_keys=True) for r in results}) == 1
    assert len(lab(app).store.list(uuid.UUID(sid))) == 1


def test_concurrent_different_actions_with_same_sequence(app: FastAPI, client: TestClient) -> None:
    sid = start(client)["session"]["sessionId"]
    results: list[Any] = []

    def send(env: dict[str, Any]) -> None:
        results.append(act(client, sid, env, 0))

    threads = [threading.Thread(target=send, args=(CONFIRM,)) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(r.status_code for r in results) == [200, 409, 409]
    assert len(lab(app).store.list(uuid.UUID(sid))) == 1


@pytest.mark.parametrize(
    "bad",
    [
        {"action": {"type": "teleport"}, "actor": "student", "acknowledgedSafetyWarning": False},
        {
            "action": {
                "type": "add_solid",
                "mass": {"value": -1, "unit": "g"},
                "handContact": False,
            },
            "actor": "student",
            "acknowledgedSafetyWarning": False,
        },
        {
            "action": {
                "type": "add_water",
                "volume": {"value": 5, "unit": "ml"},
                "source": "distilled",
            },
            "actor": "student",
            "acknowledgedSafetyWarning": False,
        },
        {
            "action": {"type": "request_hint"},
            "actor": "student",
            "acknowledgedSafetyWarning": False,
            "elapsedMs": 5,
        },
    ],
)
def test_invalid_actions_are_rejected_by_contract(client: TestClient, bad: dict[str, Any]) -> None:
    sid = start(client)["session"]["sessionId"]
    assert_error(act(client, sid, bad, 0), 422, "invalid_request")


def test_client_cannot_send_state_or_consequences(client: TestClient) -> None:
    sid = start(client)["session"]["sessionId"]
    sub = {**submission(CONFIRM, 0), "lab": {"submitted": True}, "score": 100}
    assert_error(client.post(f"/sessions/{sid}/actions", json=sub), 422, "invalid_request")


def test_system_actions_only_in_automatic_mode(client: TestClient) -> None:
    sid = start(client)["session"]["sessionId"]
    system = {**CONFIRM, "actor": "system"}
    assert_error(act(client, sid, system, 0), 400, "system_action_not_permitted")
    auto = start(client, "automatic")["session"]
    nxt = auto["guidance"]["nextAction"]
    ok = act(
        client,
        auto["sessionId"],
        {"action": nxt, "actor": "system", "acknowledgedSafetyWarning": False},
        0,
    )
    assert ok.status_code == 200 and ok.json()["event"]["actor"] == "system"


def test_physically_impossible_action_is_recorded_as_rejected_event(client: TestClient) -> None:
    sid = start(client)["session"]["sessionId"]
    body = act(client, sid, student({"type": "remove_funnel"}), 0).json()
    assert body["event"]["accepted"] is False
    assert body["event"]["rejectionCode"] == "funnel_on_flask"
    assert body["feedback"][0]["messageKey"] == "engine.rejection.funnel_on_flask"


def test_preview_for_beginner_records_nothing(app: FastAPI, client: TestClient) -> None:
    sid = start(client, "guided", "beginner")["session"]["sessionId"]
    act(client, sid, CONFIRM, 0)
    tap = student({"type": "add_water", "volume": {"value": 0, "unit": "cm3"}, "source": "tap"})
    preview = act(client, sid, tap, 1, preview=True)
    assert preview.status_code == 200
    assert preview.json() == {"predictedErrors": []}  # no flask selected yet: rejected, no error
    assert len(lab(app).store.list(uuid.UUID(sid))) == 1
    manual = start(client)["session"]["sessionId"]
    assert_error(act(client, manual, CONFIRM, 0, preview=True), 400, "preview_not_available")


# ---------------------------------------------------------------- full runs and projection


def replay_fixture(client: TestClient, name: str) -> tuple[str, list[dict[str, Any]]]:
    fixture = load_fixture(name)
    init = fixture["init"]
    sid = start(client, init["mode"], init["guidanceLevel"])["session"]["sessionId"]
    results = []
    for i, step in enumerate(fixture["steps"]):
        response = act(client, sid, step["envelope"], i)
        assert response.status_code == 200, response.text
        results.append(response.json())
    return sid, results


def test_perfect_guided_run_and_server_calculated_report(client: TestClient) -> None:
    sid, results = replay_fixture(client, "parity/perfect-guided-beginner.json")
    assert results[-1]["session"]["status"] == "submitted"
    report = client.get(f"/sessions/{sid}/report").json()
    assert report["resultLabel"] == "practical competency estimate"
    assert report["measurements"]["achievedConcentration"]["value"] == pytest.approx(1.0, abs=1e-12)
    assert report["errorSummary"] == {"recovered": [], "unresolved": []}
    assert lab(client.app).contracts.is_valid("report", report)  # type: ignore[arg-type]
    for category in report["categories"]:
        for d in category["deductions"]:
            assert d["eventSeqs"], d


def test_manual_run_hides_errors_until_the_report(client: TestClient) -> None:
    sid, results = replay_fixture(client, "parity/manual-hidden-errors.json")
    live = json.dumps(results)
    for hidden in ("TAP_WATER_USED", "FUNNEL_NOT_RINSED", "EYE_LEVEL_INCORRECT"):
        assert hidden not in live
    assert "achieved_concentration" not in live and "final_volume" not in live
    assert "rngState" not in live
    final = results[-1]["session"]
    assert final["disclosure"] == "observable" and final["validity"] is None
    assert final["bench"]["liquid"] == "at_mark" and final["bench"]["liquidFraction"] == 1
    session_text = client.get(f"/sessions/{sid}").text
    assert "TAP_WATER_USED" not in session_text

    report = client.get(f"/sessions/{sid}/report").json()
    unresolved = {e["code"] for e in report["errorSummary"]["unresolved"]}
    assert unresolved == {"TAP_WATER_USED", "FUNNEL_NOT_RINSED", "EYE_LEVEL_INCORRECT"}
    assert report["measurements"]["achievedConcentration"]["value"] < 1
    assert report["validity"]["restartRequired"] is True
    assert "param.eye_level_volume_error" in report["provisionalParameterIds"]


def test_report_before_submission_is_409_and_report_is_cached(
    app: FastAPI, client: TestClient
) -> None:
    sid = start(client)["session"]["sessionId"]
    assert_error(client.get(f"/sessions/{sid}/report"), 409, "report_not_available")
    sid2, _ = replay_fixture(client, "parity/perfect-guided-beginner.json")
    first = client.get(f"/sessions/{sid2}/report").json()
    calls: list[str] = []
    original = lab(app).verifier.call

    def spy(op: str, *args: Any, **kwargs: Any) -> Any:
        calls.append(op)
        return original(op, *args, **kwargs)

    lab(app).verifier.call = spy  # type: ignore[method-assign]
    assert client.get(f"/sessions/{sid2}/report").json() == first
    assert "report" not in calls  # served from the head-fingerprint cache


def test_tampered_stored_chain_is_never_served(app: FastAPI, client: TestClient) -> None:
    sid, _ = replay_fixture(client, "parity/perfect-guided-beginner.json")
    store = lab(app).store
    events = store._events[uuid.UUID(sid)]  # noqa: SLF001 - deliberate tampering
    events[3].event["envelope"]["action"] = {"type": "request_hint"}
    assert_error(client.get(f"/sessions/{sid}"), 500, "event_chain_invalid")


# ---------------------------------------------------------------- notebook


def notebook(**over: Any) -> dict[str, Any]:
    doc: dict[str, Any] = load_fixture("api/notebook-save-request.json")["document"]
    return {**doc, **over}


def test_notebook_create_update_and_stale_version(client: TestClient) -> None:
    sid = start(client)["session"]["sessionId"]
    first = client.put(
        f"/sessions/{sid}/notebook", json={"expectedVersion": 0, "document": notebook()}
    )
    assert first.status_code == 200 and first.json()["version"] == 1
    second = client.put(
        f"/sessions/{sid}/notebook",
        json={"expectedVersion": 1, "document": notebook(observations="වර්ණයක් නැති ද්‍රාවණයක්")},
    )
    assert second.json()["version"] == 2
    stale = client.put(
        f"/sessions/{sid}/notebook", json={"expectedVersion": 1, "document": notebook()}
    )
    body = assert_error(stale, 409, "notebook_version_conflict")
    assert body["error"]["details"] == {"currentVersion": 2}
    saved = client.get(f"/sessions/{sid}").json()["notebook"]
    assert saved["version"] == 2
    assert saved["document"]["observations"] == "වර්ණයක් නැති ද්‍රාවණයක්"


@pytest.mark.parametrize(
    "bad",
    [
        {"aim": "<script>alert(1)</script>"},
        {"aim": "x" * 2001},
        {"apparatus": ["flask"] * 31},
        {"measurements": [{"label": "m", "trial": 1, "value": 1, "unit": "ml", "note": ""}]},
        {"html": "<b>bold</b>"},
    ],
)
def test_notebook_validation(client: TestClient, bad: dict[str, Any]) -> None:
    sid = start(client)["session"]["sessionId"]
    response = client.put(
        f"/sessions/{sid}/notebook", json={"expectedVersion": 0, "document": notebook(**bad)}
    )
    assert_error(response, 422, "invalid_request")


# ---------------------------------------------------------------- misc


def test_assistant_without_a_provider_is_unavailable_not_ungrounded(client: TestClient) -> None:
    sid = start(client)["session"]["sessionId"]
    body = assert_error(
        client.post("/assistant/ask", json={"sessionId": sid, "question": "Why?", "locale": "en"}),
        503,
        "assistant_unavailable",
    )
    assert "answer" not in body


def test_source_pdfs_and_docs_are_not_served(client: TestClient) -> None:
    for path in (
        "/research-sources/nie-chemistry-practical-handbook-2018.pdf",
        "/content/sources.v1.json",
        "/docs",
        "/openapi.json/../.env",
    ):
        assert client.get(path).status_code == 404


def test_method_not_allowed_uses_error_shape(client: TestClient) -> None:
    response = client.delete("/experiments")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "invalid_request"


# ---------------------------------------------------------------- zero-solute amendment


def test_zero_solute_submission_parity_and_report(client: TestClient) -> None:
    sid, results = replay_fixture(client, "parity/manual-zero-solute.json")
    final = results[-1]
    assert final["event"]["accepted"] is True
    assert "INCOMPLETE_PROCEDURE" not in json.dumps(results)  # manual: hidden until the report
    report = client.get(f"/sessions/{sid}/report").json()
    assert report["measurements"]["achievedConcentration"] == {"value": 0, "unit": "mol dm-3"}
    codes = [e["code"] for e in report["errorSummary"]["unresolved"]]
    assert codes.count("INCOMPLETE_PROCEDURE") == 1
    assert report["validity"]["restartRequired"] is True
    completeness = next(c for c in report["categories"] if c["category"] == "completeness")
    assert [d["reason"] for d in completeness["deductions"]].count("INCOMPLETE_PROCEDURE") == 1


def test_idempotent_submit_retry_does_not_duplicate_completion_error(
    app: FastAPI, client: TestClient
) -> None:
    fixture = load_fixture("parity/manual-zero-solute.json")
    sid = start(client)["session"]["sessionId"]
    *before, submit = fixture["steps"]
    for i, step in enumerate(before):
        assert act(client, sid, step["envelope"], i).status_code == 200
    sub = submission(submit["envelope"], len(before))
    first = client.post(f"/sessions/{sid}/actions", json=sub)
    retry = client.post(f"/sessions/{sid}/actions", json=sub)
    assert retry.json() == first.json()
    assert len(lab(app).store.list(uuid.UUID(sid))) == len(fixture["steps"])
    report = client.get(f"/sessions/{sid}/report").json()
    codes = [e["code"] for e in report["errorSummary"]["unresolved"]]
    assert codes.count("INCOMPLETE_PROCEDURE") == 1


def test_report_cache_is_keyed_by_versions(app: FastAPI, client: TestClient) -> None:
    sid, _ = replay_fixture(client, "parity/perfect-guided-beginner.json")
    client.get(f"/sessions/{sid}/report")
    keys = list(lab(app).store._reports)  # noqa: SLF001 - inspect cache keys
    assert len(keys) == 1
    key = keys[0]
    assert (key.engine_version, key.definition_version, key.assessment_version) == (
        lab(app).settings.engine_version(),
        "1.1.0",
        "1.0.0",
    )
