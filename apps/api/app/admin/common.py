"""Shared plumbing for the development admin routes: the loopback guard, the configured store,
response contracts, error mapping and the append-only audit log."""

import json
import logging
from collections.abc import Awaitable, Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, TypeVar

from fastapi import Request

from app.admin.access import require_dev_admin
from app.admin.drafts import Published
from app.admin.store import (
    AdminRepository,
    DuplicateApproved,
    IntegrityError,
    StorageUnavailable,
    StoreError,
    VersionConflict,
    open_admin_store,
)
from app.errors import ApiError

logger = logging.getLogger("vlab.admin")
T = TypeVar("T")


def storage_error(exc: Exception) -> ApiError:
    logger.error("admin storage unavailable: %s", type(exc.__cause__ or exc).__name__)
    return ApiError(500, "admin_storage_error", "Admin storage is not available")


def conflict_error(conflict: VersionConflict) -> ApiError:
    return ApiError(
        409,
        "draft_version_conflict",
        "The record changed since it was loaded; reload it and try again",
        details={"currentVersion": conflict.current},
    )


@contextmanager
def storage_errors() -> Iterator[None]:
    """Maps store failures to API errors (never an unhandled 500 without CORS headers)."""
    try:
        yield
    except VersionConflict as exc:
        raise conflict_error(exc) from exc
    except DuplicateApproved as exc:
        raise ApiError(
            409,
            "duplicate_practical",
            "Another approved practical already has this experiment number",
        ) from exc
    except IntegrityError as exc:
        raise ApiError(500, "admin_storage_error", "A stored record failed its check") from exc
    except StorageUnavailable as exc:
        raise storage_error(exc) from exc


def published_texts(content_dir: Path) -> dict[str, str]:
    """English locale strings, used for titles and the published-content fingerprints."""
    strings: dict[str, str] = {}
    for path in sorted((content_dir / "locales" / "en").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        strings.update({k: v for k, v in data.items() if isinstance(v, str)})
    return strings


class AdminApi:
    def __init__(
        self,
        state: Callable[[Request], Any],
        read_json: Callable[[Request, str, type[Any]], Awaitable[Any]],
    ) -> None:
        self._state = state
        self.read_json = read_json

    def guard(self, request: Request) -> tuple[Any, AdminRepository]:
        st = self._state(request)
        require_dev_admin(request, st.settings)
        return st, open_admin_store(st.settings)

    @staticmethod
    def checked(st: Any, schema: str, body: T) -> T:
        if not st.contracts.is_valid(schema, body):
            logger.error("admin response failed its contract: %s", schema)
            raise ApiError(500, "internal_error", "Unexpected server error")
        return body

    @staticmethod
    def load(store: AdminRepository, kind: str, record_id: str) -> dict[str, Any]:
        try:
            with storage_errors():
                record = store.get(kind, record_id)
        except StoreError as exc:
            raise ApiError(404, "not_found", "Not found") from exc
        if record is None:
            raise ApiError(404, "not_found", "Not found")
        return record

    @staticmethod
    def records(store: AdminRepository, kind: str) -> list[dict[str, Any]]:
        with storage_errors():
            return store.list(kind)

    @staticmethod
    def public(record: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in record.items() if k != "integrity"}  # internal checksum

    @staticmethod
    def published(st: Any) -> list[Published]:
        strings = published_texts(st.settings.content_dir)
        out: list[Published] = []
        for e in st.service.list_experiments():
            prefix = e["titleKey"].split(".", 1)[0] + "."
            text = "\n".join(
                v
                for k, v in strings.items()
                if k.startswith(prefix) and (".step." in k or ".stage." in k)
            )
            out.append((e["experimentId"], e["experimentNumber"], strings.get(e["titleKey"]), text))
        return out

    @staticmethod
    def audit(
        store: AdminRepository,
        action: str,
        target_kind: str | None = None,
        target_id: str | None = None,
        **details: Any,
    ) -> None:
        """Records an admin action after it succeeded. A failing audit write is logged and
        reported, never silently ignored."""
        with storage_errors():
            store.append_audit(
                {
                    "action": action,
                    "targetKind": target_kind,
                    "targetId": target_id,
                    "details": details,
                }
            )
