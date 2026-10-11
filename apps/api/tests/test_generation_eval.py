"""Offline tests of the two-track generation evaluation (fake provider; no network, no model)."""

import json
import os
import subprocess
import sys
from typing import Any

from app.rag.embeddings import FakeEmbeddingProvider
from app.rag.evaluation import Label
from app.rag.generation import FakeGenerationProvider, GenerationRequest
from app.rag.generation_eval import (
    Case,
    gates,
    instability,
    load_cases,
    oracle_evidence,
    public_row,
    request_budget,
    run_case,
    select_cases,
    summarize,
)
from app.settings import REPO_ROOT
from tests.test_assistant import make_chunks

GOLD = REPO_ROOT / "content" / "knowledge" / "gold"
SESSION = {"experimentId": "exp04_standard_solution", "mode": "manual", "submitted": False}
CHUNKS = make_chunks(FakeEmbeddingProvider())
BY_ID = {c.chunk_id: c for c in CHUNKS}
PROCEDURE = Label("synthetic-handbook", 20, "Procedure:")
SUPPORTED = Case(
    "mass-en", "en", "supported", "How much Na₂CO₃ is weighed on the watch glass?", (PROCEDURE,)
)
KMNO4 = Case(
    "kmno4-en", "en", "unsupported", "How do I standardise KMnO4 with oxalic acid?", (), ("KMnO",)
)


def run(case: Case, provider: Any = None, evidence: Any = None, run_no: int = 1) -> Any:
    ev = oracle_evidence(case, CHUNKS) if evidence is None else evidence
    return run_case(
        provider or FakeGenerationProvider(),
        model="fake",
        track="oracle",
        run=run_no,
        case=case,
        evidence=ev,
        unsupplied=[c for c in CHUNKS if c not in ev],
        session=SESSION,
        canaries=["918273645"],
    )


def test_cases_extend_the_gold_set_without_changing_labels() -> None:
    cases = load_cases(GOLD / "retrieval-gold.v1.json", GOLD / "generation-adversarial.v1.json")
    supported = [c for c in cases if c.kind == "supported"]
    assert len(supported) == 32 and all(c.labels for c in supported)
    must_refuse = [c for c in cases if c.must_refuse]
    assert len(must_refuse) >= 18 and all(not c.labels for c in must_refuse)
    assert any(c.case_id == "kmno4-en" for c in cases)
    assert {c.language for c in must_refuse} == {"en", "si"}


def test_m2_groq_subset_is_fixed_bilingual_and_preserves_full_dataset() -> None:
    cases = load_cases(GOLD / "retrieval-gold.v1.json", GOLD / "generation-adversarial.v1.json")
    subset = select_cases(cases, "m2-groq")
    assert [case.case_id for case in subset] == [
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
    ]
    assert len(cases) > len(subset)
    assert {case.language for case in subset} == {"en", "si"}
    assert sum(case.kind == "supported" for case in subset) == 6
    assert sum(case.must_refuse for case in subset) == 4
    assert all(case.language == "en" or case.case_id.endswith("-si") for case in subset)


def test_subset_selection_is_reproducible_and_caps_without_mutating_source() -> None:
    cases = load_cases(GOLD / "retrieval-gold.v1.json", GOLD / "generation-adversarial.v1.json")
    before = [case.case_id for case in cases]
    assert [c.case_id for c in select_cases(cases, "m2-groq", 4)] == before[:0] + [
        "mass-en",
        "mass-si",
        "funnel-en",
        "funnel-si",
    ]
    assert [case.case_id for case in cases] == before


def test_m2_request_and_output_budget_is_conservative_and_reproducible() -> None:
    cases = load_cases(GOLD / "retrieval-gold.v1.json", GOLD / "generation-adversarial.v1.json")
    subset = select_cases(cases, "m2-groq")
    budget = request_budget(len(subset), 4, ("oracle", "e2e"), 2, 512)
    assert budget == {"requests": 44, "output_tokens": 22528}
    assert request_budget(len(subset), 4, ("oracle", "e2e"), 2, 512) == budget


def test_oracle_evidence_is_the_labelled_chunks() -> None:
    evidence = oracle_evidence(SUPPORTED, CHUNKS)
    assert evidence and all(PROCEDURE.matches(c) for c in evidence)


def test_supported_and_kmno4_rows_and_gates() -> None:
    good = run(SUPPORTED)
    assert good.status == "grounded" and good.correct is True and good.cited
    bad = run(KMNO4, evidence=CHUNKS[:4])
    assert bad.status == "refused" and bad.category in (
        "model_refused",
        "unsupported_entity_in_question",
    )
    rows = [good, bad]
    summary = summarize(rows, BY_ID, {SUPPORTED.case_id: SUPPORTED.labels})
    assert summary["supported"] == {"n": 1, "correct": 1, "falseRefusals": 0, "errors": 0}
    assert summary["refusal"]["recall"] == 1.0 and summary["refusal"]["precision"] == 1.0
    assert summary["citations"]["precision"] == 1.0 and summary["citations"]["pageAccuracy"] == 1.0
    assert all(gates(rows, 180).values())


def test_invalid_citation_is_retained_as_private_diagnostic_category() -> None:
    def invalid_citation(request: GenerationRequest) -> dict[str, Any]:
        chunk = request.evidence[0]
        line = chunk.text.split("\n")[1]
        return {
            "decision": "answer",
            "answer": line,
            "claims": [
                {
                    "text": line,
                    "citedChunkIds": ["kc_not_supplied"],
                    "supportingSpans": [{"chunkId": chunk.chunk_id, "text": line}],
                }
            ],
        }

    row = run(SUPPORTED, FakeGenerationProvider(invalid_citation))
    assert row.status == "refused"
    assert row.category == "invalid_citation"
    assert row.answer


def test_fabrication_schema_and_instability_are_detected() -> None:
    def invent(request: GenerationRequest) -> dict[str, Any]:
        chunk = request.evidence[0]
        line = chunk.text.split("\n")[1]
        return {
            "decision": "answer",
            "answer": "Weigh 30.0 g.",
            "claims": [
                {
                    "text": line,
                    "citedChunkIds": [chunk.chunk_id],
                    "supportingSpans": [{"chunkId": chunk.chunk_id, "text": line}],
                }
            ],
        }

    fabricated = run(SUPPORTED, FakeGenerationProvider(invent), run_no=2)
    assert fabricated.category == "unsupported_number" and fabricated.correct is False
    malformed = run(SUPPORTED, FakeGenerationProvider(lambda r: {"oops": True}))
    assert malformed.status == "error" and malformed.error == "schema_invalid"
    rows = [run(SUPPORTED), fabricated, malformed]
    result = gates(rows, 180)
    assert result["noFabrication"] is False and result["schemaValidity100"] is False
    assert instability([run(SUPPORTED), fabricated])["unstable"] == 1


def test_public_rows_never_contain_answer_text() -> None:
    row = run(SUPPORTED)
    assert row.answer and "answer" not in public_row(row)
    assert row.answer not in json.dumps(public_row(row), ensure_ascii=False)


def test_live_command_refuses_without_a_key_and_sends_nothing() -> None:
    env = {k: v for k, v in os.environ.items() if k not in ("OPENAI_API_KEY", "LAB_OPENAI_API_KEY")}
    env["PYTHONIOENCODING"] = "utf-8"
    script = REPO_ROOT / "scripts" / "ingest" / "evaluate_generation.py"
    result = subprocess.run(  # noqa: S603 - fixed argv, local script
        [sys.executable, str(script), "--confirm-live"],
        capture_output=True,
        text=True,
        env=env,
        cwd=REPO_ROOT,
        timeout=120,
        check=False,
    )
    assert result.returncode == 2, result.stderr[-500:]
    assert "not set" in result.stdout and "nothing was sent" in result.stdout


def _script(name: str, *args: str) -> "subprocess.CompletedProcess[str]":
    env = {k: v for k, v in os.environ.items() if "API_KEY" not in k}
    env["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run(  # noqa: S603 - fixed argv, local script
        [sys.executable, str(REPO_ROOT / "scripts" / "ingest" / name), *args],
        capture_output=True,
        text=True,
        env=env,
        cwd=REPO_ROOT,
        timeout=120,
        check=False,
    )


def test_groq_evaluation_requires_the_groq_key_and_sends_nothing() -> None:
    result = _script("evaluate_generation.py", "--provider", "groq", "--confirm-live")
    assert result.returncode == 2 and "GROQ_API_KEY" in result.stdout
    assert "nothing was sent" in result.stdout


def test_connectivity_check_is_opt_in_and_needs_both_keys() -> None:
    dry = _script("check_providers.py")
    assert dry.returncode == 0 and "Dry run: nothing was sent" in dry.stdout
    assert "1 request to groq:" in dry.stdout and "1 request to openai:" in dry.stdout
    live = _script("check_providers.py", "--confirm-live")
    assert (
        live.returncode == 2 and "GROQ_API_KEY" in live.stdout and "OPENAI_API_KEY" in live.stdout
    )


def test_checkpoint_resumes_without_repeating_and_never_records_429(tmp_path: Any) -> None:
    from app.rag.generation import GenerationRateLimited
    from app.rag.generation_eval import Checkpoint, checkpoint_path

    path = checkpoint_path(tmp_path, "groq", "qwen/qwen3.8-27b")
    assert path.name == "checkpoint-groq-qwen_qwen3.8-27b.jsonl"
    checkpoint = Checkpoint(path)
    row = run(SUPPORTED)
    row.provider = "groq"
    checkpoint.record(row)
    resumed = Checkpoint(path)
    assert resumed.done("groq", "fake", "oracle", 1, SUPPORTED.case_id)
    assert not resumed.done("openai", "fake", "oracle", 1, SUPPORTED.case_id)  # per provider
    assert not resumed.done("groq", "fake", "oracle", 2, SUPPORTED.case_id)  # per run
    assert not resumed.done("groq", "fake", "e2e", 1, SUPPORTED.case_id)  # per track

    def limited(request: GenerationRequest) -> Any:
        raise GenerationRateLimited("429")

    paused = run(SUPPORTED, FakeGenerationProvider(limited))
    assert paused.error == "rate_limited"
    import pytest

    with pytest.raises(ValueError):
        resumed.record(paused)
    assert len(Checkpoint(path).rows) == 1
