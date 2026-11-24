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
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")
SHA_PATTERN = re.compile(r"^[0-9a-f]{64}$")
KINDS = ("imports", "drafts", "users", "knowledge")
#: Admin actor while there is no login (development, loopback only).
LOCAL_ACTOR = "local-admin"
#: Alias used inside classes whose ``list`` method shadows the builtin in annotations.
Records = list[dict[str, Any]]


class StoreError(RuntimeError):
    pass


class IntegrityError(StoreError):
    pass


class StorageUnavailable(StoreError):
    """Configured storage or its required driver is unavailable; never change stores silently."""


class DuplicateApproved(StoreError):
    """A second content-approved draft with the same experiment number (database guard)."""


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

    # ---------------------------------------------------------------- audit (append-only)
    def append_audit(self, event: dict[str, Any]) -> dict[str, Any]:
        """Appends one audit event, chained to the previous one by hash (tamper evident)."""
        path = self.root / "audit.jsonl"
        with self._lock:
            events = self._read_audit(path)
            prev = events[-1]["hash"] if events else "0" * 64
            entry = {
                "seq": len(events) + 1,
                "at": now_iso(),
                "actor": LOCAL_ACTOR,
                **event,
                "prev": prev,
            }
            entry["hash"] = _chain_hash(entry)
            try:
                path.parent.mkdir(parents=True, exist_ok=True)
                with path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
                    handle.flush()
                    os.fsync(handle.fileno())
            except OSError as exc:
                raise StorageUnavailable("audit log is not writable") from exc
            return entry

    def audit(self, limit: int = 200) -> tuple[Records, bool]:
        """Most recent events first, and whether the hash chain verifies end to end."""
        with self._lock:
            events = self._read_audit(self.root / "audit.jsonl")
        return list(reversed(events[-limit:])), verify_chain(events)

    @staticmethod
    def _read_audit(path: Path) -> Records:
        if not path.is_file():
            return []
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
            return [json.loads(line) for line in lines if line.strip()]
        except (OSError, ValueError) as exc:
            raise IntegrityError("audit log is not readable") from exc


def _chain_hash(entry: dict[str, Any]) -> str:
    body = {k: v for k, v in entry.items() if k != "hash"}
    canonical = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def verify_chain(events: list[dict[str, Any]]) -> bool:
    prev = "0" * 64
    for entry in events:
        if entry.get("prev") != prev or entry.get("hash") != _chain_hash(entry):
            return False
        prev = entry["hash"]
    return True


@lru_cache(maxsize=4)
def _pool(dsn: str) -> Any:
    """One pooled connection set per DSN, shared by every ``PostgresAdminStore`` instance (a new
    instance is built per request; a new instance must not mean a new remote TLS/auth handshake).
    A single raw ``psycopg.connect()`` per admin request pays the full cross-region handshake
    every time and has no bound on how long it may hang if the network stalls; the pool opens a
    small number of connections once and reuses them, with a bounded wait for a free one."""
    from psycopg_pool import ConnectionPool

    pool = ConnectionPool(
        dsn,
        min_size=1,
        max_size=5,
        timeout=10,
        max_idle=300,
        kwargs={"autocommit": False, "connect_timeout": 10},
        open=False,
    )
    pool.open(wait=False)  # connects in the background; callers wait via `timeout` above, bounded
    return pool


class PostgresAdminStore:
    """PostgreSQL admin records (``public.admin_records``) with the same contract as the file
    store: optimistic versions, integrity hashes verified on read, append-only audit events.
    Uploaded PDFs stay content-addressed on disk (never stored in the database)."""

    def __init__(self, dsn: str, upload_root: Path) -> None:
        self._dsn = dsn
        self._files = AdminStore(upload_root)
        self.root = self._files.root

    @contextmanager
    def _connect(self) -> Iterator[Any]:
        try:
            import psycopg
            from psycopg_pool import PoolClosed, PoolTimeout
        except ImportError as exc:
            raise StorageUnavailable("admin database driver is not installed") from exc

        try:
            with _pool(self._dsn).connection() as conn:
                yield conn
        except (psycopg.OperationalError, PoolTimeout, PoolClosed) as exc:
            raise StorageUnavailable("admin database is not reachable") from exc

    # Uploaded PDFs stay content-addressed on disk.
    def save_upload(self, data: bytes) -> str:
        return self._files.save_upload(data)

    def upload_ok(self, sha256: str) -> bool:
        return self._files.upload_ok(sha256)

    def upload_path(self, sha256: str) -> Path:
        return self._files.upload_path(sha256)

    @staticmethod
    def _check(kind: str, record_id: str) -> None:
        if kind not in KINDS or not ID_PATTERN.fullmatch(record_id):
            raise StoreError("invalid record identifier")

    @staticmethod
    def _verified(kind: str, record_id: str, record: dict[str, Any]) -> dict[str, Any]:
        if record.get("integrity") != _digest(record) or record.get("id") != record_id:
            raise IntegrityError(f"{kind} record failed its integrity check")
        return record

    def create(self, kind: str, record: dict[str, Any]) -> dict[str, Any]:
        import psycopg
        from psycopg.types.json import Jsonb

        record_id = record.get("id") or new_id()
        self._check(kind, record_id)
        stamp = now_iso()
        stored = {**record, "id": record_id, "version": 1, "createdAt": stamp, "updatedAt": stamp}
        stored["integrity"] = _digest(stored)
        with self._connect() as conn, conn.cursor() as cur:
            try:
                cur.execute(
                    "insert into public.admin_records (kind, id, version, record, integrity)"
                    " values (%s, %s, 1, %s, %s)",
                    (kind, record_id, Jsonb(stored), stored["integrity"]),
                )
            except psycopg.errors.UniqueViolation as exc:
                raise StoreError("record already exists") from exc
            conn.commit()
        return stored

    def get(self, kind: str, record_id: str) -> dict[str, Any] | None:
        self._check(kind, record_id)
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                "select record from public.admin_records where kind = %s and id = %s",
                (kind, record_id),
            )
            row = cur.fetchone()
        return self._verified(kind, record_id, row[0]) if row else None

    def list(self, kind: str) -> list[dict[str, Any]]:
        if kind not in KINDS:
            return []
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                "select id, record from public.admin_records where kind = %s"
                " order by created_at, id",
                (kind,),
            )
            rows = cur.fetchall()
        return [self._verified(kind, rid, rec) for rid, rec in rows]

    def update(
        self,
        kind: str,
        record_id: str,
        expected_version: int,
        change: Callable[[dict[str, Any]], dict[str, Any]],
    ) -> dict[str, Any]:
        import psycopg
        from psycopg.types.json import Jsonb

        self._check(kind, record_id)
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                "select record from public.admin_records where kind = %s and id = %s for update",
                (kind, record_id),
            )
            row = cur.fetchone()
            if row is None:
                raise StoreError("record not found")
            current = self._verified(kind, record_id, row[0])
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
            try:
                cur.execute(
                    "update public.admin_records set version = %s, record = %s, integrity = %s,"
                    " updated_at = now() where kind = %s and id = %s and version = %s",
                    (
                        updated["version"],
                        Jsonb(updated),
                        updated["integrity"],
                        kind,
                        record_id,
                        expected_version,
                    ),
                )
            except psycopg.errors.UniqueViolation as exc:
                raise DuplicateApproved("another approved draft has this number") from exc
            conn.commit()
            return updated

    def append_audit(self, event: dict[str, Any]) -> dict[str, Any]:
        from psycopg.types.json import Jsonb

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("lock table public.admin_audit_events in exclusive mode")
            cur.execute("select seq, hash from public.admin_audit_events order by seq desc limit 1")
            last = cur.fetchone()
            entry = {
                "seq": (last[0] if last else 0) + 1,
                "at": now_iso(),
                "actor": LOCAL_ACTOR,
                **event,
                "prev": last[1] if last else "0" * 64,
            }
            entry["hash"] = _chain_hash(entry)
            cur.execute(
                "insert into public.admin_audit_events (seq, entry, hash) values (%s, %s, %s)",
                (entry["seq"], Jsonb(entry), entry["hash"]),
            )
            conn.commit()
        return entry

    def audit(self, limit: int = 200) -> tuple[Records, bool]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("select entry from public.admin_audit_events order by seq")
            events = [row[0] for row in cur.fetchall()]
        return list(reversed(events[-limit:])), verify_chain(events)


AdminRepository = AdminStore | PostgresAdminStore


def open_admin_store(settings: Any) -> AdminRepository:
    """The configured admin store (file by default; PostgreSQL with LAB_ADMIN_REPOSITORY)."""
    if settings.admin_repository == "postgres":
        return PostgresAdminStore(settings.database_url.get_secret_value(), settings.admin_data_dir)
    return AdminStore(settings.admin_data_dir)
