"""Where uploaded files are kept: answer photos, and resource PDFs.

Local folders for now. Supabase Storage can replace LocalFileStore later without
anything else changing, because only this interface is used elsewhere.

Keys are short on purpose: "ab/cdef...jpg". Windows refuses paths over 260
characters, and a project folder plus an attempt id would already be close to it.
The first two characters spread the files over folders, so no single folder grows huge.

Nothing under here is served by any route - a resource's original PDF and an
answer's photo are both read back only through this interface's own `load`, never by
a browser given the key directly.
"""

import uuid
from pathlib import Path
from typing import Protocol

CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
# Not in CONTENT_TYPES: that dict is also how app/services/attempts.py decides which
# content types an answer photo upload accepts, and a resource is a different kind of
# upload with a different, admin-only acceptance check (see app/api/resources.py).
PDF_CONTENT_TYPE = "application/pdf"
RESOURCE_EXTENSIONS = {PDF_CONTENT_TYPE: ".pdf"}


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
        extension = CONTENT_TYPES.get(content_type) or RESOURCE_EXTENSIONS[content_type]
        key = f"{name[:2]}/{name[2:]}{extension}"
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
