"""Loads the canonical experiment definitions and assessments from content/ (never from clients)."""

import json
import re
from pathlib import Path

from app.contracts import ContractRegistry
from app.repositories import ExperimentRecord
from app.settings import ConfigurationError


def load_experiments(content_dir: Path, contracts: ContractRegistry) -> list[ExperimentRecord]:
    records: list[ExperimentRecord] = []
    for definition_path in sorted((content_dir / "experiments").glob("*/definition.*.json")):
        if definition_path.name == "definition.v1.json":
            assessment_path = definition_path.with_name("assessment.v1.json")
        else:
            suffix = definition_path.stem.removeprefix("definition.")
            if not re.fullmatch(r"v\d+", suffix):
                continue
            assessment_path = definition_path.with_name(f"assessment.{suffix}.json")
        if not assessment_path.is_file():
            raise ConfigurationError(f"Missing assessment for {definition_path.name}")
        definition = json.loads(definition_path.read_text(encoding="utf-8"))
        assessment = json.loads(assessment_path.read_text(encoding="utf-8"))
        if contracts.errors("experiment-definition", definition) or contracts.errors(
            "assessment-definition", assessment
        ):
            raise ConfigurationError(f"Invalid content in {definition_path.parent.name}")
        if assessment["experimentId"] != definition["experimentId"]:
            raise ConfigurationError(
                f"Assessment does not match experiment in {definition_path.parent.name}"
            )
        records.append(
            ExperimentRecord(
                experiment_id=definition["experimentId"],
                experiment_number=definition["experimentNumber"],
                title_key=definition["titleKey"],
                definition_version=definition["definitionVersion"],
                assessment_version=assessment["version"],
                active=True,
                definition=definition,
                assessment=assessment,
            )
        )
    if not records:
        raise ConfigurationError("No experiment content found")
    return records
