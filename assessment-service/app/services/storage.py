"""Where uploaded answer photos are kept.

Local folders for now. Supabase Storage can replace LocalFileStore later without
anything else changing, because only this interface is used elsewhere.

Keys are short on purpose: "ab/cdef...jpg". Windows refuses paths over 260
characters, and a project folder plus an attempt id would already be close to it.
The first two characters spread the files over folders, so no single folder grows huge.
"""

import uuid
from pathlib import Path
from typing import Protocol

CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class FileStore(Protocol):
    def save(self, data: bytes, content_type: str) -> str: ...

    def load(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...


class LocalFileStore:
    """Files under one root folder. The key is the path relative to that root."""

    def __init__(self, root: Path) -> None:
        self._root = root

    def save(self, data: bytes, content_type: str) -> str:
        name = uuid.uuid4().hex  # random, so keys cannot be guessed
        key = f"{name[:2]}/{name[2:]}{CONTENT_TYPES[content_type]}"
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    def load(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def _path(self, key: str) -> Path:
        path = (self._root / key).resolve()
        if not path.is_relative_to(self._root.resolve()):
            raise ValueError("Storage key points outside the upload folder")
        return path
