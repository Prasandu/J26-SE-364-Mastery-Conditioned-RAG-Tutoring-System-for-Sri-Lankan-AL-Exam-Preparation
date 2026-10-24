"""Does walking the syllabus graph retrieve better material than similarity alone?

  python -m app.measure_graph                       every topic a question can use
  python -m app.measure_graph --topics U13,U09_5    just these
  python -m app.measure_graph --csv out.csv         for the report

The two arms are the same code path. The baseline retrieves passages for the chosen
topic only, exactly as the system did before the graph existed; the graph arm also
retrieves for what that topic needs first. Nothing else differs, so a difference in
what comes back is the graph's doing and not a change of model or of prompt.

No AI is called: retrieval is a local embedding and a vector search, so this can be
re-run as often as the numbers need checking. Generation quality is a separate
question and costs API calls - this measures what the model is given, not what it
then writes.
"""

import argparse
import csv
import sys
from dataclasses import dataclass
from pathlib import Path

from app.ai import build_embedding_model
from app.config import get_settings
from app.db import SessionLocal
from app.services.generator.grounding import resource_passages
from app.services.topic_graph import prerequisites
from app.services.topics import topics_by_code


@dataclass(frozen=True)
class Arm:
    """What one retrieval arm got back for one topic."""

    passages: int
    pages: int
    resources: int

    @classmethod
    def of(cls, sources) -> "Arm":
        return cls(
            passages=len(sources),
            pages=len({source.page_number for source in sources}),
            resources=len({source.resource_code for source in sources}),
        )


@dataclass(frozen=True)
class Row:
    code: str
    needs: int
    baseline: Arm
    graph: Arm

    @property
    def extra_passages(self) -> int:
        return self.graph.passages - self.baseline.passages

    @property
    def extra_pages(self) -> int:
        return self.graph.pages - self.baseline.pages


def main() -> None:
    args = _parse_args()
    settings = get_settings()
    embedder = build_embedding_model(settings)
    if embedder is None:
        sys.exit("No embedding model configured, so there is nothing to retrieve with.")

    with SessionLocal() as db:
        known = topics_by_code(db)
        codes = _chosen(args, known)
        print(f"{len(codes)} topic(s), retrieving twice each: once alone, once with what it needs\n")

        rows = [_measure(db, embedder, known, code) for code in codes]

    _report(rows)
    if args.csv:
        _write_csv(args.csv, rows)
        print(f"\nWritten to {args.csv}")


def _measure(db, embedder, known: dict, code: str) -> Row:
    topic = known[code]
    needed = [known[reached.code] for reached in prerequisites(db, [code]) if reached.code in known]

    _, alone = resource_passages(db, embedder, [topic])
    _, with_graph = resource_passages(db, embedder, [topic, *needed])
    return Row(code=code, needs=len(needed), baseline=Arm.of(alone), graph=Arm.of(with_graph))


def _report(rows: list[Row]) -> None:
    print(f"{'topic':9} {'needs':>5} {'passages':>18} {'pages':>14}")
    print(f"{'':9} {'':>5} {'alone':>8} {'+graph':>9} {'alone':>6} {'+graph':>7}")
    for row in rows:
        print(
            f"{row.code:9} {row.needs:5} {row.baseline.passages:8} {row.graph.passages:9}"
            f" {row.baseline.pages:6} {row.graph.pages:7}"
        )

    helped = [row for row in rows if row.extra_passages > 0]
    print(f"\n  topics the graph gave more material for : {len(helped)} of {len(rows)}")
    if rows:
        before = sum(row.baseline.passages for row in rows)
        after = sum(row.graph.passages for row in rows)
        print(f"  passages retrieved in total             : {before} -> {after}")
        mean_before, mean_after = before / len(rows), after / len(rows)
        print(f"  mean passages per topic                 : {mean_before:.1f} -> {mean_after:.1f}")
    if helped:
        gained = sum(row.extra_pages for row in helped)
        print(f"  extra textbook pages reached            : {gained}")
    print("\n  A topic with no approved prerequisite retrieves the same either way,")
    print("  so the rows with needs=0 are the graph correctly changing nothing.")


def _chosen(args: argparse.Namespace, known: dict) -> list[str]:
    if args.topics:
        wanted = [code.strip() for code in args.topics.split(",") if code.strip()]
        if unknown := [code for code in wanted if code not in known]:
            sys.exit(f"Unknown topic(s): {', '.join(unknown)}")
        return wanted
    # Only the ones a question can really be tagged with: a topic that just groups
    # others is never asked about on its own.
    parents = {topic.parent_id for topic in known.values() if topic.parent_id}
    return sorted(code for code, topic in known.items() if topic.id not in parents)


def _write_csv(path: Path, rows: list[Row]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            ["topic", "prerequisites", "passages_alone", "passages_graph", "pages_alone", "pages_graph"]
        )
        for row in rows:
            writer.writerow(
                [
                    row.code,
                    row.needs,
                    row.baseline.passages,
                    row.graph.passages,
                    row.baseline.pages,
                    row.graph.pages,
                ]
            )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--topics", help="Comma separated topic codes; default is all askable ones")
    parser.add_argument("--csv", type=Path, help="Write the per-topic rows here")
    return parser.parse_args()


if __name__ == "__main__":
    main()
