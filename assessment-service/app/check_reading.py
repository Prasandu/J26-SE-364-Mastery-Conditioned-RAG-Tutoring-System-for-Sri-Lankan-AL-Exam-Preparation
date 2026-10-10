"""Read one handwriting photo and print what the vision model saw (no database needed).

Run:  python -m app.check_reading samples/handwriting/hw1.jpg
      python -m app.check_reading samples/handwriting/hw1.jpg --question "Calculate the concentration"
"""

import argparse
import sys
from pathlib import Path

import openai
from google.genai import errors as genai_errors

from app.ai import build_reader
from app.config import get_settings
from app.services.chemistry.notation import normalize
from app.services.reader import ReadRequest
from app.services.storage import CONTENT_TYPES

SUFFIXES = {suffix: content_type for content_type, suffix in CONTENT_TYPES.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--question", help="The question the student was answering")
    args = parser.parse_args()

    content_type = SUFFIXES.get(args.image.suffix.lower())
    if content_type is None:
        sys.exit(f"{args.image.suffix} is not supported. Use one of: {', '.join(sorted(SUFFIXES))}")
    if not args.image.is_file():
        sys.exit(f"No such file: {args.image}")

    settings = get_settings()
    reader = build_reader(settings)
    if reader is None:
        sys.exit(f"No API key for VISION_PROVIDER={settings.vision_provider}. Add it to .env first.")

    print(f"Provider: {settings.vision_provider}\nModel: {reader.name}\nImage: {args.image}")
    print("\nReading... (a full page can take up to a minute)\n", flush=True)
    try:
        result = reader.read(
            ReadRequest(image=args.image.read_bytes(), content_type=content_type, question=args.question)
        )
    except (genai_errors.APIError, openai.APIError) as error:
        sys.exit(f"Vision model error: {error}")

    print(f"Confidence : {result.confidence:.2f}")
    print(f"Has drawing: {result.has_drawing}")
    if result.unclear:
        print(f"Unclear    : {', '.join(result.unclear)}")
    print("\n--- transcription ---")
    print(result.text)
    print("\n--- after chemistry normalization ---")
    print(normalize(result.text))


if __name__ == "__main__":
    main()
