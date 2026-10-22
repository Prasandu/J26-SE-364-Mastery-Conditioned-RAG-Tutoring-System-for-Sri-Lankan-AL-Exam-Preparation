"""Live connectivity check: exactly one Groq request and one OpenAI request (opt-in).

Usage (repository root):
  uv run --project apps/api python scripts/ingest/check_providers.py --confirm-live

Each provider is called directly (no failover), once, with a tiny synthetic passage (no PDF text,
no student data), and the result goes through the shared validation. No retries, no loops, and
nothing that could deliberately trigger a rate limit. Prints only status, latency, token counts,
the provider-returned model ID and the validation category; never keys, prompts or answers.
"""

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.rag.generation import (  # noqa: E402
    Evidence,
    GenerationFailure,
    GenerationRequest,
    generate_validated,
)
from app.rag.groq_provider import GroqGenerationProvider  # noqa: E402
from app.rag.openai_provider import OpenAIGenerationProvider  # noqa: E402
from app.settings import Settings  # noqa: E402

SYNTHETIC = Evidence(
    "kc_" + "0" * 20,
    "Synthetic connectivity check",
    "Synthetic connectivity check\nThe connectivity check passage states that the test value "
    "is 42 units.",
)
REQUEST = GenerationRequest(
    question="According to the passage, what is the test value?",
    locale="en",
    evidence=(SYNTHETIC,),
    session={"experimentId": "connectivity_check", "mode": "manual", "submitted": False},
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-live", action="store_true")
    args = parser.parse_args()
    # Test subprocesses must never inherit usable credentials from the repository .env.
    # Match evaluate_generation.py's offline guard before constructing Settings/providers.
    if args.confirm_live and os.getenv("LAB_EVAL_OFFLINE") == "1":
        print("Offline connectivity guard enabled: nothing was sent.")
        return 2
    settings = Settings()
    groq_key = settings.groq_api_key.get_secret_value() if settings.groq_api_key else ""
    openai_key = settings.openai_api_key.get_secret_value() if settings.openai_api_key else ""
    groq_model = settings.groq_model or "qwen/qwen3.8-27b"
    openai_model = settings.llm_model or "gpt-6.1-sol"
    print(f"Plan: 1 request to groq:{groq_model}, 1 request to openai:{openai_model}")
    if not args.confirm_live:
        print("Dry run: nothing was sent. Add --confirm-live to send the two requests.")
        return 0
    missing = [n for n, k in (("GROQ_API_KEY", groq_key), ("OPENAI_API_KEY", openai_key)) if not k]
    if missing:
        print(f"Missing {', '.join(missing)}: nothing was sent.")
        return 2
    providers = [
        GroqGenerationProvider(model=groq_model, api_key=groq_key, timeout_seconds=12),
        OpenAIGenerationProvider(
            model=openai_model,
            api_key=openai_key,
            reasoning_effort=settings.llm_reasoning_effort,
            max_output_tokens=settings.llm_max_output_tokens,
            timeout_seconds=18,
        ),
    ]
    ok = True
    for provider in providers:
        try:
            outcome = generate_validated(provider, REQUEST)
        except GenerationFailure as failure:
            ok = False
            print(f"{provider.name}: FAILED ({failure.kind})")
            continue
        meta = outcome.meta
        status = "grounded" if outcome.verdict.grounded else f"refused ({outcome.verdict.category})"
        print(
            f"{provider.name}: OK {status}; model_returned={meta.model_returned}; "
            f"latency_ms={meta.latency_ms}; tokens in/out={meta.input_tokens}/{meta.output_tokens}"
        )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
