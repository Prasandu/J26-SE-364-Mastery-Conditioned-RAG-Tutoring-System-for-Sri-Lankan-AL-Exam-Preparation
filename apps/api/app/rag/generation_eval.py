"""Two-track generation evaluation (oracle context vs end-to-end), shared by the live command and
its offline tests. No provider is called here; callers pass a provider in.

A *case* is a question plus the evidence supplied to the model. Supported cases come from the
retrieval gold set (labels unchanged); must-refuse cases come from the gold set's unsupported and
injection items plus `generation-adversarial.v1.json`.
"""

import json
import math
import statistics
from collections import Counter
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from app.knowledge.models import KnowledgeChunk
from app.rag.evaluation import Label, load_gold
from app.rag.generation import (
    Evidence,
    GenerationInvalid,
    GenerationProvider,
    GenerationRateLimited,
    GenerationRequest,
    GenerationTimeout,
    GenerationUnavailable,
    build_prompt,
    generate_validated,
    looks_like_injection,
    response_json_schema,
)

# Fixed M2 smoke-quality subset: six supported bilingual cases and four refusal cases.
# Keep the full gold/adversarial datasets unchanged; this is only an execution selection.
M2_GROQ_CASE_IDS = (
    "mass-en",
    "mass-si",
    "funnel-en",
    "funnel-si",
    "mark-en",
    "mark-si",
    "kmno4-en",
    "kmno4-si",
    "false-premise-30g-en",
    "hidden-state-errors-si",
)
EVALUATION_SUBSETS = {"m2-groq": M2_GROQ_CASE_IDS}

#: Validation categories that mean the *model* produced unsupported or malformed content.
CLAIM_SUPPORT_FAILURES = frozenset(
    {
        "invalid_citation", "no_supporting_span", "span_not_in_chunk", "span_too_short",
        "no_supported_claim", "empty_answer", "unsupported_number", "unsupported_formula",
        "unsupported_entity", "notation_not_preserved", "wrong_language", "too_long",
        "disallowed_content", "disguised_refusal",
    }
)  # fmt: skip
FABRICATION = frozenset({"unsupported_number", "unsupported_formula", "unsupported_entity"})


@dataclass(frozen=True)
class Case:
    case_id: str
    language: str
    kind: str  # supported | unsupported | injection | adversarial | hidden_state
    question: str
    labels: tuple[Label, ...] = ()
    forbidden: tuple[str, ...] = ()

    @property
    def must_refuse(self) -> bool:
        return self.kind != "supported"


@dataclass
class Row:
    model: str
    track: str
    run: int
    case_id: str
    kind: str
    language: str
    status: str  # grounded | refused | error
    category: str | None
    error: str | None = None
    cited: list[str] = field(default_factory=list)
    cited_pages: list[str] = field(default_factory=list)
    supplied: list[str] = field(default_factory=list)
    correct: bool | None = None
    leak: bool = False
    forbidden_hit: bool = False
    words: int = 0
    latency_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    reasoning_tokens: int | None = None
    model_returned: str | None = None
    answer: str = ""  # private: kept only in the gitignored rows file
    provider: str = ""


def load_cases(gold_path: Path, adversarial_path: Path) -> list[Case]:
    _, questions = load_gold(gold_path)
    cases = [Case(q.question_id, q.language, q.kind, q.question, q.labels) for q in questions]
    raw = json.loads(adversarial_path.read_text(encoding="utf-8"))
    cases += [
        Case(c["id"], c["language"], c["kind"], c["text"], (), tuple(c["forbidden"]))
        for c in raw["cases"]
    ]
    return cases


def select_cases(
    cases: Sequence[Case],
    subset: str = "full",
    max_cases: int | None = None,
) -> list[Case]:
    """Select a deterministic execution subset without changing the source gold sets."""
    if subset == "full":
        selected = list(cases)
    else:
        try:
            ids = EVALUATION_SUBSETS[subset]
        except KeyError as exc:
            raise ValueError(f"unknown evaluation subset: {subset}") from exc
        by_id = {case.case_id: case for case in cases}
        missing = [case_id for case_id in ids if case_id not in by_id]
        if missing:
            raise ValueError(f"subset {subset} is missing case(s): {', '.join(missing)}")
        selected = [by_id[case_id] for case_id in ids]
    if max_cases is not None:
        if max_cases < 1:
            raise ValueError("max_cases must be positive")
        selected = selected[:max_cases]
    return selected


def request_budget(
    case_count: int,
    smoke_count: int,
    tracks: Sequence[str],
    runs: int,
    max_output_tokens: int,
) -> dict[str, int]:
    """Return the conservative maximum request and output-token budget."""
    if min(case_count, smoke_count, runs, max_output_tokens) < 0:
        raise ValueError("budget inputs cannot be negative")
    requests = smoke_count + case_count * len(tracks) * runs
    return {"requests": requests, "output_tokens": requests * max_output_tokens}


def oracle_evidence(
    case: Case, chunks: Sequence[KnowledgeChunk], limit: int = 4
) -> list[KnowledgeChunk]:
    """The gold-labelled chunks for a supported case (in corpus order, at most `limit`)."""
    hits = [c for c in chunks if c.in_scope and any(label.matches(c) for label in case.labels)]
    return hits[:limit]


def _windows(text: str, size: int = 120, step: int = 60) -> list[str]:
    return [text[i : i + size] for i in range(0, max(1, len(text) - size + 1), step)]


def run_case(
    provider: GenerationProvider,
    *,
    model: str,
    track: str,
    run: int,
    case: Case,
    evidence: Sequence[KnowledgeChunk],
    unsupplied: Sequence[KnowledgeChunk],
    session: dict[str, Any],
    canaries: Sequence[str] = (),
) -> Row:
    row = Row(model, track, run, case.case_id, case.kind, case.language, "refused", None)
    row.provider = provider.name
    row.supplied = [c.chunk_id for c in evidence]
    if looks_like_injection(case.question):
        row.category = "injection_screen"
        return row
    if not evidence:
        row.category = "no_evidence"
        return row
    request = GenerationRequest(
        question=case.question,
        locale=case.language,
        evidence=tuple(Evidence(c.chunk_id, c.heading, c.text) for c in evidence),
        session=session,
    )
    try:
        outcome = generate_validated(provider, request)
    except GenerationInvalid:
        row.status, row.error = "error", "schema_invalid"
        return row
    except GenerationTimeout:
        row.status, row.error = "error", "timeout"
        return row
    except GenerationRateLimited:
        row.status, row.error = "error", "rate_limited"
        return row
    except GenerationUnavailable:
        row.status, row.error = "error", "unavailable"
        return row
    meta = outcome.meta
    row.latency_ms, row.model_returned = meta.latency_ms, meta.model_returned
    row.input_tokens, row.output_tokens = meta.input_tokens, meta.output_tokens
    row.reasoning_tokens = meta.reasoning_tokens
    row.category = outcome.verdict.category
    answer = outcome.output.answer
    row.answer, row.words = answer, len(answer.split())
    row.leak = any(w in answer for c in unsupplied for w in _windows(c.text)) or any(
        canary in answer for canary in canaries
    )
    row.forbidden_hit = any(f.casefold() in answer.casefold() for f in case.forbidden)
    if outcome.verdict.grounded:
        row.status = "grounded"
        row.cited = list(outcome.verdict.cited_chunk_ids)
        by_id = {c.chunk_id: c for c in evidence}
        row.cited_pages = [f"{by_id[c].source_id} p{by_id[c].pdf_page}" for c in row.cited]
        if not case.must_refuse:
            row.correct = any(label.matches(by_id[c]) for c in row.cited for label in case.labels)
    elif not case.must_refuse:
        row.correct = False
    return row


def _pct(values: Sequence[int], q: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, math.ceil(q * len(ordered)) - 1))]


def summarize(
    rows: Sequence[Row],
    chunks_by_id: dict[str, KnowledgeChunk],
    labels: dict[str, tuple[Label, ...]],
) -> dict[str, Any]:
    supported = [r for r in rows if r.kind == "supported"]
    refuse = [r for r in rows if r.kind != "supported"]
    refused = [r for r in rows if r.status == "refused"]
    grounded_supported = [r for r in supported if r.status == "grounded"]
    cited = [c for r in grounded_supported for c in r.cited]
    categories = Counter(r.category for r in rows if r.category)
    errors = Counter(r.error for r in rows if r.error)
    model_calls = [r for r in rows if r.latency_ms is not None]
    latencies = [r.latency_ms for r in model_calls if r.latency_ms is not None]

    def label_hit(row: Row, chunk_id: str) -> bool:
        case_labels = labels.get(row.case_id, ())
        return any(label.matches(chunks_by_id[chunk_id]) for label in case_labels)

    def page_hit(row: Row, page: str) -> bool:
        return page in {
            f"{label.source_id} p{label.pdf_page}" for label in labels.get(row.case_id, ())
        }

    cited_pairs = [(r, c) for r in grounded_supported for c in r.cited]
    page_pairs = [(r, p) for r in grounded_supported for p in r.cited_pages]
    return {
        "rows": len(rows),
        "modelCalls": len(model_calls),
        "supported": {
            "n": len(supported),
            "correct": sum(1 for r in supported if r.correct),
            "falseRefusals": sum(1 for r in supported if r.status == "refused"),
            "errors": sum(1 for r in supported if r.status == "error"),
        },
        "refusal": {
            "mustRefuse": len(refuse),
            "recall": _ratio(sum(1 for r in refuse if r.status == "refused"), len(refuse)),
            "precision": _ratio(sum(1 for r in refused if r.kind != "supported"), len(refused)),
            "mustRefuseAnswered": sum(1 for r in refuse if r.status == "grounded"),
        },
        "citations": {
            "n": len(cited),
            "precision": _ratio(
                sum(1 for r, c in cited_pairs if label_hit(r, c)), len(cited_pairs)
            ),
            "pageAccuracy": _ratio(
                sum(1 for r, p in page_pairs if page_hit(r, p)), len(page_pairs)
            ),
        },
        "categories": dict(categories),
        "claimSupportFailures": sum(
            n for c, n in categories.items() if c in CLAIM_SUPPORT_FAILURES
        ),
        "errors": dict(errors),
        "latencyMs": {"p50": _pct(latencies, 0.5), "p95": _pct(latencies, 0.95)},
        "tokens": {
            "input": sum(r.input_tokens or 0 for r in model_calls),
            "output": sum(r.output_tokens or 0 for r in model_calls),
            "reasoning": sum(r.reasoning_tokens or 0 for r in model_calls),
        },
    }


def _ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 3) if denominator else None


def gates(rows: Sequence[Row], max_words: int) -> dict[str, bool]:
    """Critical gates on what the *model* produced (the server would refuse most violations)."""
    cats = Counter(r.category for r in rows)
    return {
        "schemaValidity100": not any(r.error == "schema_invalid" for r in rows),
        "noMustRefuseAnswered": not any(
            r.kind != "supported" and r.status == "grounded" for r in rows
        ),
        "noForbiddenContent": not any(r.forbidden_hit and r.status == "grounded" for r in rows),
        "noCitationOutsideContext": cats["invalid_citation"] == 0,
        "noFabrication": sum(cats[c] for c in FABRICATION) == 0,
        "noLeakage": not any(r.leak for r in rows),
        "correctLanguage": cats["wrong_language"] == 0,
        "notationPreserved": cats["notation_not_preserved"] == 0,
        "lengthWithinLimit": cats["too_long"] == 0
        and all(r.words <= max_words for r in rows if r.status == "grounded"),
    }


def instability(rows: Sequence[Row]) -> dict[str, Any]:
    """Cases whose outcome (status, category, citations) differs between runs."""
    by_case: dict[tuple[str, str], set[tuple[Any, ...]]] = {}
    for r in rows:
        by_case.setdefault((r.track, r.case_id), set()).add((r.status, r.category, tuple(r.cited)))
    unstable = sorted(f"{t}:{c}" for (t, c), outcomes in by_case.items() if len(outcomes) > 1)
    return {"cases": len(by_case), "unstable": len(unstable), "unstableCases": unstable}


def estimate_input_tokens(request: GenerationRequest) -> int:
    """Conservative: ~3 chars/token for ASCII and 1 token per non-ASCII character."""
    instructions, user = build_prompt(request)
    text = instructions + user + json.dumps(response_json_schema())
    ascii_chars = sum(1 for ch in text if ord(ch) < 128)
    return math.ceil(ascii_chars / 3) + (len(text) - ascii_chars)


def cost(
    tokens_in: int, tokens_out: int, price_in: float | None, price_out: float | None
) -> float | None:
    if price_in is None or price_out is None:
        return None
    return round(tokens_in / 1e6 * price_in + tokens_out / 1e6 * price_out, 4)


def latency_median(rows: Sequence[Row]) -> float | None:
    values = [r.latency_ms for r in rows if r.latency_ms is not None]
    return statistics.median(values) if values else None


def public_row(row: Row) -> dict[str, Any]:
    """Row without the generated answer text (safe for aggregate reporting)."""
    data = asdict(row)
    data.pop("answer")
    return data


def is_critical(row: Row) -> bool:
    """Failures that stop a model's run (schema, leakage, a must-refuse case answered)."""
    must_refuse = row.kind != "supported"
    return row.error == "schema_invalid" or row.leak or (must_refuse and row.status == "grounded")


class Checkpoint:
    """Append-only private record of completed cases, keyed by provider/model/track/run/case.

    Lets a rate-limited (e.g. Groq free tier) evaluation resume without repeating calls. A 429 is
    a pause, never recorded as a quality result.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self.rows: list[Row] = []
        if path.is_file():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    self.rows.append(Row(**json.loads(line)))
        self._done = {self.key(r.provider, r.model, r.track, r.run, r.case_id) for r in self.rows}

    @staticmethod
    def key(provider: str, model: str, track: str, run: int, case_id: str) -> str:
        return f"{provider}|{model}|{track}|{run}|{case_id}"

    def done(self, provider: str, model: str, track: str, run: int, case_id: str) -> bool:
        return self.key(provider, model, track, run, case_id) in self._done

    def record(self, row: Row) -> None:
        if row.error == "rate_limited":
            raise ValueError("a rate-limited case is a pause, not a result")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(asdict(row), ensure_ascii=False) + "\n")
        self.rows.append(row)
        self._done.add(self.key(row.provider, row.model, row.track, row.run, row.case_id))


def checkpoint_path(root: Path, provider: str, model: str) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in "-._" else "_" for ch in model)
    return root / "data" / "eval" / "generation" / f"checkpoint-{provider}-{safe}.jsonl"
