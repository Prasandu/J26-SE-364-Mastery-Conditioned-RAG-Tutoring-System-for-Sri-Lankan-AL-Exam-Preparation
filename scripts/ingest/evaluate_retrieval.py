"""Evaluate retrieval on the versioned gold set with the real local E5 model.

Usage (from the repository root, rag environment):
  uv run --project apps/api --group rag python scripts/ingest/evaluate_retrieval.py

Reads the committed manifest and the private chunk file, embeds each gold question with the
pinned model revision, and reports Recall@1/3/4/8 and MRR@8 for hybrid and vector-only retrieval,
English versus Sinhala-question to English-evidence, plus misses by page and the refusal
behaviour on unsupported and injection questions (fake extractive generator, not a real LLM).
Writes data/eval/<goldVersion>.json (private) and prints a Markdown summary.
"""

import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.rag.embeddings import E5LocalProvider  # noqa: E402
from app.rag.evaluation import K_VALUES, load_gold, score_question, summarize  # noqa: E402
from app.rag.generation import (  # noqa: E402
    Evidence,
    FakeGenerationProvider,
    GenerationRequest,
    looks_like_injection,
    parse_output,
    unsupported_reason,
)
from app.rag.repository import InMemoryKnowledgeRepository, load_knowledge_files  # noqa: E402
from app.rag.retrieval import Retriever  # noqa: E402


def table(title: str, groups: dict[str, list[dict[str, object]]]) -> str:
    head = "| " + " | ".join(["Group", "n", *[f"R@{k}" for k in K_VALUES], "MRR@8"]) + " |"
    lines = [f"**{title}**", "", head, "|" + "---|" * (len(K_VALUES) + 3)]
    for name, rows in groups.items():
        s = summarize(rows)  # type: ignore[arg-type]
        cells = [name, str(s["questions"]), *[f"{s[f'recall@{k}']:.3f}" for k in K_VALUES]]
        lines.append("| " + " | ".join([*cells, f"{s['mrr@8']:.3f}"]) + " |")
    return "\n".join(lines)


def main() -> int:
    manifest = ROOT / "content" / "knowledge" / "manifest.v1.json"
    version, chunks = load_knowledge_files(manifest, ROOT / "data" / "knowledge")
    repo = InMemoryKnowledgeRepository()
    repo.ingest(version, chunks)
    repo.set_active(version.knowledge_version)
    embeddings = E5LocalProvider(version.embedding_model, version.model_revision)
    retriever = Retriever(repo, embeddings)
    gold_meta, questions = load_gold(
        ROOT / "content" / "knowledge" / "gold" / "retrieval-gold.v1.json"
    )
    if gold_meta["knowledgeVersion"] != version.knowledge_version:
        raise SystemExit("gold set was written for a different knowledge version")

    results: dict[str, dict[str, list[dict[str, object]]]] = {"hybrid": {}, "vector": {}}
    misses: Counter[str] = Counter()
    refusals: list[dict[str, object]] = []
    generator = FakeGenerationProvider()
    for q in questions:
        if q.kind == "supported":
            for mode in ("hybrid", "vector"):
                retrieval = retriever.retrieve(q.question, vector_only=mode == "vector")
                row = score_question(q, [c.chunk for c in retrieval.candidates])
                results[mode].setdefault(q.language, []).append(row)
                if mode == "hybrid":
                    misses.update(row["missedAt4"])  # type: ignore[arg-type]
            continue
        flagged = looks_like_injection(q.question)
        refused, top_score = True, None
        if not flagged:
            retrieval = retriever.retrieve(q.question)
            top_score = retrieval.candidates[0].vector_score if retrieval.candidates else None
            evidence = tuple(
                Evidence(c.chunk.chunk_id, c.chunk.heading, c.chunk.text)
                for c in retrieval.evidence
            )
            output = parse_output(
                generator.generate(GenerationRequest(q.question, q.language, evidence))
            )
            refused = unsupported_reason(output, evidence, 180) is not None
        refusals.append(
            {
                "id": q.question_id,
                "kind": q.kind,
                "screened": flagged,
                "refused": refused,
                "topScore": top_score,
            }
        )

    supported_top = [
        retriever.retrieve(q.question, vector_only=True).candidates[0].vector_score
        for q in questions
        if q.kind == "supported"
    ]
    report = {
        "date": date.today().isoformat(),
        "goldVersion": gold_meta["goldVersion"],
        "knowledgeVersion": version.knowledge_version,
        "embeddingModel": version.embedding_model,
        "modelRevision": embeddings.revision,
        "dimension": embeddings.dimension,
        "corpusChunks": version.chunk_count,
        "inScopeChunks": sum(1 for c in chunks if c.in_scope),
        "summary": {
            mode: {lang: summarize(rows) for lang, rows in by_lang.items()}
            for mode, by_lang in results.items()
        },
        "rows": results,
        "missesAt4ByPage": dict(misses.most_common()),
        "refusals": refusals,
        "supportedTopVectorScore": {"min": min(supported_top), "max": max(supported_top)},
    }
    out = ROOT / "data" / "eval" / f"{gold_meta['goldVersion']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Model {version.embedding_model} @ {embeddings.revision} ({embeddings.dimension} d)")
    print(
        f"Knowledge {version.knowledge_version}: {version.chunk_count} chunks; "
        f"gold {gold_meta['goldVersion']}\n"
    )
    for mode in ("hybrid", "vector"):
        groups = {
            "English": results[mode].get("en", []),
            "Sinhala → English": results[mode].get("si", []),
        }
        groups["All"] = groups["English"] + groups["Sinhala → English"]
        print(table(f"{mode} retrieval", groups) + "\n")
    print("Misses at 4 (hybrid), by label:")
    for label, count in misses.most_common():
        print(f"- {label}: {count}")
    print("\nUnsupported / injection:")
    for r in refusals:
        print(f"- {r['id']}: screened={r['screened']} refused={r['refused']} top={r['topScore']}")
    print(
        f"\nSupported top-1 vector score range: {min(supported_top):.3f}–{max(supported_top):.3f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
