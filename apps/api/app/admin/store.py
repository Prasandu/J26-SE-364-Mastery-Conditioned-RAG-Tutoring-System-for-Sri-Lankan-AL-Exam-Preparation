"""Private development storage for admin imports and drafts (``data/admin/``, gitignored).

* Identifiers are generated server-side (uuid4 hex) and validated against ``^[0-9a-f]{32}$``
  before any path is built, so no client value can traverse directories.
* Uploaded PDFs are content-addressed (``uploads/<sha256>.pdf``) and written once; an existing
  file is never overwritten, only verified.
* Records are written atomically (temporary file in the same directory, then ``os.replace``)
  and carry an integrity hash that is verified on every read.
* Updates require the caller's expected version (optimistic concurrency).
* Nothing here can write outside the admin data directory, and startup refuses a data directory
  inside ``content/`` (where the active student definitions live).
"""

import hashlib
import json
import os
import re
import tempfile
import threading
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")
SHA_PATTERN = re.compile(r"^[0-9a-f]{64}$")
KINDS = ("imports", "drafts")


class StoreError(RuntimeError):
    pass


class IntegrityError(StoreError):
    pass


class StorageUnavailable(StoreError):
    """The filesystem refused a read or write (permissions, path length, disk full...)."""


class VersionConflict(StoreError):
    def __init__(self, current: int) -> None:
        super().__init__("version conflict")
        self.current = current


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def new_id() -> str:
    return uuid.uuid4().hex


def _digest(record: dict[str, Any]) -> str:
    body = {k: v for k, v in record.items() if k != "integrity"}
    canonical = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _atomic_write(path: Path, data: bytes) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=path.suffix)
    except OSError as exc:
        raise StorageUnavailable("admin storage is not writable") from exc
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except OSError as exc:
        Path(tmp).unlink(missing_ok=True)
        raise StorageUnavailable("admin storage write failed") from exc
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


class AdminStore:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self._lock = threading.RLock()

    # ---------------------------------------------------------------- paths
    def _path(self, kind: str, record_id: str) -> Path:
        if kind not in KINDS or not ID_PATTERN.fullmatch(record_id):
            raise StoreError("invalid record identifier")
        path = (self.root / kind / f"{record_id}.json").resolve()
        if path.parent != self.root / kind:
            raise StoreError("invalid record path")
        return path

    def upload_path(self, sha256: str) -> Path:
        if not SHA_PATTERN.fullmatch(sha256):
            raise StoreError("invalid upload checksum")
        return self.root / "uploads" / f"{sha256}.pdf"

    # ---------------------------------------------------------------- uploads
    def save_upload(self, data: bytes) -> str:
        sha = hashlib.sha256(data).hexdigest()
        path = self.upload_path(sha)
        with self._lock:
            if path.exists():
                try:
                    stored = path.read_bytes()
                except OSError as exc:
                    raise StorageUnavailable("stored upload is not readable") from exc
                if hashlib.sha256(stored).hexdigest() != sha:
                    raise IntegrityError("stored upload does not match its checksum")
                return sha
            _atomic_write(path, data)
        return sha

    def upload_ok(self, sha256: str) -> bool:
        try:
            path = self.upload_path(sha256)
        except StoreError:
            return False
        return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == sha256

    # ---------------------------------------------------------------- records
    def create(self, kind: str, record: dict[str, Any]) -> dict[str, Any]:
        record_id = record.get("id") or new_id()
        stamp = now_iso()
        stored = {**record, "id": record_id, "version": 1, "createdAt": stamp, "updatedAt": stamp}
        stored["integrity"] = _digest(stored)
        path = self._path(kind, record_id)
        with self._lock:
            if path.exists():
                raise StoreError("record already exists")
            _atomic_write(path, json.dumps(stored, ensure_ascii=False, indent=1).encode("utf-8"))
        return stored

    def get(self, kind: str, record_id: str) -> dict[str, Any] | None:
        path = self._path(kind, record_id)
        if not path.is_file():
            return None
        try:
            record: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise IntegrityError(f"{kind} record is not valid JSON") from exc
        except OSError as exc:
            raise StorageUnavailable(f"{kind} record is not readable") from exc
        if record.get("integrity") != _digest(record) or record.get("id") != record_id:
            raise IntegrityError(f"{kind} record failed its integrity check")
        return record

    def list(self, kind: str) -> list[dict[str, Any]]:
        folder = self.root / kind
        if kind not in KINDS or not folder.is_dir():
            return []
        out = []
        for path in sorted(folder.glob("*.json")):
            if ID_PATTERN.fullmatch(path.stem):
                record = self.get(kind, path.stem)
                if record is not None:
                    out.append(record)
        return sorted(out, key=lambda r: r["createdAt"])

    def update(
        self,
        kind: str,
        record_id: str,
        expected_version: int,
        change: Callable[[dict[str, Any]], dict[str, Any]],
    ) -> dict[str, Any]:
        with self._lock:
            current = self.get(kind, record_id)
            if current is None:
                raise StoreError("record not found")
            if current["version"] != expected_version:
                raise VersionConflict(current["version"])
            updated = change({k: v for k, v in current.items() if k != "integrity"})
            updated.update(
                id=record_id,
                version=current["version"] + 1,
                createdAt=current["createdAt"],
                updatedAt=now_iso(),
            )
            updated["integrity"] = _digest(updated)
            _atomic_write(
                self._path(kind, record_id),
                json.dumps(updated, ensure_ascii=False, indent=1).encode("utf-8"),
            )
            return updated
