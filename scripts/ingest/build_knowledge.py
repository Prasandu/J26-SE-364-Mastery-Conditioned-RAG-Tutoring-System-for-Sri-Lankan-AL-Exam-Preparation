"""Build the private knowledge base from the approved NIE pages only.

Usage (from the repository root):
  uv run --project apps/api --group rag python scripts/ingest/build_knowledge.py
      [--provider e5_local|fake]

Writes data/knowledge/<knowledgeVersion>/chunks.jsonl (private, gitignored) and the committed,
metadata-only content/knowledge/manifest.v1.json. Fails closed on any checksum mismatch.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.knowledge.build import build_knowledge  # noqa: E402
from app.rag.embeddings import build_embedding_provider  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", default="e5_local", choices=["e5_local", "fake"])
    parser.add_argument("--model", default="intfloat/multilingual-e5-small")
    parser.add_argument("--revision", default=None)
    args = parser.parse_args()
    provider = build_embedding_provider(args.provider, args.model, args.revision)
    assert provider is not None
    if args.provider == "e5_local":
        out, manifest_path = (
            ROOT / "data" / "knowledge",
            ROOT / "content" / "knowledge" / "manifest.v1.json",
        )
    else:
        # A fake build must never overwrite the committed manifest of the real E5 knowledge base.
        out = ROOT / "data" / "knowledge-fake"
        manifest_path = out / "manifest.v1.json"
    manifest = build_knowledge(ROOT, ROOT / "research-sources", out, manifest_path, provider)
    keys = (
        "knowledgeVersion",
        "embeddingModel",
        "modelRevision",
        "dimension",
        "chunkCount",
        "inScopeChunkCount",
        "chunksByPage",
    )
    summary = {k: manifest[k] for k in keys}
    sys.stdout.write(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
