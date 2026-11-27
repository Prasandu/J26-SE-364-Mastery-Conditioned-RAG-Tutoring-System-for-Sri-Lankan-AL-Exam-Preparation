"""LAB-011 on the server: modes come from the engines' published capability registry.

The registry (content/experiments/capabilities.v1.json) is generated from the TypeScript
engines and checked against them in packages/simulation-core. Here: the API reads it, lists
only those modes, refuses to start any other mode, and refuses a malformed registry.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.capabilities import CapabilityRegistryError, load_modes
from app.main import create_app
from app.service import SessionService
from app.settings import REPO_ROOT
from tests.conftest import FakeClock, create_request, make_settings

CONTENT = REPO_ROOT / "content"


def test_the_published_registry_gives_exp4_every_mode_and_bounded_models_guided_only() -> None:
    modes = load_modes(CONTENT)

    assert modes[4] == ("automatic", "guided", "manual")
    assert all(modes[n] == ("guided",) for n in [*range(1, 4), *range(5, 31)])
    assert 36 not in modes  # reserved for the next milestone; nothing is offered


def test_the_experiment_list_offers_the_registry_modes(client: TestClient) -> None:
    listed = client.get("/experiments").json()

    exp4 = [e["modes"] for e in listed if e["experimentNumber"] == 4]
    assert exp4 == [["automatic", "guided", "manual"]]


def app_with_modes(modes: dict[int, tuple[str, ...]]) -> TestClient:
    clock = FakeClock()

    def factory(*args: Any, **kw: Any) -> SessionService:
        return SessionService(*args, now=clock, **{**kw, "modes": modes})

    return TestClient(create_app(make_settings(), service_factory=factory))


def test_a_mode_the_engine_does_not_support_is_neither_listed_nor_started() -> None:
    with app_with_modes({4: ("guided",)}) as client:
        assert [e["modes"] for e in client.get("/experiments").json()] == [["guided"]]

        refused = client.post("/sessions", json=create_request("manual"))
        assert refused.status_code == 422
        assert refused.json()["error"]["code"] == "invalid_request"
        assert refused.json()["error"]["details"] == {"supportedModes": "guided"}

        started = client.post("/sessions", json=create_request("guided", "beginner"))
        assert started.status_code == 201


def test_a_practical_missing_from_the_registry_offers_nothing() -> None:
    with app_with_modes({}) as client:
        assert [e["modes"] for e in client.get("/experiments").json()] == [[]]
        refused = client.post("/sessions", json=create_request("guided", "beginner"))
        assert refused.status_code == 422


@pytest.mark.parametrize(
    ("body", "reason"),
    [
        (None, "cannot read"),
        ({"registryVersion": "2.0.0", "practicals": []}, "unsupported capability registry"),
        (
            {
                "registryVersion": "1.0.0",
                "practicals": [{"experimentNumber": 4, "modes": ["teleport"]}],
            },
            "invalid capability entry",
        ),
        (
            {
                "registryVersion": "1.0.0",
                "practicals": [
                    {"experimentNumber": 4, "modes": ["guided"]},
                    {"experimentNumber": 4, "modes": ["manual"]},
                ],
            },
            "invalid capability entry",
        ),
    ],
)
def test_a_missing_or_malformed_registry_stops_startup(
    tmp_path: Path, body: Any, reason: str
) -> None:
    if body is not None:
        (tmp_path / "experiments").mkdir()
        registry = tmp_path / "experiments" / "capabilities.v1.json"
        registry.write_text(json.dumps(body), encoding="utf-8")

    with pytest.raises(CapabilityRegistryError, match=reason):
        load_modes(tmp_path)
