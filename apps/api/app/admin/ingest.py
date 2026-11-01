"""Untrusted admin PDF ingestion: validation, isolated extraction, and safe metadata.

Separate from the checksum-verified approved-source pipeline (``app.knowledge``): nothing here
can add pages to the assistant's knowledge base, and uploads are never sent to any external
model or service.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path

EXTRACTOR_VERSION = "admin-extract-1.0.0"
WORKER = Path(__file__).with_name("pdf_worker.py")
MAX_CHARS_PER_PAGE = 50_000
MAX_WORKER_OUTPUT = 32 * 1024 * 1024
PDF_SIGNATURE = b"%PDF-"


class DocumentRejected(Exception):
    """A safe, client-presentable rejection (no document content, paths or tracebacks)."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass(frozen=True)
class ExtractedDocument:
    page_count: int
    pages: tuple[str, ...]


def check_signature(data: bytes) -> None:
    """The bytes themselves must be a PDF; MIME type and filename are not trusted."""
    if not data.startswith(PDF_SIGNATURE):
        raise DocumentRejected(422, "document_invalid", "The file is not a PDF document.")


def safe_display_name(raw: str | None) -> str:
    """A display-only name: no paths, controls or odd characters; never used to build a path."""
    name = unicodedata.normalize("NFC", raw or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = re.sub(r"[^\w .()\-]+", "_", name).strip(" .")[:120]
    return name or "document.pdf"


def _worker_env() -> dict[str, str]:
    """Minimal environment for the isolated interpreter (Windows needs SYSTEMROOT to start)."""
    env = {"PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"}
    for key in ("SYSTEMROOT", "WINDIR", "TEMP", "TMP"):
        if key in os.environ:
            env[key] = os.environ[key]
    return env


def extract_text(data: bytes, *, max_pages: int, timeout_seconds: float) -> ExtractedDocument:
    """Run the isolated worker on a private temporary copy and validate its output."""
    with tempfile.TemporaryDirectory(prefix="vlab-admin-") as folder:
        path = Path(folder) / "upload.pdf"
        path.write_bytes(data)
        try:
            completed = subprocess.run(  # noqa: S603 - fixed argv: our interpreter and worker
                [
                    sys.executable,
                    "-I",
                    str(WORKER),
                    str(path),
                    str(max_pages),
                    str(MAX_CHARS_PER_PAGE),
                ],
                capture_output=True,
                timeout=timeout_seconds,
                cwd=folder,
                env=_worker_env(),
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise DocumentRejected(
                422, "extraction_timeout", "Text extraction took too long and was stopped."
            ) from exc
    if len(completed.stdout) > MAX_WORKER_OUTPUT:
        raise DocumentRejected(422, "extraction_failed", "The document produced too much text.")
    try:
        result = json.loads(completed.stdout.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise DocumentRejected(422, "extraction_failed", "Text extraction failed.") from exc
    if not result.get("ok"):
        error = result.get("error")
        if error == "encrypted":
            raise DocumentRejected(
                422, "document_encrypted", "Encrypted or password-protected PDFs are not accepted."
            )
        if error == "too_many_pages":
            raise DocumentRejected(
                422,
                "document_too_many_pages",
                f"The PDF has more than the maximum of {max_pages} pages.",
            )
        raise DocumentRejected(422, "document_invalid", "The PDF could not be read.")
    pages = result.get("pages")
    if not isinstance(pages, list) or not all(isinstance(p, str) for p in pages):
        raise DocumentRejected(422, "extraction_failed", "Text extraction failed.")
    if not any(p.strip() for p in pages):
        raise DocumentRejected(
            422,
            "document_no_text",
            "No extractable text was found (scanned PDFs need OCR, which is not supported).",
        )
    return ExtractedDocument(page_count=len(pages), pages=tuple(pages))
