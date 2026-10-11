"""Opt-in live evaluation of one generation provider (never part of pnpm check or pytest).

Usage (repository root, rag environment):
  uv run --project apps/api --group rag python scripts/ingest/evaluate_generation.py \
      [--provider groq] [--subset m2-groq] [--model M ...] [--runs 2] [--track both] \
      [--price-input-per-mtok X --price-output-per-mtok Y] [--fresh] --confirm-live

Without --confirm-live it prints the plan and a conservative token/cost estimate and sends
nothing (no key needed). With --confirm-live the provider key (OPENAI_API_KEY or GROQ_API_KEY, from
the environment or the untracked .env) is required. Each provider is evaluated DIRECTLY: the
failover router is bypassed so results are never contaminated by another model.

Steps: hidden-state preflight (no network); four-case smoke set per model (abort on a schema,
refusal or leakage failure); then oracle-context and end-to-end tracks, each case `--runs` times.
Completed cases are checkpointed privately under data/eval/generation/ (provider, model, track,
run, case). A 429 pauses the run (exit 3) and is never recorded as a quality result: rerun the same
command to resume without repeating completed calls. Retrieval, chunking, embeddings, top-k,
sources and gold labels are unchanged. Only aggregate metrics are meant for the committed report;
the keys and request headers are never stored or printed.

The default `m2-groq` subset is ten fixed cases (six supported bilingual cases and four
English/Sinhala refusal or adversarial cases). Use `--subset full` only for the complete
dataset; `--max-cases` remains an additional deterministic cap.
"""

import argparse
import json
import sys
import uuid
from datetime import UTC, date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.knowledge.models import KnowledgeChunk  # noqa: E402
from app.rag.assistant import SafeState  # noqa: E402
from app.rag.embeddings import E5LocalProvider  # noqa: E402
from app.rag.generation import (  # noqa: E402
    PROMPT_VERSION,
    Evidence,
    GenerationRequest,
    build_prompt,
)
from app.rag.generation_eval import (  # noqa: E402
    Case,
    Checkpoint,
    checkpoint_path,
    cost,
    estimate_input_tokens,
    gates,
    instability,
    is_critical,
    load_cases,
    oracle_evidence,
    public_row,
    request_budget,
    run_case,
    select_cases,
    summarize,
)
from app.rag.groq_provider import GroqGenerationProvider  # noqa: E402
from app.rag.openai_provider import OpenAIGenerationProvider  # noqa: E402
from app.rag.repository import InMemoryKnowledgeRepository, load_knowledge_files  # noqa: E402
from app.rag.retrieval import Retriever  # noqa: E402
from app.repositories import SessionRecord  # noqa: E402
from app.settings import Settings  # noqa: E402

CANDIDATES = ("gpt-6.1-sol", "gpt-6-luna")
MODELS = {"openai": CANDIDATES, "groq": ("qwen/qwen3.8-27b",)}
SMOKE = ("mass-en", "mass-si", "kmno4-en", "false-premise-30g-en")
CANARY_SEED = 918273645
CANARY_OWNER = "00000000-0000-4000-8000-00000000c0de"


def canary_session() -> SessionRecord:
    """A session full of values that must never reach a provider."""
    return SessionRecord(
        session_id=uuid.UUID("00000000-0000-4000-8000-0000000000ca"),
        owner_id=CANARY_OWNER,
        experiment_id="exp04_standard_solution",
        definition_version="1.1.0",
        assessment_version="1.0.0",
        mode="manual",
        guidance_level=None,
        locale="en",
        seed=CANARY_SEED,
        started_on="2026-10-10",
        created_at=datetime(2026, 10, 10, tzinfo=UTC),
        prelab=None,
        status="active",
        next_sequence=7,
        head_fingerprint="feedfacecafe00",
    )


def hidden_state_preflight(session: dict[str, object], record: SessionRecord) -> list[str]:
    request = GenerationRequest("q", "en", (Evidence("kc_" + "0" * 20, "H", "text"),), session)
    _, user = build_prompt(request)
    canaries = [str(record.seed), str(record.session_id), record.owner_id, record.head_fingerprint]
    return [c for c in canaries if c in user]


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--provider", choices=tuple(MODELS), default="groq")
    parser.add_argument("--model", action="append", help="repeatable; default: provider candidates")
    parser.add_argument("--runs", type=int, default=2)
    parser.add_argument(
        "--subset",
        choices=("m2-groq", "full"),
        default="m2-groq",
        help="deterministic case set; full preserves the complete evaluation workload",
    )
    parser.add_argument("--max-cases", type=int, default=None)
    parser.add_argument("--track", choices=("both", "oracle", "e2e"), default="both")
    parser.add_argument("--confirm-live", action="store_true")
    parser.add_argument("--fresh", action="store_true", help="archive the checkpoint and restart")
    parser.add_argument("--price-input-per-mtok", type=float, default=None)
    parser.add_argument("--price-output-per-mtok", type=float, default=None)
    args = parser.parse_args()
    models = args.model or list(MODELS[args.provider])
    unknown = [m for m in models if m not in MODELS[args.provider]]
    if unknown:
        parser.error(f"unknown {args.provider} model(s): {', '.join(unknown)}")
    tracks = ["oracle", "e2e"] if args.track == "both" else [args.track]
    smoke_track = "e2e" if "e2e" in tracks else tracks[0]

    settings = Settings()
    secret = settings.groq_api_key if args.provider == "groq" else settings.openai_api_key
    key = secret.get_secret_value() if secret else ""
    key_name = "GROQ_API_KEY" if args.provider == "groq" else "OPENAI_API_KEY"
    if args.confirm_live and not key.strip():
        print(f"{key_name} is not set: live evaluation not run (nothing was sent).")
        return 2

    version, chunks = load_knowledge_files(
        ROOT / "content" / "knowledge" / "manifest.v1.json", ROOT / "data" / "knowledge"
    )
    repo = InMemoryKnowledgeRepository()
    repo.ingest(version, chunks)
    repo.set_active(version.knowledge_version)
    retriever = Retriever(repo, E5LocalProvider(version.embedding_model, version.model_revision))
    gold = ROOT / "content" / "knowledge" / "gold"
    all_cases = load_cases(
        gold / "retrieval-gold.v1.json", gold / "generation-adversarial.v1.json"
    )
    try:
        cases = select_cases(all_cases, args.subset, args.max_cases)
    except ValueError as exc:
        parser.error(str(exc))
    smoke_cases = [c for c in cases if c.case_id in SMOKE]
    labels = {c.case_id: c.labels for c in cases}
    by_id = {c.chunk_id: c for c in chunks}

    record = canary_session()
    session = SafeState.of(record).public()
    leaked = hidden_state_preflight(session, record)
    if leaked:
        print(f"ABORT: hidden-state preflight failed ({len(leaked)} canaries in the request).")
        return 1

    def evidence_for(case: Case, track: str) -> list[KnowledgeChunk]:
        if track == "oracle" and case.kind == "supported":
            return oracle_evidence(case, chunks)
        return [c.chunk for c in retriever.retrieve(case.question).evidence]

    plan = {(c.case_id, t): evidence_for(c, t) for c in cases for t in tracks}
    model_cases = [(cid, t) for (cid, t), ev in plan.items() if ev and not _screened(cases, cid)]
    per_run_in = sum(
        estimate_input_tokens(
            GenerationRequest(
                _case(cases, cid).question,
                _case(cases, cid).language,
                tuple(Evidence(c.chunk_id, c.heading, c.text) for c in plan[(cid, t)]),
                session,
            )
        )
        for cid, t in model_cases
    )
    smoke_in = sum(
        estimate_input_tokens(
            GenerationRequest(
                case.question,
                case.language,
                tuple(
                    Evidence(c.chunk_id, c.heading, c.text)
                    for c in plan[(case.case_id, smoke_track)]
                ),
                session,
            )
        )
        for case in smoke_cases
        if plan[(case.case_id, smoke_track)] and not _screened(cases, case.case_id)
    )
    print(f"Provider: {args.provider} (direct; failover is bypassed for evaluation)")
    print(
        f"Models: {', '.join(models)} | tracks: {', '.join(tracks)} | "
        f"runs: {args.runs} | cases: {len(cases)} "
        f"({sum(1 for c in cases if c.kind == 'supported')} supported, "
        f"{sum(1 for c in cases if c.must_refuse)} must-refuse)"
    )
    print(f"Prompt {PROMPT_VERSION}; knowledge {version.knowledge_version}")
    for model in models:
        checkpoint = Checkpoint(checkpoint_path(ROOT, args.provider, model))
        pending_smoke = sum(
            1
            for c in smoke_cases
            if not checkpoint.done(args.provider, model, "smoke", 1, c.case_id)
        )
        pending = [
            (cid, t, run)
            for run in range(1, args.runs + 1)
            for cid, t in model_cases
            if not checkpoint.done(args.provider, model, t, run, cid)
        ]
        est_in = sum(
            estimate_input_tokens(
                GenerationRequest(
                    _case(cases, cid).question,
                    _case(cases, cid).language,
                    tuple(Evidence(c.chunk_id, c.heading, c.text) for c in plan[(cid, t)]),
                    session,
                )
            )
            for cid, t, _ in pending
        )
        est_out = (len(pending) + pending_smoke) * settings.llm_max_output_tokens
        estimate = cost(est_in, est_out, args.price_input_per_mtok, args.price_output_per_mtok)
        print(
            f"- {model}: {pending_smoke} smoke + {len(pending)} pending requests "
            f"({len(checkpoint.rows)} already checkpointed); input <= {est_in:,} tokens, "
            f"output <= {est_out:,} tokens; cost "
            + (f"${estimate:.2f}" if estimate is not None else "n/a (pass --price-* per 1M)")
        )
    budget = request_budget(len(cases), len(smoke_cases), tracks, args.runs, settings.llm_max_output_tokens)
    print(
        f"Full run per model (no checkpoint): <= {budget['requests']} requests "
        f"({len(smoke_cases)} smoke + {len(model_cases) * args.runs} planned track calls)"
    )
    print(
        f"Conservative input tokens per full run: <= "
        f"{smoke_in + per_run_in * args.runs:,} (including smoke)"
    )
    if not args.confirm_live:
        print("Dry run: nothing was sent. Add --confirm-live (and the provider key) to run.")
        return 0

    out_dir = ROOT / "data" / "eval" / "generation"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    canaries = [str(record.seed), str(record.session_id), record.owner_id]
    report: dict[str, object] = {
        "date": date.today().isoformat(),
        "provider": args.provider,
        "prompt": PROMPT_VERSION,
        "models": {},
    }

    for model in models:
        path = checkpoint_path(ROOT, args.provider, model)
        if args.fresh and path.is_file():
            path.rename(path.with_suffix(f".{stamp}.bak"))
        checkpoint = Checkpoint(path)
        provider = build_direct_provider(args.provider, model, key, settings)
        steps = [(c, "smoke", 1, None) for c in smoke_cases] + [
            (case, track, run, plan[(case.case_id, track)])
            for track in tracks
            for run in range(1, args.runs + 1)
            for case in cases
        ]
        aborted = next(
            (f"{r.track}/run{r.run}/{r.case_id}" for r in checkpoint.rows if is_critical(r)), None
        )
        for case, track, run, planned in steps:
            if aborted:
                break
            if checkpoint.done(args.provider, model, track, run, case.case_id):
                continue
            ev = planned if planned is not None else evidence_for(case, smoke_track)
            row = run_case(
                provider,
                model=model,
                track=track,
                run=run,
                case=case,
                evidence=ev,
                unsupplied=[c for c in chunks if c not in ev],
                session=session,
                canaries=canaries,
            )
            if row.error == "rate_limited":
                print(
                    f"PAUSED: {args.provider} rate limit at {track}/run{run}/{case.case_id}. "
                    f"{len(checkpoint.rows)} cases checkpointed; rerun the same command to resume."
                )
                return 3
            if track == "smoke" and row.error == "unavailable":
                print(f"ABORT: {model} unavailable during the smoke set (nothing recorded).")
                return 1
            checkpoint.record(row)
            if is_critical(row):
                aborted = f"{track}/run{run}/{case.case_id}: {row.error or row.category}"
                if track == "smoke":
                    print(f"ABORT: smoke case failed on {model}: {aborted}")
                    return 1
        rows = [r for r in checkpoint.rows if r.track != "smoke"]
        report["models"][model] = _model_report(  # type: ignore[index]
            rows, by_id, labels, settings.llm_max_output_tokens, args, aborted
        )
        _write(out_dir, f"{stamp}-{args.provider}", checkpoint.rows, report)
        print(f"\n== {args.provider}:{model} ==" + (f" ABORTED at {aborted}" if aborted else ""))
        print(json.dumps(report["models"][model], indent=1))  # type: ignore[index]
    print(f"\nPrivate rows and aggregate summary written under data/eval/generation/ ({stamp}).")
    return 0


def build_direct_provider(provider: str, model: str, key: str, settings: Settings) -> object:
    """A single provider, never the failover router (evaluation must not be contaminated)."""
    if provider == "groq":
        return GroqGenerationProvider(
            model=model,
            api_key=key,
            max_output_tokens=settings.llm_max_output_tokens,
            timeout_seconds=settings.llm_primary_timeout_seconds,
        )
    return OpenAIGenerationProvider(
        model=model,
        api_key=key,
        reasoning_effort=settings.llm_reasoning_effort,
        max_output_tokens=settings.llm_max_output_tokens,
        timeout_seconds=settings.llm_timeout_seconds,
    )


def _case(cases: list[Case], case_id: str) -> Case:
    return next(c for c in cases if c.case_id == case_id)


def _screened(cases: list[Case], case_id: str) -> bool:
    from app.rag.generation import looks_like_injection

    return looks_like_injection(_case(cases, case_id).question)


def _model_report(rows, by_id, labels, max_words, args, aborted):  # type: ignore[no-untyped-def]
    out: dict[str, object] = {"aborted": aborted}
    for track in sorted({r.track for r in rows}):
        track_rows = [r for r in rows if r.track == track]
        out[track] = {
            "all": summarize(track_rows, by_id, labels),
            "en": summarize([r for r in track_rows if r.language == "en"], by_id, labels),
            "si": summarize([r for r in track_rows if r.language == "si"], by_id, labels),
            "gates": gates(track_rows, 180),
            "instability": instability(track_rows),
        }
    tokens_in = sum(r.input_tokens or 0 for r in rows)
    tokens_out = sum(r.output_tokens or 0 for r in rows)
    out["actualCost"] = cost(
        tokens_in, tokens_out, args.price_input_per_mtok, args.price_output_per_mtok
    )
    out["modelsReturned"] = sorted({r.model_returned for r in rows if r.model_returned})
    return out


def _write(out_dir: Path, stamp: str, rows: list, report: dict[str, object]) -> None:  # type: ignore[type-arg]
    from dataclasses import asdict

    with (out_dir / f"{stamp}-rows.jsonl").open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(asdict(row), ensure_ascii=False) + "\n")
    summary = {**report, "publicRows": [public_row(r) for r in rows]}
    (out_dir / f"{stamp}-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8"
    )


if __name__ == "__main__":
    raise SystemExit(main())
