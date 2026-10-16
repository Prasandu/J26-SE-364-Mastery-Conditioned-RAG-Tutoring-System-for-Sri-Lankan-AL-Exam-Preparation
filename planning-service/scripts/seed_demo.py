"""Load generated Component 1/2 demo events into the planning API."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.models import (
    LearnerTopicState,
    Prediction,
    ProfileEmbedding,
    RawEvent,
    ReplanLog,
    StudyPlan,
    StudyTask,
    TopicEvidence,
)
from app.schemas.events import AssessmentEvent, ModuleCompletionEvent
from scripts.generate_datasets import DEFAULT_CONFIG, DEFAULT_OUTPUT_DIR

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_ENV_FILE = SCRIPT_DIR.parent / ".env"
DEFAULT_BASE_URL = "http://127.0.0.1:8083"
DEFAULT_BATCH_SIZE = 25
DEFAULT_MAX_RETRIES = 3
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


@dataclass
class LoadSummary:
    accepted: int = 0
    duplicate: int = 0
    rejected: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "accepted": self.accepted,
            "duplicate": self.duplicate,
            "rejected": self.rejected,
        }


def read_dotenv_value(path: Path, key: str) -> str | None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise ValueError(f"Cannot read environment file {path}: {exc}") from exc

    for line in lines:
        item = line.strip()
        if not item or item.startswith("#"):
            continue
        if item.startswith("export "):
            item = item[7:].lstrip()
        name, separator, value = item.partition("=")
        if separator and name.strip() == key:
            parsed = value.strip()
            if len(parsed) >= 2 and parsed[0] == parsed[-1] and parsed[0] in {"'", '"'}:
                parsed = parsed[1:-1]
            return parsed or None
    return None


def load_api_key(env_file: Path = DEFAULT_ENV_FILE) -> str:
    key = os.environ.get("INGEST_API_KEY") or read_dotenv_value(env_file, "INGEST_API_KEY")
    if not key:
        raise ValueError(f"INGEST_API_KEY is missing from the environment and {env_file}.")
    return key


def planning_student_id_columns() -> dict[str, bool]:
    models = (
        RawEvent,
        TopicEvidence,
        LearnerTopicState,
        Prediction,
        ProfileEmbedding,
        StudyPlan,
        StudyTask,
        ReplanLog,
    )
    return {
        model.__tablename__: bool(model.__table__.columns["student_id"].foreign_keys)
        for model in models
        if "student_id" in model.__table__.columns
    }


def load_demo_inputs(
    generated_dir: Path = DEFAULT_OUTPUT_DIR,
    config_path: Path = DEFAULT_CONFIG,
    *,
    selected_students: set[str] | None = None,
) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, Any]]:
    config = _read_json(config_path)
    personas = config.get("personas")
    if not isinstance(personas, list):
        raise ValueError(f"{config_path} must contain a personas array.")
    ids_by_name: dict[str, str] = {}
    for persona in personas:
        if not isinstance(persona, dict) or not all(
            isinstance(persona.get(field), str) and persona[field].strip()
            for field in ("name", "student_id")
        ):
            raise ValueError("Each demo persona must define non-empty name and student_id values.")
        name = persona["name"].strip().lower()
        if name in ids_by_name:
            raise ValueError(f"Duplicate persona name: {name}")
        ids_by_name[name] = persona["student_id"].strip()

    selected_ids: set[str] | None = None
    if selected_students is not None:
        selected_students = {name.strip().lower() for name in selected_students}
        unknown = selected_students - ids_by_name.keys()
        if unknown:
            raise ValueError(f"Unknown persona names: {', '.join(sorted(unknown))}")
        selected_ids = {ids_by_name[name] for name in selected_students}

    events: list[tuple[str, dict[str, Any]]] = []
    for filename, kind in (
        ("assessment_events.jsonl", "assessment"),
        ("completion_events.jsonl", "completion"),
    ):
        path = generated_dir / filename
        for line_number, event in _read_jsonl(path):
            student_id = event.get("student_id")
            if not isinstance(student_id, str) or not student_id.strip():
                raise ValueError(f"{path}:{line_number} is missing student_id.")
            if len(student_id) > 120:
                raise ValueError(f"{path}:{line_number} student_id exceeds the planning column length.")
            if selected_ids is not None and student_id not in selected_ids:
                continue
            events.append((kind, _to_planning_payload(kind, event, path, line_number)))

    if not events:
        raise ValueError("No events selected for loading.")
    return events, config


def _to_planning_payload(
    kind: str,
    event: dict[str, Any],
    path: Path,
    line_number: int,
) -> dict[str, Any]:
    try:
        if kind == "assessment":
            payload = AssessmentEvent(
                event_id=event["event_id"],
                student_id=event["student_id"],
                occurred_at=event["submitted_at"],
                evidence=[
                    {
                        "topic_id": result["topic_id"],
                        "score": result["marks_awarded"],
                        "max_score": result["marks_total"],
                        "difficulty": result["difficulty"],
                    }
                    for result in event["results"]
                ],
            )
            return payload.model_dump(mode="json")
        completion_id = event.get("event_id")
        if not completion_id:
            raise ValueError("completion event requires event_id to make API retries idempotent.")
        score = (
            event["post_lab_score"]
            if event.get("practical_done") and event.get("post_lab_score") is not None
            else 1
        )
        payload = ModuleCompletionEvent(
            event_id=completion_id,
            student_id=event["student_id"],
            topic_id=event["topic_id"],
            completed_at=event["completed_at"],
            score=score,
            max_score=1,
        )
        return payload.model_dump(mode="json")
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"{path}:{line_number} is not a valid {kind} event: {exc}") from exc


def load_events(
    client: httpx.Client,
    events: list[tuple[str, dict[str, Any]]],
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_delay: float = 0.25,
    progress: Callable[[int, int], None] | None = None,
) -> tuple[LoadSummary, list[str]]:
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1.")
    if max_retries < 0:
        raise ValueError("max_retries cannot be negative.")
    if retry_delay < 0:
        raise ValueError("retry_delay cannot be negative.")

    summary = LoadSummary()
    rejected_messages: list[str] = []
    total = len(events)
    processed = 0
    for batch in _batches(events, batch_size):
        for kind, payload in batch:
            endpoint = (
                "/api/v1/events/assessment"
                if kind == "assessment"
                else "/api/v1/events/module-completion"
            )
            result, error = _post_with_retries(
                client,
                endpoint,
                payload,
                max_retries=max_retries,
                retry_delay=retry_delay,
            )
            if result is None:
                summary.rejected += 1
                rejected_messages.append(error or "Request failed without an error detail.")
            elif result.get("accepted") is not True:
                summary.rejected += 1
                rejected_messages.append(f"Unexpected ingestion response: {result!r}")
            elif result.get("duplicate") is True:
                summary.duplicate += 1
            else:
                summary.accepted += 1
            processed += 1
        if progress is not None:
            progress(processed, total)
    return summary, rejected_messages


def reset_personas(
    client: httpx.Client,
    config: dict[str, Any],
    *,
    selected_students: set[str] | None = None,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_delay: float = 0.25,
) -> list[str]:
    selected_personas = [
        persona
        for persona in config["personas"]
        if selected_students is None or persona["name"].lower() in selected_students
    ]
    errors: list[str] = []
    for persona in selected_personas:
        student_id = persona["student_id"]
        error = _delete_with_retries(
            client,
            f"/api/v1/demo/students/{student_id}",
            max_retries=max_retries,
            retry_delay=retry_delay,
        )
        if error is not None:
            errors.append(f"Reset failed for {persona['name']}: {error}")

    return errors


def _delete_with_retries(
    client: httpx.Client,
    endpoint: str,
    *,
    max_retries: int,
    retry_delay: float,
) -> str | None:
    for attempt in range(max_retries + 1):
        try:
            response = client.delete(endpoint)
        except httpx.RequestError as exc:
            if attempt < max_retries:
                time.sleep(retry_delay * (2**attempt))
                continue
            return f"failed after {attempt + 1} attempts: {exc}"
        if response.status_code == 200:
            return None
        if response.status_code in RETRYABLE_STATUS_CODES and attempt < max_retries:
            time.sleep(retry_delay * (2**attempt))
            continue
        return f"HTTP {response.status_code}: {_response_detail(response)}"
    return "request exhausted retries."


def _post_with_retries(
    client: httpx.Client,
    endpoint: str,
    payload: dict[str, Any],
    *,
    max_retries: int,
    retry_delay: float,
) -> tuple[dict[str, Any] | None, str | None]:
    for attempt in range(max_retries + 1):
        try:
            response = client.post(endpoint, json=payload)
        except httpx.RequestError as exc:
            if attempt < max_retries:
                time.sleep(retry_delay * (2**attempt))
                continue
            return None, f"POST {endpoint} failed after {attempt + 1} attempts: {exc}"
        if response.status_code == 202:
            try:
                body = response.json()
            except ValueError:
                return None, f"POST {endpoint} returned invalid JSON."
            if not isinstance(body, dict):
                return None, f"POST {endpoint} returned an unexpected JSON value."
            return body, None
        if response.status_code in RETRYABLE_STATUS_CODES and attempt < max_retries:
            time.sleep(retry_delay * (2**attempt))
            continue
        return (
            None,
            f"POST {endpoint} rejected with HTTP {response.status_code}: "
            f"{_response_detail(response)}",
        )
    return None, f"POST {endpoint} exhausted retries."


def _response_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:500]
    if isinstance(body, dict):
        return str(body.get("detail", body))[:500]
    return str(body)[:500]


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"Cannot read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path} is not valid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    return value


def _read_jsonl(path: Path) -> Iterable[tuple[int, dict[str, Any]]]:
    try:
        source = path.open(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"Cannot read {path}: {exc}") from exc
    with source:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number} is not valid JSON: {exc}") from exc
            if not isinstance(event, dict):
                raise ValueError(f"{path}:{line_number} must contain a JSON object.")
            yield line_number, event


def _batches(
    events: list[tuple[str, dict[str, Any]]],
    batch_size: int,
) -> Iterable[list[tuple[str, dict[str, Any]]]]:
    for start in range(0, len(events), batch_size):
        yield events[start : start + batch_size]


def _print_progress(processed: int, total: int, *, stream: Any = sys.stderr) -> None:
    width = 24
    filled = width if total == 0 else round(width * processed / total)
    bar = "#" * filled + "-" * (width - filled)
    print(f"\r[{bar}] {processed}/{total}", end="\n" if processed == total else "", file=stream, flush=True)


def _parse_selected_students(value: str | None) -> set[str] | None:
    if value is None:
        return None
    selected = {name.strip().lower() for name in value.split(",") if name.strip()}
    if not selected:
        raise ValueError("--students must include at least one persona name.")
    return selected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--base-url", default=os.environ.get("PLANNING_API_URL", DEFAULT_BASE_URL))
    parser.add_argument("--students", help="Comma-separated persona names to load, e.g. nimal,pasindu.")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--retries", type=int, default=DEFAULT_MAX_RETRIES)
    parser.add_argument("--reset", action="store_true", help="Delete selected persona rows before loading.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and count events without API requests.",
    )
    arguments = parser.parse_args()

    try:
        selected_students = _parse_selected_students(arguments.students)
        events, config = load_demo_inputs(
            arguments.data_dir,
            arguments.config,
            selected_students=selected_students,
        )
        student_fk_columns = planning_student_id_columns()
        blocking_tables = sorted(table for table, has_fk in student_fk_columns.items() if has_fk)
        if blocking_tables:
            raise ValueError(
                "Planning model student_id columns unexpectedly have foreign keys: "
                + ", ".join(blocking_tables)
            )
        if arguments.dry_run:
            print(f"Validated {len(events)} events; no API requests sent.")
            print("Planning student_id columns have no foreign keys to auth.users.")
            return 0
        if arguments.batch_size < 1:
            raise ValueError("--batch-size must be at least 1.")
        if arguments.retries < 0:
            raise ValueError("--retries cannot be negative.")
        api_key = load_api_key(arguments.env_file)
    except ValueError as exc:
        parser.error(str(exc))

    headers = {"X-API-Key": api_key}
    with httpx.Client(base_url=arguments.base_url, headers=headers, timeout=30) as client:
        if arguments.reset:
            reset_errors = reset_personas(
                client,
                config,
                selected_students=selected_students,
                max_retries=arguments.retries,
            )
            if reset_errors:
                for error in reset_errors:
                    print(error, file=sys.stderr)
                return 1
            print("Reset selected persona rows.")
        summary, errors = load_events(
            client,
            events,
            batch_size=arguments.batch_size,
            max_retries=arguments.retries,
            progress=_print_progress,
        )

    print(
        "Summary: "
        f"{summary.accepted} accepted, {summary.duplicate} duplicate, {summary.rejected} rejected."
    )
    print("Planning student_id columns have no foreign keys to auth.users.")
    for error in errors:
        print(f"Rejected: {error}", file=sys.stderr)
    return 1 if summary.rejected else 0


if __name__ == "__main__":
    raise SystemExit(main())
