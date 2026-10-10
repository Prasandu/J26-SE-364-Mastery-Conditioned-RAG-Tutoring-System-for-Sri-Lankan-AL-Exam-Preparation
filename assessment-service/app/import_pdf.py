"""Read a scanned past paper or marking scheme into a JSON draft you can check and fix.

  python -m app.import_pdf paper.pdf --pages 2-5 --out drafts/2024_p1.json
  python -m app.import_pdf scheme.pdf --pages 3 --kind scheme --out drafts/2024_key.json

Nothing is published. Open the JSON, correct anything the model misread, then load it
with `python -m app.load_draft`.
"""

import argparse
import json
import sys
from pathlib import Path

import openai
from google.genai import errors as genai_errors

from app.ai import build_vision_model
from app.config import get_settings
from app.services.extractor import ContentExtractor
from app.services.pdf import page_count, parse_pages, render_pages

PAGES_PER_REQUEST = 2  # more pages in one request means less context per page


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

    print(f"{args.pdf.name}: {page_count(args.pdf)} pages, reading {len(pages)}")
    print(f"Model: {model.name}\n", flush=True)

    extractor = ContentExtractor(model)
    collected: list[dict] = []
    notes: list[str] = []
    for batch in _batches(pages, args.batch):
        print(f"  pages {batch[0]}-{batch[-1]} ...", end=" ", flush=True)
        try:
            result = _read_batch(extractor, args, batch)
        except (genai_errors.APIError, openai.APIError) as error:
            print("failed")
            notes.append(f"Pages {batch[0]}-{batch[-1]} could not be read: {error}")
            continue
        collected.append(result)
        notes.extend(f"p{batch[0]}-{batch[-1]}: {note}" for note in result.pop("notes", []))
        print("done")

    draft = {
        "source": args.pdf.name,
        "kind": args.kind,
        "pages": args.pages,
        "model": model.name,
        "notes": notes,
        "extracted": collected,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(draft, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nSaved {args.out}")
    print(_summary(args.kind, collected))
    if notes:
        print("\nCheck these:")
        print("\n".join(f"  - {note}" for note in notes))
    print("\nOpen the file, fix anything misread, then run: python -m app.load_draft", args.out)


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
    args = parser.parse_args()
    if not args.pdf.is_file():
        parser.error(f"No such file: {args.pdf}")
    return args


def _read_batch(extractor: ContentExtractor, args: argparse.Namespace, batch: list[int]) -> dict:
    images = render_pages(args.pdf, batch)
    read = extractor.read_paper if args.kind == "paper" else extractor.read_scheme
    return read(images, args.hint).model_dump()


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
