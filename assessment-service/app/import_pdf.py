"""Read a scanned past paper or marking scheme into a JSON draft you can check and fix.

  python -m app.import_pdf paper.pdf --pages 2-5 --out drafts/2024_p1.json
  python -m app.import_pdf scheme.pdf --pages 3 --kind scheme --out drafts/2024_key.json

Pages that fail (busy model, daily limit) can be read later and added to the same draft:

  python -m app.import_pdf paper.pdf --pages 7-8 --out drafts/2024_p1.json --append

Nothing is published. Open the JSON, correct anything the model misread, then load it
with `python -m app.load_draft` (or `app.load_scheme` for a marking scheme).
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import httpx
import openai
from google.genai import errors as genai_errors
from pydantic import ValidationError

from app.ai import build_vision_model
from app.config import get_settings
from app.services.drafts import draft_problems
from app.services.extractor import ContentExtractor
from app.services.pdf import page_count, parse_pages, render_pages

PAGES_PER_REQUEST = 2  # more pages in one request means less context per page
QUOTA_EXHAUSTED = 429
FAILURE_NOTE = "could not be read"  # how older drafts recorded failures in notes
# A busy or refusing model, a dropped connection, or a reply that is not valid JSON.
READ_ERRORS = (genai_errors.APIError, openai.APIError, httpx.HTTPError, ValidationError)


def main() -> None:
    args = _parse_args()
    settings = get_settings()
    model = build_vision_model(settings)
    if model is None:
        sys.exit(f"No API key for VISION_PROVIDER={settings.vision_provider}. Add it to .env first.")

    try:
        pages = parse_pages(args.pages)
    except ValueError as error:
        sys.exit(f"Bad --pages value: {error}")

    previous = _previous_draft(args) if args.append else None

    print(f"{args.pdf.name}: {page_count(args.pdf)} pages, reading {len(pages)}")
    print(f"Model: {model.name}\n", flush=True)

    extractor = ContentExtractor(model)
    parts: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    batches = _batches(pages, args.batch)
    for index, batch in enumerate(batches):
        print(f"  pages {batch[0]}-{batch[-1]} ...", end=" ", flush=True)
        try:
            parts.append(_read_batch(extractor, args, batch))
            print("done")
        except READ_ERRORS as error:
            print(f"failed ({type(error).__name__})")
            failed.append({"pages": batch, "error": str(error)})
            if _status(error) == QUOTA_EXHAUSTED:
                skipped = [page for later in batches[index + 1 :] for page in later]
                if skipped:
                    failed.append({"pages": skipped, "error": "Skipped: the daily limit was reached"})
                print("  Daily limit reached, stopping here.")
                break
        finally:
            # Saved after every page, so a crash never throws away pages already read.
            draft = _save(args, merge_drafts(previous, _new_draft(args, model.name, parts, failed)))

    _report(args, draft)


def merge_drafts(previous: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    """Add newly read pages to an earlier draft. Re-read pages replace the old reading."""
    if previous is None:
        return new

    read_now = {page for part in new["extracted"] for page in part.get("pages", [])}
    kept = [part for part in previous["extracted"] if not read_now & set(part.get("pages", []))]
    still_failed = [
        {**entry, "pages": [page for page in entry["pages"] if page not in read_now]}
        for entry in previous.get("failed", [])
    ]
    return {
        **previous,
        "pages": f"{previous.get('pages', '')},{new['pages']}".strip(","),
        "model": new["model"],
        "notes": [note for note in previous.get("notes", []) if FAILURE_NOTE not in note] + new["notes"],
        "failed": [entry for entry in still_failed if entry["pages"]] + new["failed"],
        "extracted": sorted(kept + new["extracted"], key=_first_page),
    }


def _new_draft(args: argparse.Namespace, model: str, parts: list[dict], failed: list[dict]) -> dict:
    notes = [f"p{part['pages'][0]}-{part['pages'][-1]}: {note}" for part in parts for note in part["notes"]]
    return {
        "source": args.pdf.name,
        "kind": args.kind,
        "pages": args.pages,
        "model": model,
        "notes": notes,
        "failed": list(failed),
        "extracted": [{key: value for key, value in part.items() if key != "notes"} for part in parts],
    }


def _save(args: argparse.Namespace, draft: dict[str, Any]) -> dict[str, Any]:
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(draft, indent=2, ensure_ascii=False), encoding="utf-8")
    return draft


def _previous_draft(args: argparse.Namespace) -> dict[str, Any] | None:
    if not args.out.is_file():
        return None
    previous = json.loads(args.out.read_text(encoding="utf-8"))
    if previous.get("kind") != args.kind or previous.get("source") != args.pdf.name:
        sys.exit(
            f"{args.out} holds a {previous.get('kind')} draft of {previous.get('source')}; not appending."
        )
    return previous


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--pages", required=True, help='Which pages, e.g. "2-5" or "2,4,9"')
    parser.add_argument("--kind", choices=("paper", "scheme"), default="paper")
    parser.add_argument("--out", type=Path, required=True, help="Where to save the JSON draft")
    parser.add_argument("--hint", help='Context for the model, e.g. "Paper I, multiple choice"')
    parser.add_argument("--batch", type=int, default=PAGES_PER_REQUEST, help="Pages per request")
    parser.add_argument(
        "--append", action="store_true", help="Add to an existing draft instead of replacing it"
    )
    args = parser.parse_args()
    if not args.pdf.is_file():
        parser.error(f"No such file: {args.pdf}")
    return args


def _read_batch(extractor: ContentExtractor, args: argparse.Namespace, batch: list[int]) -> dict:
    images = render_pages(args.pdf, batch)
    read = extractor.read_paper if args.kind == "paper" else extractor.read_scheme
    return {"pages": batch, **read(images, args.hint).model_dump()}


def _report(args: argparse.Namespace, draft: dict[str, Any]) -> None:
    print(f"\nSaved {args.out}")
    print(_summary(args.kind, draft["extracted"]))
    if draft["notes"]:
        print("\nCheck these:")
        print("\n".join(f"  - {note}" for note in draft["notes"]))

    problems = draft_problems(draft)
    if problems:
        print("\nThe model may have missed something:")
        print("\n".join(f"  - {p.message}{_page_note(p.pages)}" for p in problems))

    failed = {page for entry in draft["failed"] for page in entry["pages"]}
    reread = sorted(failed | {page for problem in problems for page in problem.pages})
    if reread:
        print(f"\nRead these pages again, one at a time (more reliable): {_pages(reread)}")
        print(
            f'  python -m app.import_pdf "{args.pdf}" --pages {_pages(reread)} '
            f"--kind {args.kind} --out {args.out} --batch 1 --append"
        )
        return

    loader = "app.load_draft" if args.kind == "paper" else "app.load_scheme"
    print(f"\nOpen the file, fix anything misread, then write a plan and run: python -m {loader}")


def _pages(pages: list[int]) -> str:
    return ",".join(map(str, pages))


def _page_note(pages: list[int]) -> str:
    return f" (pages {_pages(pages)})" if pages else ""


def _status(error: Exception) -> int | None:
    return getattr(error, "code", None) or getattr(error, "status_code", None)


def _first_page(part: dict[str, Any]) -> int:
    return part["pages"][0] if part.get("pages") else 0  # parts from older drafts keep their place


def _batches(pages: list[int], size: int) -> list[list[int]]:
    return [pages[i : i + size] for i in range(0, len(pages), size)]


def _summary(kind: str, collected: list[dict]) -> str:
    if kind == "paper":
        total = sum(len(part["questions"]) for part in collected)
        return f"Found {total} questions."
    questions = sum(len(part["questions"]) for part in collected)
    keys = sum(len(part["mcq_answers"]) for part in collected)
    return f"Found {questions} marked questions and {keys} answer-key entries."


if __name__ == "__main__":
    main()
