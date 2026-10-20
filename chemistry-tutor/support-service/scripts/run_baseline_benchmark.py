"""Run the same question set as run_correctness_benchmark.py through a plain,
ungrounded LLM call (no retrieval, no citations, no abstention) to produce a
baseline for the thesis's baseline-vs-proposed-method comparison. The
proposed method is the grounded RAG pipeline in
knowledge/evaluations/correctness_benchmark.md; this script's output is the
"no RAG" baseline over the identical question set, so the two are directly
comparable question-by-question.

Usage:
    python scripts/run_baseline_benchmark.py
"""

import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(errors="replace")

from app.services.tutoring.llm_adapter import get_llm_provider  # noqa: E402

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "knowledge" / "evaluations"

BASELINE_SYSTEM_PROMPT = {
    "en": (
        "You are a Chemistry tutor for Sri Lankan G.C.E. Advanced Level students. "
        "Answer using your own general chemistry knowledge. Respond in English."
    ),
    "si": (
        "You are a Chemistry tutor for Sri Lankan G.C.E. Advanced Level students. "
        "Answer using your own general chemistry knowledge. Respond in Sinhala."
    ),
}


@dataclass
class BenchmarkQuestion:
    question: str
    language: str
    unit: str


# Identical question set and ordering to run_correctness_benchmark.py, so
# results line up 1:1 against the grounded-RAG benchmark.
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
    BenchmarkQuestion("මෝලයක් කියන්නේ මොකක්ද?", "si", "3"),
    BenchmarkQuestion("අයනික බන්ධන යනු කුමක්ද?", "si", "2"),
]


def main() -> None:
    provider = get_llm_provider()
    lines = [
        "# Chemistry baseline benchmark (ungrounded, no RAG)",
        "",
        f"Generated: {datetime.now(UTC).isoformat()}",
        "",
        "Same 17 questions as correctness_benchmark.md, answered with NO retrieval,",
        "NO citations, and NO abstention logic — just the raw LLM's own chemistry",
        "knowledge. This is the baseline for the thesis's baseline-vs-proposed-method",
        "comparison; the proposed method's results are in correctness_benchmark.md.",
        "",
        "For each question below: read the answer, check it against the NIE syllabus/",
        "resource book, and mark Correct / Incorrect / Partially correct, same as the",
        "proposed-method benchmark.",
        "",
        "---",
        "",
    ]

    for i, bq in enumerate(QUESTIONS, 1):
        system_prompt = BASELINE_SYSTEM_PROMPT[bq.language]
        try:
            answer = provider.generate_response(system_prompt, bq.question)
        except Exception as exc:  # pragma: no cover - benchmark script, not app code
            answer = f"(LLM call failed: {exc})"

        lines.append(f"## {i}. [{bq.language.upper()}] {bq.question}")
        lines.append("")
        lines.append(f"**Expected unit:** {bq.unit}")
        lines.append("")
        lines.append("**Grounded:** False (baseline — no retrieval)")
        lines.append("")
        lines.append("**Answer:**")
        lines.append("")
        lines.append(answer)
        lines.append("")
        lines.append("**Citations:** (none — baseline has no retrieval step)")
        lines.append("")
        lines.append("**Review:** [ ] Correct  [ ] Partially correct  [ ] Incorrect")
        lines.append("")
        lines.append("**Notes:**")
        lines.append("")
        lines.append("---")
        lines.append("")
        print(f"[{i}/{len(QUESTIONS)}] done: {bq.question[:50]}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "baseline_benchmark.md"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWritten to {out_path}")


if __name__ == "__main__":
    main()
