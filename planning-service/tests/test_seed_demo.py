import json
from pathlib import Path

import httpx
import pytest

from app.schemas.events import AssessmentEvent, ModuleCompletionEvent
from scripts.generate_datasets import DEFAULT_CONFIG, DEFAULT_TOPICS_PATH, generate_datasets, write_datasets
from scripts.seed_demo import (
    load_demo_inputs,
    load_events,
    planning_student_id_columns,
    read_dotenv_value,
    reset_personas,
)


@pytest.fixture
def generated_dir(tmp_path: Path) -> Path:
    config = json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))
    config["synthetic_count"] = 2
    config_path = tmp_path / "demo_students.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    output_dir = tmp_path / "generated"
    write_datasets(generate_datasets(config_path, DEFAULT_TOPICS_PATH, seed=17), output_dir)
    return output_dir


@pytest.fixture
def test_config_path(tmp_path: Path) -> Path:
    config = json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))
    config["synthetic_count"] = 2
    path = tmp_path / "demo_students.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    return path


def test_loading_translates_component_payloads_and_filters_personas(
    generated_dir: Path,
    test_config_path: Path,
) -> None:
    events, _ = load_demo_inputs(
        generated_dir,
        test_config_path,
        selected_students={"pasindu"},
    )

    assert len(events) == 14
    assessment, completion = events[0], events[-1]
    assert assessment[0] == "assessment"
    validated_assessment = AssessmentEvent.model_validate(assessment[1])
    assert validated_assessment.student_id == "614f0cf0-bd67-461d-9958-0bd24adbce04"
    assert validated_assessment.evidence[0].score <= validated_assessment.evidence[0].max_score
    assert completion[0] == "completion"
    validated_completion = ModuleCompletionEvent.model_validate(completion[1])
    assert validated_completion.student_id == "614f0cf0-bd67-461d-9958-0bd24adbce04"


def test_loader_counts_accepted_duplicates_rejections_and_retries() -> None:
    responses = [
        httpx.Response(202, json={"accepted": True, "duplicate": False}),
        httpx.Response(202, json={"accepted": True, "duplicate": True}),
        httpx.Response(422, json={"detail": "invalid topic"}),
        httpx.Response(503, json={"detail": "temporary"}),
        httpx.Response(202, json={"accepted": True, "duplicate": False}),
    ]
    requested: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request)
        return responses.pop(0)

    events = [
        ("assessment", {"event_id": f"event-{index}"})
        for index in range(4)
    ]
    progress: list[tuple[int, int]] = []
    with httpx.Client(
        base_url="http://planning.test",
        transport=httpx.MockTransport(handler),
    ) as client:
        summary, errors = load_events(
            client,
            events,
            batch_size=2,
            max_retries=1,
            retry_delay=0,
            progress=lambda processed, total: progress.append((processed, total)),
        )

    assert summary.as_dict() == {"accepted": 2, "duplicate": 1, "rejected": 1}
    assert len(errors) == 1
    assert len(requested) == 5
    assert all(request.url.path == "/api/v1/events/assessment" for request in requested)
    assert progress == [(2, 4), (4, 4)]


def test_reset_targets_only_selected_personas() -> None:
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.path)
        return httpx.Response(200, json={"deleted": {}})

    config = json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))
    with httpx.Client(
        base_url="http://planning.test",
        transport=httpx.MockTransport(handler),
    ) as client:
        errors = reset_personas(client, config, selected_students={"uvindu"}, retry_delay=0)

    assert errors == []
    assert requested == [
        "/api/v1/demo/students/06a92599-4296-4896-9a95-0272b932e517"
    ]


def test_reset_retries_transient_failure() -> None:
    responses = [httpx.Response(503), httpx.Response(200, json={"deleted": {}})]

    def handler(_request: httpx.Request) -> httpx.Response:
        return responses.pop(0)

    config = json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))
    with httpx.Client(
        base_url="http://planning.test",
        transport=httpx.MockTransport(handler),
    ) as client:
        errors = reset_personas(
            client,
            config,
            selected_students={"nimal"},
            retry_delay=0,
        )

    assert errors == []


def test_planning_student_ids_do_not_depend_on_auth_users() -> None:
    foreign_keys = planning_student_id_columns()

    assert foreign_keys
    assert not any(foreign_keys.values())


def test_dotenv_reader_supports_quotes_export_and_missing_file(tmp_path: Path) -> None:
    dotenv = tmp_path / ".env"
    dotenv.write_text("# ignored\nexport INGEST_API_KEY='demo-key'\n", encoding="utf-8")

    assert read_dotenv_value(dotenv, "INGEST_API_KEY") == "demo-key"
    assert read_dotenv_value(tmp_path / "missing.env", "INGEST_API_KEY") is None


def test_unknown_persona_selection_is_rejected(
    generated_dir: Path,
    test_config_path: Path,
) -> None:
    with pytest.raises(ValueError, match="Unknown persona"):
        load_demo_inputs(generated_dir, test_config_path, selected_students={"not-a-persona"})
