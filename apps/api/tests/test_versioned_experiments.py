import pytest

from app.errors import ApiError
from app.repositories import ExperimentRecord, InMemoryExperiments


def record(version: str, *, active: bool) -> ExperimentRecord:
    return ExperimentRecord(
        experiment_id="exp04_standard_solution",
        experiment_number=4,
        title_key="experiment.exp04.title",
        definition_version=version,
        assessment_version="1.0.0",
        active=active,
        definition={"definitionVersion": version},
        assessment={"version": "1.0.0"},
    )


def test_versioned_repository_keeps_history_and_resolves_active_definition() -> None:
    old = record("1.0.0", active=False)
    current = record("1.1.0", active=True)
    repository = InMemoryExperiments([old, current])

    assert repository.get("exp04_standard_solution") == current
    assert repository.get_version("exp04_standard_solution", "1.0.0", "1.0.0") == old
    assert repository.get_version("exp04_standard_solution", "9.9.9", "1.0.0") is None


def test_missing_historical_definition_is_a_controlled_conflict() -> None:
    from app.service import SessionService

    service = object.__new__(SessionService)
    service._repos = type(
        "Repos",
        (),
        {"experiments": InMemoryExperiments([record("1.1.0", active=True)])},
    )()

    with pytest.raises(ApiError) as raised:
        service._experiment_version("exp04_standard_solution", "1.0.0", "1.0.0")

    assert raised.value.status == 409
    assert raised.value.code == "experiment_version_unavailable"
    assert raised.value.details == {
        "experimentId": "exp04_standard_solution",
        "definitionVersion": "1.0.0",
        "assessmentVersion": "1.0.0",
    }
