# Status — Milestone M1

_Last updated: 2026-10-11 (Slice 6b: Groq primary + OpenAI fallback routing; no live calls)_

## Slices

| Slice | Scope                                                 | State                                       |
| ----- | ----------------------------------------------------- | ------------------------------------------- |
| 0     | Source audit, SOURCE_MAP, plan + amendments           | ✅ done                                     |
| 1     | Reproducible foundation                               | ✅ done                                     |
| 2     | Experiment definition + deterministic engine          | ✅ done                                     |
| 3     | Bilingual practical UI + modes                        | ✅ done                                     |
| 4     | API, verifier, persistence boundary, notebook, report | ✅ done                                     |
| 5     | Page-aware RAG assistant (retrieval + boundary)       | ✅ done                                     |
| 6a    | OpenAI generation provider + comparison harness       | ✅ code done; live run blocked (no API key) |
| 6b    | Groq primary, OpenAI paid fallback (failover router)  | ✅ code done; live runs blocked (no keys)   |
| 6     | Integration + evaluation                              | pending                                     |

## Slice 6b — dual-provider generation (D30)

- **Groq adapter:** `GroqGenerationProvider` (qwen/qwen3.8-27b) uses the OpenAI SDK at `https://api.groq.com/openai/v1` with Chat Completions strict JSON schema. It sends the same schema and request boundary as other providers, with no tools, streaming, history or storage, and its output passes the shared validation.
- **Failover routing:** `LAB_LLM_PROVIDER=failover` routes to Groq first and OpenAI gpt-6.1-sol second (the order is configurable; the default is still `disabled`).
  - Each provider is tried at most once.
  - Fallback happens only on 429, connection, timeout, 5xx or an unavailable/deprecated model.
  - Refusals, schema failures, grounding failures, 400/422 and 401/403 never fail over.
- **Circuit breaker:** process-local, honouring Retry-After or a 60 s cooldown, with a single half-open probe.
- **Paid-fallback budget:** 50 OpenAI fallback calls per UTC day by default.
- **Deadlines:** 12 s primary, 18 s fallback, 30 s total; the fallback gets the remaining time. Cancellation starts no further provider.
- **Cache, logs and health:**
  - The cache key adds the routing policy, provider order and prompt version.
  - The actual provider and model are stored with each validated answer.
  - Logs carry routing metadata only.
  - Health shows the order, circuit state and remaining fallback count.
- **Evaluation:** `--provider groq|openai` calls one provider directly (no failover), with private checkpoint/resume; a 429 pauses the run (exit 3). `check_providers.py` makes one Groq and one OpenAI request when confirmed.
- **Live calls: none made** (keys not available to the tooling). Keys that had been pasted into `.env.example` were removed; they must be rotated.

## Slice 6a — OpenAI generation provider (D26–D29)

- **Provider selection:** `openai` (Responses API, official SDK 3.28) is selected only explicitly; `disabled` stays the default and `fake` is used for all tests.
- **Configuration:** `LAB_LLM_MODEL` (candidate gpt-6.1-sol), `LAB_LLM_REASONING_EFFORT` (default low), `LAB_LLM_MAX_OUTPUT_TOKENS` (512) and `LAB_LLM_TIMEOUT_SECONDS` (20). `OPENAI_API_KEY` is required only for `openai` and is never logged or exposed; health shows the provider and model only.
- **Request:** a single stateless turn with no tools, `store=False` and no automatic retries. The instructions are separate from one JSON block of untrusted data: the question, locale, `{experimentId, mode, submitted}` and at most the 4 selected chunks.
- **Strict claims schema:** `{decision, answer, claims[{text, citedChunkIds, supportingSpans}]}`. Server validation adds:
  - citations limited to the supplied chunks, and verbatim supporting spans;
  - number, formula and chemical-entity support, plus preserved notation;
  - language and length checks, and disguised-refusal detection.
  - The KMnO₄/oxalic-acid question is always refused.
- **Failure mapping:** 503 unavailable, 504 timeout, 429 rate-limited (retryable), and 502 invalid structured output. Failed validation returns the fixed refusal. There is no cross-provider retry.
- **Cache key and logging:** the cache key adds the provider, model, prompt version (`assistant-prompt-2.0.0`) and retrieval configuration. Logs hold metadata only.
- **Evaluation harness:** `scripts/ingest/evaluate_generation.py` is opt-in, requiring the key and `--confirm-live`.
  - It prints the plan, request count and token/cost estimate.
  - It runs a canary hidden-state preflight, then a four-case smoke gate (aborting on failure), then both tracks (oracle and end to end) with each case run twice.
  - Must-refuse cases were expanded to 18 (`generation-adversarial.v1.json`); the gold labels are unchanged.
- **Live comparison: not run** — no `OPENAI_API_KEY` in this environment. gpt-6.1-sol remains the candidate by default; no model-quality claim is made.

## Zero-solute amendment (D20)

A submission whose flask is made up with no solute now raises one restart-required
`INCOMPLETE_PROCEDURE`. The report then shows c = 0 mol dm⁻³ and a completeness deduction.

Versions were bumped to engine 0.2.0 and definition 1.1.0. The report cache is keyed by version
(in memory and in migration `…000200`).

The new parity fixture `manual-zero-solute` checks this across the engine, the built CLI, the
local adapter and the HTTP API.

## Slice 5 — delivered

- **Extraction:**
  - pypdf reads only the 9 approved pages and fails closed on any checksum or filename mismatch.
  - Normalisation is deterministic, followed by reviewed page repairs, each of which must match exactly once.
  - Resource-book pages are segmented by printed page (F21).
  - Chunks are section-aware, 250–450 tokens (never over 512, measured with the real tokenizer), and have stable content-addressed IDs.
  - 8 regression anchors are checked.
  - Text and embeddings are private (`data/`, gitignored); the committed manifest holds metadata only.
- **Corpus `kb-exp04-1.0.0`:** 13 chunks (12 in scope):

  | Source page            | Chunks                      |
  | ---------------------- | --------------------------- |
  | handbook p9/printed 1  | 1                           |
  | p10/2                  | 1                           |
  | p16/8                  | 2                           |
  | p29/21                 | 1                           |
  | p30/22                 | 1                           |
  | resource book p123/113 | 2 (1 out of scope: nuclear) |
  | p124/114               | 2                           |
  | p125/115               | 2                           |
  | syllabus p22/11        | 1                           |

- **Embeddings:**
  - `multilingual-e5-small` at revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`, dimension 384 (verified).
  - The `fake` provider is used for tests; the real model is never loaded during `pnpm check`.
- **pgvector:**
  - `knowledge_versions` and `knowledge_chunks` (`vector(384)`), with RLS, no client policies and client privileges revoked.
  - B-tree indexes only; exact cosine search.
  - In-memory and Postgres `KnowledgeRepository` with idempotent ingestion and an explicit active version.
- **Retrieval:** exact heading match, then exact cosine search, then merge and de-duplicate; at most 8 candidates, at most 4 passed to generation; a safe citation projection only.
- **Generation:**
  - Providers: `disabled` (the default) and `fake`. **Runtime provider choice required:** no real provider has been chosen or wired.
  - Structured output with post-validation of citations, numbers, formulas, length and content; anything unsupported is refused.
  - Injection screen, single-turn prompt and a versioned answer cache.
- **`POST /assistant/ask`:**
  - Replaces the 501 route; accepts only `{sessionId, question, locale}`.
  - Errors are 503 `assistant_unavailable` / `knowledge_unavailable`, 504 `assistant_timeout` and 502 `assistant_invalid_response`.
- **Web:**
  - Accessible `AssistantPanel` on the workbench: labelled field with hint, live result region, citation list, alert for errors.
  - Sinhala answers show the AI-assistance label. It is disabled offline.
  - It reads no session state, so manual mode discloses nothing early.
- **Evaluation:** see [RAG_EVALUATION.md](RAG_EVALUATION.md).

  | Group                               | R@4   | MRR@8 |
  | ----------------------------------- | ----- | ----- |
  | English                             | 0.979 | 0.896 |
  | Sinhala question → English evidence | 0.729 | 0.678 |

  Hybrid and vector-only results are identical on this gold set.

## Last quality-gate run (2026-10-10)

`pnpm check` exited 0, and the production build is clean. The bundle-size warning and the
`THREE.Clock` warning are accepted debt.

| Workspace                            | Tests |
| ------------------------------------ | ----- |
| contracts                            | 52    |
| simulation-core                      | 168   |
| web                                  | 135   |
| api                                  | 244   |
| build-time content/schema validation | 49    |
| **Total**                            | 648   |

The API's 244 tests break down as: assistant 47, api 41, failover router 40, openai provider 22, knowledge 19, verifier 15, groq provider 14, health 9, parity and contracts 9, generation evaluation 9, migrations 8, embeddings 7 and retrieval evaluation 4 (about 123 s). Every provider test uses mocked SDK clients; `pnpm check` makes no external call. All earlier tests remain valid.

Commands: `pnpm check` (exit 0). Focused runs: `uv run pytest tests/test_openai_provider.py
tests/test_assistant.py tests/test_generation_eval.py`. The live command without a key exits 2
and sends nothing.

### Live checks

- **Real extraction and E5 build:** completed in the short-path rag environment (D24). All anchors were present and no chunk exceeded 512 tokens.
- **HTTP end to end** (uvicorn, development settings, `e5_local` with the `fake` generator):
  - The English and Sinhala questions on the solute mass were both grounded on handbook p.29 (printed p.21), and the Sinhala answer carried the AI label.
  - "Boiling point of ethanol" was refused (`insufficient_evidence`), and the injection was refused (`unsafe_request`).
  - Before and after submission in a manual session, responses contained no hidden fields and no chunk text outside the answer. The state fingerprint changed after completion, the report returned 200, and a repeat question was served from cache.
- **Migration smoke** (`pnpm db:smoke`, `pgvector/pgvector:pg16`): 29 checks passed.
  - All 3 migrations apply; 7 tables with RLS; `vector(384)`; B-tree indexes only; no knowledge policies.
  - Both `anon` and `authenticated` are denied access to chunks.
  - The versioned report-cache uniqueness holds.
  - Postgres repository: idempotent ingestion (4 then 0), explicit activation, unknown version rejected, exact cosine order equal to the in-memory order, out-of-scope chunks excluded, rows round-trip.
  - The container is removed afterwards.

## Environment

Node 22.13.0 · pnpm 10.34.6 · uv 0.13.0 · Python 3.12.15 · TypeScript 6.0.3 · Vite 8.3 · Vitest 5.0 · React 19.3 · Zod 4.6 · FastAPI · pypdf 6.20 · psycopg 3.3 · pgvector 0.5 · openai 3.28 · sentence-transformers 6.1 (rag group) · Docker 29.7.

## Known limitations

- **No live Groq or OpenAI call has been made.** The Groq free tier is not a guaranteed production SLA. The circuit and fallback budget are process-local (one API process; no database needed; a distributed deployment would need shared state).
- **Live model comparison not run** (no API key available). The OpenAI adapter is tested only against a mocked SDK. Nothing is measured yet about the real behaviour, latency, cost or Sinhala quality of gpt-6.1-sol or gpt-6-luna. The model names come from the request and their availability is unverified.
- **Entity detection is pattern-based:** names without chemical suffixes (e.g. ethanol, phenolphthalein) rely on the model's refusal plus the number, formula and span checks. The chemical glossary is pending teacher review.
- **Advisory only:** the assistant never grades. Real use by students under 18 needs parent/guardian consent and institutional/ethics approval (D28).
- **Sinhala retrieval is weaker** (R@4 0.729), and the Sinhala gold questions are unreviewed drafts. No claim is made about Sinhala quality.
- **Tiny evaluation:** 32 supported questions over 13 chunks. The hybrid heading path did not fire on any gold question.
- **No authentication;** do not deploy the API publicly. The API's knowledge base is the in-memory repository loaded from the private file; the Postgres session repository is still not enabled.
- **Verifier overhead:** about 260 ms per action (one Node process per call).
- **Offline adapter secrecy:** the browser holds the full state, and the assistant is unavailable offline.
- **Answer cache:** in process and unbounded across restarts (not persisted).
- **Bundle size:** above Vite's default warning; this is documented debt. Provisional parameters and Sinhala strings await teacher review. F17–F21 are open.
- **OneDrive and Windows:**
  - pytest and ruff caches report `Access is denied`.
  - The long-path limit breaks `transformers` inside the project venv, hence the short-path rag environment.
  - `git status --ignored` warns `Filename too long` under `node_modules`.
  - `uv` must be on `PATH` for `pnpm check`.

## Next smallest task

Rotate the two exposed keys, then put the new values only in the untracked `.env` or the server
environment. Run `check_providers.py --confirm-live` (one request per provider), then the resumable
Groq evaluation (`evaluate_generation.py --provider groq --confirm-live`) and the OpenAI comparison.
Record the aggregate gates, and have a teacher review the Sinhala outputs before any model or
routing claim.
