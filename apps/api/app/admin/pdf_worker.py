"""Isolated text extraction for one untrusted PDF (run as a separate ``python -I`` process).

Usage: python -I pdf_worker.py <pdf-path> <max-pages> <max-chars-per-page>

Prints one JSON object on stdout:
  {"ok": true, "pageCount": n, "pages": ["text", ...]}
  {"ok": false, "error": "encrypted" | "too_many_pages" | "unparseable" | "no_pages"}

Standard library + pypdf only. pypdf parses the file; it never executes embedded JavaScript,
launch actions or attachments. On POSIX, memory and CPU are capped here; the parent process
always enforces a wall-clock timeout and an output-size limit.
"""

import json
import logging
import sys


def _limit_resources() -> None:
    if sys.platform == "win32":
        return  # no rlimits on Windows: the parent's timeout and output cap still apply
    import resource

    gigabyte = 1024**3
    resource.setrlimit(resource.RLIMIT_AS, (2 * gigabyte, 2 * gigabyte))
    resource.setrlimit(resource.RLIMIT_CPU, (120, 120))


def _emit(payload: dict[str, object]) -> int:
    # ASCII-only JSON: -I ignores PYTHONIOENCODING, so the console encoding is unknown.
    sys.stdout.write(json.dumps(payload, ensure_ascii=True))
    sys.stdout.flush()
    return 0


def main() -> int:
    _limit_resources()
    logging.disable(logging.CRITICAL)  # pypdf warnings may echo document content
    path, max_pages, max_chars = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    try:
        from pypdf import PdfReader

        reader = PdfReader(path, strict=False)
        if reader.is_encrypted:
            return _emit({"ok": False, "error": "encrypted"})
        count = len(reader.pages)
        if count == 0:
            return _emit({"ok": False, "error": "no_pages"})
        if count > max_pages:
            return _emit({"ok": False, "error": "too_many_pages", "pageCount": count})
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ""
            pages.append(text[:max_chars])
    except Exception:  # noqa: BLE001 - any parser failure is "unparseable"; never echo details
        return _emit({"ok": False, "error": "unparseable"})
    return _emit({"ok": True, "pageCount": count, "pages": pages})


if __name__ == "__main__":
    raise SystemExit(main())
