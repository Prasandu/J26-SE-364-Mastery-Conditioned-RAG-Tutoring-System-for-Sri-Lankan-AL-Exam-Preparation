"""Showing what the drafts behind a plan still need."""

import sys


def warn_about(found: tuple[list[str], list[str]], force: bool) -> None:
    """Print anything a person should know, and stop if something must be fixed first."""
    blocking, notes = found
    if notes:
        print("Worth knowing:")
        print("\n".join(f"  - {note}" for note in notes))
    if not blocking:
        return

    print("The drafts look incomplete:")
    print("\n".join(f"  - {problem}" for problem in blocking))
    if not force:
        sys.exit("\nRe-read those pages with app.import_pdf --append, or use --force to load anyway.")
