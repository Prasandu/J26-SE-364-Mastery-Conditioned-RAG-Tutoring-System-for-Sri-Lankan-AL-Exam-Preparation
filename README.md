# Intelligent Virtual Chemistry Laboratory (M1)

Research prototype for the Mastery-Conditioned RAG Tutoring System for Sri Lankan G.C.E. A/L Chemistry.
M1 is one bilingual (English/Sinhala) vertical slice for NIE Practical Handbook Experiment 4,
"Preparation of standard solutions". Project rules: [CLAUDE.md](CLAUDE.md). Progress: [docs/STATUS.md](docs/STATUS.md).

> AI assistance in this prototype is not laboratory safety certification or a substitute for supervised practical work.

> **Do not deploy the API publicly.** M1 has no real authentication (development principal only) and
> its default repository is in memory: all sessions disappear when the API process stops.

## Prerequisites

| Tool    | Version | Install                                                                                         |
| ------- | ------- | ----------------------------------------------------------------------------------------------- |
| Node.js | ≥ 22.12 | https://nodejs.org                                                                              |
| pnpm    | 10.x    | `corepack enable pnpm` (or `npm i -g pnpm@10` if Corepack fails; see DECISIONS D4)              |
| uv      | ≥ 0.13  | `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"` (Windows) |
| Python  | 3.12    | managed by uv (`apps/api/.python-version`); no system install needed                            |
| Docker  | any     | optional, only for `pnpm db:smoke`                                                              |

## Quick start (offline, default)

```sh
pnpm install                         # JS workspace
cd apps/api && uv sync && cd ../..   # Python env (creates apps/api/.venv)
cp .env.example .env                 # optional: defaults run fully offline
pnpm dev:web                         # http://localhost:5173 (engine runs in the browser)
```

## API-backed mode

```sh
pnpm --filter @vlab/simulation-core build   # bundles the verifier CLI to packages/simulation-core/dist/verifier.mjs
pnpm dev:api                                # http://localhost:8000/health
# in .env: VITE_ENGINE_ADAPTER=api and VITE_API_BASE_URL=http://localhost:8000
pnpm dev:web
```

In API mode every action is replayed and verified on the server by the same TypeScript engine; the
browser only displays the server's public projection. The adapter never falls back to offline mode
silently.

## Grounded assistant (optional, local)

The assistant answers only from the approved NIE pages and cites them. Generation is `disabled` by
default. `fake` is an extractive stand-in for tests and local development. `openai` (Responses API;
initial candidate model `gpt-6.1-sol`) must be selected explicitly and needs `OPENAI_API_KEY` in
the server environment or the untracked `.env`; never commit or paste the key anywhere else.

`groq` (GroqCloud, `qwen/qwen3.8-27b`) can be selected alone, and `failover` uses Groq first to
minimise cost with OpenAI as a paid technical fallback (429, outage or timeout only; refusals and
validation failures never fail over). Failover needs both `GROQ_API_KEY` and `OPENAI_API_KEY`;
keep `LAB_OPENAI_FALLBACK_DAILY_REQUEST_LIMIT` low and set a budget with spending alerts on the
OpenAI Platform project. The Groq free tier is not a guaranteed production SLA.

The assistant is advisory: it never grades students or decides competency without teacher review.
Any real use by students under 18 needs parent/guardian consent and institutional/ethics approval.

```sh
# One-time: short-path environment for the local model (Windows long-path limit, see D24)
UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag uv sync --project apps/api --group rag
# Build the private knowledge base from the approved pages (PDFs in research-sources/)
UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag uv run --project apps/api --group rag \
  python scripts/ingest/build_knowledge.py
# Retrieval evaluation on the gold set (writes data/eval/, prints the tables in docs/RAG_EVALUATION.md)
UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag HF_HUB_OFFLINE=1 uv run --project apps/api --group rag \
  python scripts/ingest/evaluate_retrieval.py
# Serve with the local model and the fake generator (development only)
LAB_EMBEDDING_PROVIDER=e5_local LAB_LLM_PROVIDER=fake HF_HUB_OFFLINE=1 \
  UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag uv run --project apps/api --group rag \
  uvicorn app.main:app --app-dir apps/api --port 8000
# Serve with the OpenAI provider (key in the server environment; no fallback between models)
LAB_EMBEDDING_PROVIDER=e5_local LAB_LLM_PROVIDER=openai LAB_LLM_MODEL=gpt-6.1-sol HF_HUB_OFFLINE=1 \
  UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag uv run --project apps/api --group rag \
  uvicorn app.main:app --app-dir apps/api --port 8000
# Failover: Groq primary, OpenAI paid fallback (both keys in the server environment)
LAB_EMBEDDING_PROVIDER=e5_local LAB_LLM_PROVIDER=failover LAB_GROQ_MODEL=qwen/qwen3.8-27b \
  LAB_LLM_MODEL=gpt-6.1-sol HF_HUB_OFFLINE=1 UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag \
  uv run --project apps/api --group rag uvicorn app.main:app --app-dir apps/api --port 8000
# Connectivity check: exactly one Groq and one OpenAI request (opt-in)
uv run --project apps/api python scripts/ingest/check_providers.py --confirm-live
# M2 dry run: Groq-only controlled subset, no requests and no key required
UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag HF_HUB_OFFLINE=1 uv run --project apps/api --group rag \
  python scripts/ingest/evaluate_generation.py --provider groq --subset m2-groq --runs 2 --track both
# M2 live run (only after separate approval; direct Groq, no OpenAI fallback)
UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag HF_HUB_OFFLINE=1 uv run --project apps/api --group rag \
  python scripts/ingest/evaluate_generation.py --provider groq --subset m2-groq --runs 2 --track both \
  --confirm-live
# Full evaluation is opt-in and substantially larger; it does not change the M2 subset
UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag HF_HUB_OFFLINE=1 uv run --project apps/api --group rag \
  python scripts/ingest/evaluate_generation.py --provider groq --subset full --runs 2 --track both \
  --confirm-live
```

The M2 subset contains 10 cases and, with the default two runs and two tracks, permits at most
44 provider requests per model: 4 smoke requests plus 40 track requests. Injection-screened
cases do not make provider requests. The dry run prints the conservative input-token estimate
and output ceiling (`44 × LAB_LLM_MAX_OUTPUT_TOKENS`, currently 22,528 tokens at the default
512-token limit). It pauses on a rate limit (exit 3), aborts on a critical smoke/quality failure,
and resumes from the provider/model/track/run/case checkpoint without recording the rate-limited
request. Use `--fresh` only when intentionally starting a new private checkpoint.

The live command is Groq-only and bypasses the failover router; it never enables OpenAI fallback.
Generated answers remain in gitignored private rows only. Aggregate summaries retain metrics and
sanitized diagnostic categories, while excluding questions, answers, credentials, headers, and
raw provider responses. Sinhala cases remain `teacher_review_pending` until reviewed.

`data/` (chunk text, embeddings, evaluation output) is private derived research data: it is
gitignored and must never be committed, served or deployed.

## Development admin (local only, optional)

Imports practical PDFs into private drafts for review. It never publishes and never changes the
student library. Disabled by default; see D31 in `docs/DECISIONS.md`.

```bash
# apps/api, development only, bound to loopback with no proxy in front
LAB_ENVIRONMENT=development LAB_ADMIN_MODE=development uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
# apps/web in API mode (VITE_ENGINE_ADAPTER=api), then open "Admin (development)"
```

Uploads and drafts are stored in gitignored `data/admin/`. Requests that are not local (a
foreign `Host` or `Origin`, or proxy headers) get 404.

## Quality gate

| Command             | Runs                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm format`       | Prettier (TS/JSON/MD) + ruff format (Python)                                                                      |
| `pnpm format:check` | Same, check only                                                                                                  |
| `pnpm lint`         | ESLint + ruff check                                                                                               |
| `pnpm typecheck`    | `tsc` per package + mypy (strict)                                                                                 |
| `pnpm test`         | Vitest per package + Pytest (builds the verifier first)                                                           |
| `pnpm build`        | Content validation, verifier bundle, production web build                                                         |
| `pnpm check`        | All of the above in order (CI entry point)                                                                        |
| `pnpm db:smoke`     | Applies `supabase/migrations` to a disposable pgvector/PostgreSQL 16 container and tests the knowledge repository |

Regenerate generated files with `pnpm --filter @vlab/contracts schemas:write` (JSON Schemas) and
`pnpm --filter @vlab/simulation-core fixtures:write` (cross-implementation fixtures).

## Layout

```text
apps/web/                  React + Vite UI; engine/ holds the local and API adapters
apps/api/                  FastAPI service, verifier adapter, repositories (uv project)
packages/contracts/        Zod schemas, exported JSON Schemas (schema/), shared fixtures (fixtures/)
packages/simulation-core/  Pure engine (src/) and verifier CLI (cli/ -> dist/verifier.mjs)
content/                   Experiment definition, assessment parameters, locales, source registry
supabase/migrations/       Versioned PostgreSQL schema with RLS
scripts/db/                Disposable-container migration smoke test
research-sources/          Private NIE PDFs: gitignored, never served or deployed
docs/                      SOURCE_MAP, ARCHITECTURE, DECISIONS, STATUS
```

Source PDFs are not in Git. Place them in `research-sources/` under the filenames listed in
[docs/SOURCE_MAP.md](docs/SOURCE_MAP.md) and verify their SHA-256 checksums.
