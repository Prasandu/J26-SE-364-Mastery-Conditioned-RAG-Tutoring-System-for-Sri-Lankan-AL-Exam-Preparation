"""Run a set of real Chemistry questions through the actual /tutor/ask
pipeline and save question+answer+citations to a markdown file for human
(teacher-style) review. Correctness of free-text Chemistry explanations is
not something this script judges — a human has to actually read and check
each one.

Usage:
    python scripts/run_correctness_benchmark.py
"""

import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(errors="replace")

from app.db import SessionLocal  # noqa: E402
from app.services.tutoring.grounded_answer import answer_question  # noqa: E402

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "knowledge" / "evaluations"


@dataclass
class BenchmarkQuestion:
    question: str
    language: str
    unit: str
    note: str = ""


QUESTIONS = [
    BenchmarkQuestion("What is electronegativity?", "en", "1"),
    BenchmarkQuestion(
        "Explain Rutherford's gold foil experiment and what it showed about atomic structure.",
        "en",
        "1",
    ),
    BenchmarkQuestion("State the Aufbau principle.", "en", "1"),
    BenchmarkQuestion("What is Hund's rule?", "en", "1"),
    BenchmarkQuestion("Explain the trend in ionization energy across a period.", "en", "1"),
    BenchmarkQuestion("What is VSEPR theory and how is it used to predict molecular shape?", "en", "2"),
    BenchmarkQuestion("What is dipole moment?", "en", "2"),
    BenchmarkQuestion("Explain the difference between ionic bonds and metallic bonds.", "en", "2"),
    BenchmarkQuestion("What is a mole and how is it related to the Avogadro constant?", "en", "3"),
    BenchmarkQuestion("Explain the difference between empirical formula and molecular formula.", "en", "3"),
    BenchmarkQuestion("What is molarity and how is it calculated?", "en", "3"),
    BenchmarkQuestion("Explain oxidation numbers with an example.", "en", "3"),
    BenchmarkQuestion("What is the flame test used for in identifying cations?", "en", "6"),
    BenchmarkQuestion("Describe the chemistry of nitrogen oxoacids.", "en", "6"),
    BenchmarkQuestion("What are coordination compounds of transition metals?", "en", "6"),
    # Sinhala: kept to phrasing already manually verified in earlier testing
    # (see docs/DEVELOPMENT_PROGRESS.md Step 7). Limitation, noted honestly:
    # this script was not able to add many new Sinhala Chemistry questions
    # with confidence in translation accuracy — a native speaker should
    # extend this set with more Sinhala questions for a fuller benchmark.
    BenchmarkQuestion("මෝලයක් කියන්නේ මොකක්ද?", "si", "3"),
    BenchmarkQuestion("අයනික බන්ධන යනු කුමක්ද?", "si", "2"),
]


def main() -> None:
    db = SessionLocal()
    lines = [
        "# Chemistry correctness benchmark",
        "",
        f"Generated: {datetime.now(UTC).isoformat()}",
        "",
        "For each question below: read the answer, check it against the NIE syllabus/",
        "resource book, and mark Correct / Incorrect / Partially correct. Note any",
        "factual errors, missing nuance, or citation issues.",
        "",
        "**Known gap**: only 2 Sinhala questions here, both reusing phrasing already",
        "manually verified in earlier testing — more Sinhala questions from a native",
        "speaker would make this benchmark more complete.",
        "",
        "---",
        "",
    ]

    try:
        for i, bq in enumerate(QUESTIONS, 1):
            result = answer_question(db, bq.question, bq.language)
            citations_str = (
                "; ".join(f"{c.document_title}, Unit {c.unit}, p.{c.page_number}" for c in result.citations)
                or "(none)"
            )
            lines.append(f"## {i}. [{bq.language.upper()}] {bq.question}")
            lines.append("")
            lines.append(f"**Expected unit:** {bq.unit}")
            lines.append("")
            lines.append(f"**Grounded:** {result.grounded}")
            lines.append("")
            lines.append("**Answer:**")
            lines.append("")
            lines.append(result.answer)
            lines.append("")
            lines.append(f"**Citations:** {citations_str}")
            lines.append("")
            lines.append("**Review:** [ ] Correct  [ ] Partially correct  [ ] Incorrect")
            lines.append("")
            lines.append("**Notes:**")
            lines.append("")
            lines.append("---")
            lines.append("")
            print(f"[{i}/{len(QUESTIONS)}] done: {bq.question[:50]}")
    finally:
        db.close()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "correctness_benchmark.md"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWritten to {out_path}")


if __name__ == "__main__":
    main()
