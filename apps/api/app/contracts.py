"""Validation against the JSON Schemas exported from @vlab/contracts (the single source of truth).

Action codes, modes, units, error codes and guidance levels are never redefined in Python; they
are enforced through these schemas.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

from app.errors import ApiError, Detail


class ContractRegistry:
    def __init__(self, schema_dir: Path) -> None:
        self._dir = schema_dir

    @lru_cache(maxsize=64)  # noqa: B019 - registry instances live for the process lifetime
    def validator(self, name: str) -> Draft202012Validator:
        schema = json.loads((self._dir / f"{name}.v1.json").read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        return Draft202012Validator(schema, format_checker=FormatChecker())

    def errors(self, name: str, instance: Any) -> list[dict[str, Detail]]:
        """Safe error summaries: JSON path and failing keyword only, never the offending value."""
        found = sorted(self.validator(name).iter_errors(instance), key=lambda e: list(e.path))
        return [
            {"location": "/".join(str(p) for p in e.absolute_path) or "$", "reason": e.validator}
            for e in found[:5]
        ]

    def require(self, name: str, instance: Any) -> None:
        """Validate a client request; raise a 422 API error on the first problem."""
        problems = self.errors(name, instance)
        if problems:
            raise ApiError(
                422,
                "invalid_request",
                "Request does not match the API contract",
                details=problems[0],
            )

    def is_valid(self, name: str, instance: Any) -> bool:
        return bool(self.validator(name).is_valid(instance))
