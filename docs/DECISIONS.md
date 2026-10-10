# Decisions

Each entry: context → decision → consequence. Newest last.

## D1 — Server verification reuses the TypeScript engine via a Node CLI (approved for M1 only)

- **Context:** the API must replay/verify events; a second Python engine would drift.
- **Decision:** bundle `packages/simulation-core` as a Node CLI behind a `SimulationVerifier` adapter in the API. JSON via stdin/stdout only; fixed executable path resolved at startup; no user input in command arguments or shell strings (`shell=False`); per-call timeout; non-zero exit, timeout or invalid JSON map to a controlled `verification_unavailable` error. Contract and replay tests cover both sides.
- **Consequence:** one engine. Subprocess start-up overhead per verification is an **M1 limitation** (measured and recorded in STATUS.md in Slice 4). No Python simulation implementation will be written.

## D2 — Provisional simulation parameters

- **Context:** NIE sources give no tolerances (F3), no flask eye-level error magnitude (F2), no retained mass for skipped rinsing (F16), and no numeric effect for tap water/dirty glassware (F7, F8).
- **Decision:** such values live in `content/experiments/exp04/assessment.v1.json`. Every entry has `parameterId`, `value`, `unit`, `rationale`, `sourceType: "simulation_assumption"`, `reviewStatus: "teacher_review_pending"`, `effectCategory`, `version`. They are never presented as NIE facts in UI, report, or assistant answers.
- **M1 rules:**
  - wrong eye level → deterministic **seeded** volume error;
  - skipped rinsing → deterministic retained mass;
  - tap water, dirty glassware → purity/validity risk only;
  - insufficient mixing → homogeneity/sampling risk only;
  - no invented numeric concentration change for contamination or poor mixing.

## D3 — Source-priority applications

- Final mixing after make-up: handbook p.16 (V5), corroborated by resource book p.124 (E24). F6 resolved.
- Anhydrous Na₂CO₃: resource book p.123 (E22) + handbook M = 106 g mol⁻¹ (E7). F9 resolved.
- Eye-level principle: handbook p.16 states it for the burette (V7); applied to the flask mark as a technique rule, magnitude per D2. F2 partially unresolved.

## D4 — Toolchain

- **pnpm 10.34.6 via `npm i -g pnpm@10`.** Corepack 0.30 (bundled with Node 22.13) could not write shims to `Program Files` without admin, and with a user install directory it failed signature verification (`Cannot find matching keyid`: Corepack's bundled npm keys are outdated). Disabling verification was rejected. Approved fallback used. Root `packageManager` pins the version.
- **uv 0.13.0** via the official Windows installer; uv manages **Python 3.12.15** for the API (`requires-python >=3.12,<3.13`). The ML/embedding stack (torch, sentence-transformers) is not yet verified on 3.13.
- **TypeScript pinned `~6.0.3`.** TypeScript 7.0 (native port) is `latest`, but `typescript-eslint` 8.71 requires `typescript <6.1`. Revisit when typescript-eslint supports TS 7.
- **`httpx2`** instead of `httpx` for the FastAPI test client (Starlette deprecation).

## D5 — Workspace packages export TypeScript source

- `@vlab/contracts` and `@vlab/simulation-core` export `./src/index.ts`; Vite and Vitest compile them directly, and `tsc --noEmit` type-checks each package. The engine gets a real bundle only for the Node CLI (D1). This avoids a build step and stale `dist/` during development.

## D6 — OneDrive mitigations (repository stays in OneDrive)

- Pytest's cache provider is disabled (`-p no:cacheprovider`): OneDrive intermittently locked the cache directory during rename (`WinError 5`). No functional impact. Any further locking or performance failure will be reported rather than worked around silently.

## D7 — Error-aware transition classes (Slice 2)

- **Physically impossible** → rejected by a declared precondition (`transitionRules[].preconditions`, interpreted by the engine). Lab state and fingerprint are unchanged; a rejected event is still appended (session `nextSeq`/`elapsedMs` advance).
- **Possible but procedurally wrong** → accepted. State changes (e.g. spilled mass, extra volume, purity risk) and the error is recorded with category, consequence, recoverability, parameter IDs and source refs.
- **Unsafe** → recorded as `safety_violation`, never as a technique error. Mode policy (`param.safety_policy_*`): `confirm` (guided beginner/intermediate) rejects with `safety_acknowledgement_required` until the envelope carries `acknowledgedSafetyWarning: true`, then performs the action and records the violation. `warn` (automatic, advanced, manual) performs it immediately with an always-visible safety warning.
- Each error code is recorded **once per attempt**. A recoverable error can re-open after it has been corrected. Corrections emit `resolvedErrors`, and scoring keeps `param.recovered_error_factor` of the deduction.
- Errors are detected at the action that commits the consequence (e.g. wrong mass at `transfer_solid`, unrinsed residue when leaving the transfer phase, mixing and label at `apply_label`/`submit_experiment`).

## D8 — Modelling simplifications (see SOURCE_MAP F17–F19)

- Incomplete transfer = solid spilled outside the funnel (`fractionIntoFunnel < 1`); spilled mass is lost.
- Rinsing moves the film residue (provisional fractions) into the flask; residue is lost once the funnel is removed unrinsed.
- `dissolve_solute` is a procedural/observational abstraction: the learner has added a sufficient but unspecified amount of distilled water, stoppers and shakes the flask, and the action confirms that no visible solid remains. The engine does not calculate Na₂CO₃ solubility; the minimum water volume is outside M1 because it is absent from the approved sources (F17). The engine only checks the physical preconditions (stoppered, liquid present, solute present).
- Transfer requires the funnel on the flask (narrow neck); shaking/inverting requires the stopper. These are simulator constraints, not cited NIE rules.
- Labels are checked against the **target** concentration (1 mol dm⁻³), per handbook E19 ("the concentration of the solution").

## D9 — Content files are now the source of truth

- `content/experiments/exp04/{definition,assessment}.v1.json`, `content/sources.v1.json` and `content/locales/en/{exp04,common}.json` were generated once in Slice 2 and are now maintained by hand. Tests keep them consistent: schema, source refs ↔ registry ↔ SOURCE_MAP, localisation keys ↔ English strings, parameter references.
- JSON Schemas in `packages/contracts/schema/` are generated (`pnpm --filter @vlab/contracts schemas:write`), excluded from Prettier, and drift-checked by tests.
- `pnpm build` runs `content:validate` first, so invalid content fails the build.

## D10 — Tooling additions (Slice 2)

- `@types/node@22` (root dev dependency) for test files that read fixtures. Package `src` is type-checked with `types: []` (`tsconfig.json`) so the engine cannot depend on Node APIs; tests use `tsconfig.test.json`.
- `zod` added as a dev dependency of `simulation-core` (same version as contracts) for the scenario-fixture schema.
- Adding `@types/node` created duplicate peer variants of vitest that broke jest-dom typings in `apps/web`; `pnpm dedupe` fixed it (lockfile only).

## D11 — UI ↔ engine boundary (Slice 3)

- `apps/web/src/engine/adapter.ts` defines `EngineAdapter`; it is the only module that imports `@vlab/simulation-core` (enforced by `no-chemistry.test.ts`). State-changing calls (`createSession`, `dispatch`, `predictErrors`) are async so Slice 4 can substitute an API-backed adapter without touching components.
- One Zustand store (`store/sessionStore.ts`, vanilla `createStore` behind a React context) holds application/session state only. `dispatchLabAction` passes the envelope to `adapter.dispatch` and stores the returned state, events and feedback; dispatches are serialised. The store contains no transition logic.
- The pre-lab safety acknowledgement is recorded in the engine as the learner's first `confirm_safety` action when a guided/manual session starts.
- Guided-beginner confirmation uses `predictErrors` (a dry run of the same engine). Unsafe actions under the `confirm` policy are re-dispatched with `acknowledgedSafetyWarning: true` only after the learner confirms.

## D12 — What the live UI may reveal

- Manual mode: procedural feedback (`visibility: procedural`) is filtered out of the live UI; physical rejections, observations and safety warnings stay visible.
- Measurements: balance readings (`watch_glass_mass`, `balance_slider_setting`, `weighed_solute_mass`) are always shown. Engine-derived values (`transferred_solute_mass`, `final_volume`, `achieved_concentration`) are shown only when the profile reveals procedural feedback; in manual mode they appear in the report (Slice 4). When a provisional parameter changed a numeric result, they carry "Simulated effect — pending teacher validation."
- The scene and its text fallback show what the learner can perceive: after a judged-at-mark make-up the liquid is drawn at the mark, and the level text follows the engine's latest level observation, so a parallax error is not leaked. The purity/validity marker appears only when procedural feedback is visible.

## D13 — Slice 3 dependency and tooling choices

- Added: `i18next`, `react-i18next`, `zustand`, `three`, `@react-three/fiber`, `@fontsource/noto-sans-sinhala` (Sinhala subsets 400/600 only, bundled locally), `@types/three` (dev). Not added: `@react-three/drei` (fixed camera, no helpers needed) and `react-router-dom` (views are store state; no URL routes needed yet).
- `TranslationMetaSchema` lives in `@vlab/contracts` so the web app does not import Zod directly.
- i18next uses flat keys (`keySeparator: false`) and **no fallback language**, so a missing Sinhala key shows as its key and fails tests.
- `build.chunkSizeWarningLimit` raised to 1000 kB: the lazily loaded 3D chunk is three.js (~914 kB minified / 242 kB gzip). Main bundle ~603 kB / 161 kB gzip. Logged as an M1 limitation.
- The Slice 3 manual smoke test drove headless Chrome through the DevTools protocol with a scratchpad script (no repository dependency). Chrome needed a short `--user-data-dir` path on Windows. Playwright arrives in Slice 6.

## D14 — Verifier CLI and server-side authority (Slice 4; implements D1)

- `packages/simulation-core/cli/verifier.ts` is bundled by Vite (SSR build, all dependencies inlined) into `dist/verifier.mjs`. Operations: `initialize`, `apply`, `preview`, `view`, `report`, `verify`. Request/response shapes are the `verifier-request/response` contracts; the API validates every response against the exported JSON Schema and rejects extra fields.
- Every non-initialize call replays the full stored chain (`verifyEventStream`) before acting, so the server never trusts client state, consequences, scores, reports or concentrations. Engine, definition and assessment versions are checked on every call.
- Protocol rejections (`event_chain_invalid`, `not_submitted`, ...) are `ok: false` responses; only crashes exit non-zero. The Python adapter maps failures to 503 (unavailable), 504 (timeout) and 500 (invalid response); stderr is logged by size only.
- Shared rules for system actions, previews and report gating live in `src/operations.ts`, used by the CLI and the offline adapter.
- **M1 limitation:** one Node process per call, replaying the whole chain: about 260 ms per action locally (measured over 21-action runs). A long-lived worker or in-process engine is post-M1.

## D15 — Idempotency, concurrency and time

- `clientActionId` (UUID, generated once per user action) + payload hash: a retry returns the stored response with no new event; the same ID with a different payload is 409. Unique `(session_id, client_action_id)` in memory and in SQL.
- `expectedSequence` must equal the next sequence (409 `stale_sequence` otherwise); a per-session lock serialises submissions; `commit_action` appends and advances atomically.
- The server stamps `elapsedMs`; the client never sends time, state or consequences.
- Server seeds are random per session (`fixed_seed` is allowed only when `environment=test`). Recorded fixtures are therefore replayed with the test seed; live runs read the balance like a learner.

## D16 — Public projection and disclosure (`src/projection.ts`)

- One projection function serves the server and the offline adapter (see ARCHITECTURE). Manual mode stays `observable` for the whole live session, including after submission; the completed report is the only disclosure point.
- The web store now holds the projection (`SessionView`), never full engine state. Components read `session.bench`, `session.guidance` and public events.
- The offline adapter cannot provide strong secrecy (the engine runs in the tab); the API adapter does.

## D17 — Persistence boundary and migrations

- Repository protocols (experiments, sessions, events with idempotency, notebooks, reports) with a complete in-memory adapter. Data is lost when the process stops. `LAB_REPOSITORY=postgres` is rejected at startup in M1.
- `supabase/migrations/20261010000100_core_schema.sql`: UUID keys, timestamptz, version columns, JSONB only for versioned payloads, unique `(session_id, sequence_number)`, `(session_id, client_action_id)` and `(session_id, head_fingerprint)`, RLS on every table with `owner_id = auth.uid()` policies, append-only triggers on `action_events` (UPDATE/DELETE/TRUNCATE rejected). No vector objects (Slice 5).
- Verified by `scripts/db/migration_smoke.py` on a disposable `postgres:16-alpine` container with a minimal mock `auth.uid()` and `authenticated` role; the container is removed afterwards and other containers are never touched.

## D18 — Authentication boundary (none in M1)

- Principal providers: fixed development principal (development only), fixed test principal (test only), Supabase JWT placeholder that fails closed with 503 `auth_not_configured`. Production startup without `supabase_jwt` is refused. Owner IDs are never read from bodies or headers.
- **The API must not be deployed publicly until real authentication exists.**

## D19 — Slice 4 dependencies

- Python: `jsonschema` (contract validation), dev `types-jsonschema` (strict mypy). Not added: psycopg (migrations are verified through `docker exec psql`), ORM, async test plugins.
- simulation-core: dev `vite` (same version as the web app) to bundle the CLI. `apps/api/package.json` depends on `@vlab/simulation-core` so `pnpm -r` builds the verifier before API tests.
- `build.chunkSizeWarningLimit = 1000` remains documented M1 technical debt; no bundle analysis has been done, so no claim is made about how far the chunks can be split.

## D20 — Zero-solute completion rule (amendment, engine 0.2.0, definition 1.1.0)

- `submit_experiment` raises `INCOMPLETE_PROCEDURE` when the flask is not made up to the mark **or** no solute mass is in the flask. The check uses the flask's solute mass, not the balance reading or whether a transfer action happened. A partial transfer stays `MASS_OUT_OF_TOLERANCE`.
- The error is now `restart_required` (source ref E15, handbook p.30 / printed p.22). It is raised once per submission, and an idempotent retry does not duplicate it.
- The report cache is keyed by (session, engine version, definition version, assessment version, head fingerprint), both in memory and in migration `20261010000200_report_cache_versions.sql`. A version bump therefore regenerates the report instead of serving a stale one.

## D21 — Approved-page extraction and chunking

- Only the pages in `content/knowledge/approved-pages.v1.json` are read, with pypdf, one physical page at a time. Each source must match its approved filename and SHA-256 in `content/sources.v1.json`; otherwise the build fails closed.
- Normalisation is deterministic: NFC, ligatures, Symbol-font bullets, rejoining split sub/superscripts and formula/unit notation (Na₂CO₃, cm³, dm⁻³ …). It ends with **reviewed page repairs**, each of which must match exactly once. Source typos ("Dialute", "nai1") are kept as written.
- Resource-book PDF pages contain more than one printed page (F21). The running header plus printed page number selects the approved segment, and a missing segment fails the build.
- Chunks are section-aware within one page and are never split mid-block. They target 250–450 tokens measured with the real E5 tokenizer, including the `passage: ` prefix, with a hard limit of 512 (exceeding it is an error, never a truncation).
  - A move between in-scope and out-of-scope sections always starts a new chunk.
  - A short page tail is merged into the previous chunk when the result still fits.
  - Chunks under 250 tokens remain only where a page or scope boundary forces them.
- Chunk ID = `kc_` + SHA-256(source | document SHA | PDF page | text SHA)[:20], so IDs are stable and content-addressed.
- The build fails if any of 8 regression anchors is missing from in-scope chunks.
- Chunk text and embeddings are written only to `data/knowledge/<version>/chunks.jsonl`, which is gitignored. The committed `content/knowledge/manifest.v1.json` holds metadata only (no text, no vectors) plus the chunk file's SHA-256, and the server refuses data that doesn't match it. A `fake` build writes to `data/knowledge-fake/` so it can never overwrite the real manifest.

## D22 — Embeddings and vector storage

- The `EmbeddingProvider` protocol has two implementations: `fake` (hashed bag of words, tests only) and `e5_local` (`intfloat/multilingual-e5-small` via sentence-transformers on CPU).
- Behaviour common to both:
  - exact `query: ` / `passage: ` prefixes for every language;
  - L2-normalised vectors of exactly 384 dimensions, with any mismatch rejected;
  - the 512-token limit checked before embedding;
  - the model loaded lazily, once, under a lock.
- The resolved revision is the Hugging Face snapshot commit (`614241f622f53c4eeff9890bdc4f31cfecc418b3`). It is recorded in the manifest and pinned at query time (`LAB_EMBEDDING_REVISION`, defaulting to the manifest value). Retrieval refuses a model or revision that differs from the knowledge version's.
- Migration `20261010000300_knowledge.sql` creates:
  - `knowledge_versions`, with at most one active version via a partial unique index;
  - `knowledge_chunks`, with `embedding extensions.vector(384)` and a unique key on (chunk_id, knowledge_version, embedding_model);
  - RLS with **no policies**, and all privileges revoked from `anon` and `authenticated`;
  - **B-tree indexes only**.
- With 13 chunks, exact cosine search (`<=>`) is cheaper and more predictable than HNSW or IVFFlat, so no approximate index is created.
- `KnowledgeRepository` has an in-memory and a Postgres (psycopg + pgvector) implementation. Ingestion is idempotent, and activation is explicit; old versions are never deleted.
- The running API uses the in-memory repository loaded from the private file, because the Postgres session repository is still not enabled in M1. The Postgres knowledge repository is exercised by the smoke test.

## D23 — Retrieval, generation and the assistant route

- **Retrieval order:**
  1. exact heading match (specific multi-word headings only);
  2. exact cosine search;
  3. merge, de-duplicate and break ties by chunk ID.

  At most 8 candidates are kept and the first 4 go to generation. Out-of-scope chunks are never returned.

- **No score threshold decides sufficiency.** The evaluation shows supported and unsupported top-1 scores overlap.
- **Generation:**
  - The `GenerationProvider` protocol has two implementations: `disabled` (the default) and `fake` (deterministic extractive, development/test only and refused in production). A real provider (`openai`) was added later; see D26. Any unknown `LAB_LLM_PROVIDER` value fails startup, and no model ID is hard-coded.
  - The prompt is a single turn with no chat history. Evidence and the question are delimited as inert data.
  - Output must be exactly `{answer, evidenceSufficient, citedChunkIds}`; anything else is a 502 `assistant_invalid_response`.
- **Post-validation.** An answer is refused, never passed through, when any of these hold:
  - its citations are not unique, are empty, or fall outside the retrieved evidence;
  - it is over 180 words;
  - it contains a URL or markup;
  - it contains a number or formula that is not in the cited text.
- **Injection screening.** A small screen catches obvious instruction-override phrasing (defence in depth). A screened question is refused without retrieval or generation.
- **Route.** `POST /assistant/ask` accepts only `{sessionId, question, locale}`, which is contract-validated, so any extra field is a 422. The session must belong to the principal.
- **Safe state.** The server derives a safe state (experiment, definition version, mode, completed). It contains no measurements, errors or scores, is not sent to the provider, and its fingerprint is part of the cache key.
- **Response.** It returns a safe citation projection (title, year, PDF page, printed page, section, heading, chunk ID), never chunk text. Sinhala answers carry `aiAssistanceLabel`. Refusal messages come from the shared UI locale files.
- **Cache.** An in-process LRU is keyed by normalised question, locale, knowledge version, state fingerprint, prompt version, provider and model. It caches grounded answers and genuine insufficient-evidence refusals, but not validation failures.

## D24 — Short-path environment for the local model (Windows / OneDrive)

- The real E5 build failed with `FileNotFoundError` inside `transformers`. Windows long paths are disabled (`LongPathsEnabled=0`), and the project venv inside OneDrive exceeds 260 characters.
- The `rag` group therefore lives in a separate short-path environment: `UV_PROJECT_ENVIRONMENT=C:/Users/prasa/.venvs/vlab-rag uv sync --project apps/api --group rag`. The default project venv (used by `pnpm check`) does not install the rag group.
- The model cache stays in the user's Hugging Face cache, outside the repository, and `.cache/huggingface/` is gitignored as a precaution. `pnpm check` never loads the model or calls a provider.

## D25 — Slice 5 dependencies

- API main dependencies: `pypdf` 6.20 (extraction), `psycopg[binary]` 3.3 and `pgvector` 0.5 (Postgres knowledge repository; vectors use `pgvector.Vector`, so numpy is not required).
- API `rag` group: `sentence-transformers` 6.1, which brings torch 2.14, transformers 5.19 and numpy 2.5.
- No ORM, LangChain, LlamaIndex, Redis, extra services, approximate indexes, OCR, BGE-M3 or GraphRAG were added.

## D26 — Generation provider: OpenAI, with gpt-6.1-sol as the initial candidate

Supersedes the "runtime provider choice required" note in D23.

- **Providers:** `disabled` remains the default and `fake` remains the provider for all automated tests. `openai` is an explicitly selected runtime provider (`LAB_LLM_PROVIDER=openai`), built on the official OpenAI Python SDK (`openai` 3.28) and the Responses API.
  - Startup refuses `openai` without `LAB_LLM_MODEL` and `OPENAI_API_KEY`. The key is required only for `openai`, is read only on the server, and is never logged, returned or shown by `/health`. Health shows the provider and the model name only.
- **Models:**
  - The initial production candidate is **gpt-6.1-sol**; the comparison candidate is **gpt-6-luna**.
  - There is no silent fallback between providers or models. An unavailable model, rejected credentials or a rejected request configuration all return a safe 503 `assistant_unavailable`.
- **Request:**
  - A single stateless turn: `store=False`, no `previous_response_id`, no conversation history.
  - **No tools are declared**, so web search, file search, code execution and function calls cannot run.
  - Strict JSON-schema output, generated from the Pydantic model.
  - `reasoning.effort` comes from `LAB_LLM_REASONING_EFFORT` (default `low`) and `max_output_tokens` from `LAB_LLM_MAX_OUTPUT_TOKENS` (default 512).
  - The SDK's automatic retries are disabled (`max_retries=0`), so the configured timeout bounds the call.
- **Failure mapping** (no stack traces, SDK bodies or key fragments reach clients):

  | Failure                                            | Response                                                                                              |
  | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
  | Timeout                                            | 504 `assistant_timeout` (retryable)                                                                   |
  | Rate limit                                         | 429 `assistant_rate_limited` (retryable; new error code)                                              |
  | Unavailable model, rejected credentials or request | 503 `assistant_unavailable`                                                                           |
  | Malformed or incomplete output                     | 502 `assistant_invalid_response`                                                                      |
  | Output that fails post-validation                  | Fixed localised refusal (the repository's established safe equivalent, D23), with the category logged |

  Malformed or unsupported output is never retried with another provider.

- **Selection rule for replacing gpt-6.1-sol with gpt-6-luna.** The swap is allowed only if gpt-6-luna:
  - passes every critical gate in both tracks; and
  - is no worse by more than one supported-answer failure after teacher review of Sinhala output.

  Otherwise gpt-6.1-sol stays.

- **Sinhala outcomes:**
  - If oracle Sinhala is good but end-to-end Sinhala is weak, the next work item is retrieval; models are not switched to hide that.
  - If both models have weak oracle Sinhala, stop: another provider or model comparison needs a separate decision and terms review.
- **Status (2026-10-10):** the live comparison has **not been run**, because no `OPENAI_API_KEY` was available in this environment. **gpt-6.1-sol therefore remains the candidate by default, not by measured result.** The opt-in command is in [RAG_EVALUATION.md](RAG_EVALUATION.md).

## D27 — Structured claims and server-side grounding validation

- **Output schema:** `{decision: "answer" | "refuse", answer, claims: [{text, citedChunkIds, supportingSpans: [{chunkId, text}]}]}`. It is strict: wrong types or any extra field is 502 `assistant_invalid_response`.
- **Prompt:**
  - Fixed instructions, with all untrusted content (the question, requested language, public session summary and at most the four retrieved chunks) sent as one JSON object between explicit `UNTRUSTED DATA` markers.
  - The model must answer only from the evidence, refuse when the evidence does not directly support an answer, never add pretrained chemistry, copy formulae and units exactly, and answer in the requested locale.
- **The session summary is the public projection only:** `{experimentId, mode, submitted}`. Seeds, events, measurements, errors, scores, report fields and owner or session IDs are never sent. Tests audit the exact request, and the live command runs a canary preflight before any call.
- **Server validation.** An answer is refused unless all of these hold:
  - every cited ID is among the supplied chunks;
  - every claim has at least one citation and at least one supporting span;
  - each span (at least 12 characters) is an exact NFC- and whitespace-normalised substring of its cited chunk;
  - the answer has at least one supported claim;
  - the answer is at most 180 words, contains no URL or markup, and is in the requested language (Sinhala script for `si`);
  - numbers and formulae in the answer and claims appear in the cited text. ASCII forms such as `Na2CO3` are rejected as `notation_not_preserved`.
  - chemical entities (formulae and chemical names) are supported by the cited text or by an equivalence in the reviewed-pending glossary `content/knowledge/chemical-glossary.v1.json`;
  - entities named in the question are present in the supplied evidence. For example, "How do I standardise KMnO4 with oxalic acid?" is refused as `unsupported_entity_in_question` even when a model answers it.
- **Refusals:** a `refuse` decision that carries claims, numbers or formulae is logged as `disguised_refusal`. In every case the student sees only the fixed localised refusal, never model text.
- **Logging:** metadata only (correlation ID, provider, model, status, category, latency, input, output and reasoning tokens). Never the question, answer, evidence, notebook or session state.
- **Cache key:** normalised question, locale, knowledge version, safe-state fingerprint, prompt version (`assistant-prompt-2.0.0`), provider, model and retrieval configuration (embedding model and revision, method, 8 candidates, 4 evidence chunks). The cache lives in server memory only.
- **Known limit:** chemical names without a recognisable suffix (e.g. "ethanol", "phenolphthalein") are not detected as entities. Refusing those questions relies on the model's evidence judgement plus the number, formula and span checks. The live evaluation includes such cases.

## D28 — Advisory use, minors and consent

- The assistant is **advisory**. Its answers must not determine student grades, competency or mastery without human (teacher) review. The practical competency estimate comes from the deterministic engine, never from the LLM (CLAUDE.md).
- Any real use by students under 18 requires parent or guardian consent and institutional and ethics approval before deployment. The API also has no authentication yet and must not be deployed publicly.
- Sinhala output quality is not claimed until a qualified teacher has reviewed it. Sinhala answers keep the AI-assistance label.
- Gaps F17–F21 are unchanged and approved source text is not altered by this slice.

## D29 — Slice 6a dependencies

- API main dependency: `openai` 3.28 (official SDK; uses the project's existing `httpx2`). No other packages, no agent frameworks.

## D30 — Dual-provider generation: GroqCloud primary, OpenAI paid technical fallback

- **Why:** Groq is the primary provider to keep cost down. OpenAI (gpt-6.1-sol) is a **paid technical fallback**, used only when Groq cannot technically answer. The repository default is still `disabled`.
- **Groq adapter (`GroqGenerationProvider`):** a separate class from the OpenAI adapter, but it reuses the official OpenAI SDK pointed at `https://api.groq.com/openai/v1`.
  - It uses the endpoint Groq documents for strict structured output: Chat Completions with `response_format={"type": "json_schema", "json_schema": {..., "strict": true}}`. Groq lists `qwen/qwen3.8-27b` as strict-capable, and `$defs`/`$ref` are supported.
  - It sends the same schema, instructions and untrusted-data JSON as every provider. No tools, browsing, history, storage or streaming are sent, and SDK retries are off.
  - Every result goes through the shared post-validation.
- **Routing (`LAB_LLM_PROVIDER=failover`):**
  - Both models and both keys are required at startup.
  - The order comes from configuration (`LAB_LLM_FAILOVER_ORDER`, default `["groq","openai"]`).
  - Each provider is attempted at most once per request and never revisited.
- **Fallback is allowed only for:**
  - 429;
  - connection failure or a transport that ended without a response;
  - timeout;
  - 5xx;
  - a model that is unavailable or deprecated (404 or a `model_decommissioned`-type code).
- **Fallback is forbidden for:** valid answers, all refusals (grounded, insufficient evidence, safety, injection), schema failures, any post-validation failure (citation, span, chemical, formula, number, language or length), 400/422 and 401/403.

  A provider response that fails grounding is answered with the standard safe refusal and is **never sent to another provider** to obtain a more permissive answer.

- **Circuit breaker** (process-local, in memory):
  - A primary 429 or temporary failure opens it for Retry-After, or `LAB_LLM_CIRCUIT_COOLDOWN_SECONDS` (60) when no header is sent.
  - While it is open, requests go straight to the fallback.
  - After the cooldown, one half-open probe is allowed. A schema-valid, post-validated primary response closes the circuit; a failed probe reopens it.
  - Auth, bad-request and schema errors do not open it.
  - Nothing is retried indefinitely.
- **Paid-fallback limit:** an in-memory per-UTC-day counter, `LAB_OPENAI_FALLBACK_DAILY_REQUEST_LIMIT` (default 50).
  - It counts only fallback calls to OpenAI (including direct-to-OpenAI calls while the circuit is open), not OpenAI selected directly or used in evaluation.
  - When it is exhausted, no paid call is made: the response is a safe retryable 503 `assistant_unavailable`, and a metadata-only warning is logged.
  - The OpenAI Platform project must also have a low budget and spending alerts; the counter is not a billing control.
- **Deadlines:**
  - The primary gets 12 s, the fallback 18 s, and the whole request 30 s; the fallback receives only the time that remains.
  - A client cancellation or the deadline sets a cancellation event, so the router starts no further provider.
- **Cache and audit:**
  - The cache key adds the routing-policy version (`failover-1.0.0`), the ordered provider/model list and the prompt version.
  - The provider and model that actually produced each validated answer are stored with the cache entry. The normal cache may serve a validated answer from either provider, while evaluation never uses that cache and keeps its checkpoints per provider and model.
  - Logs record the correlation ID, attempted providers, failure category, actual provider, fallback flag, latency and tokens. Never questions, answers, chunks, notebook text or keys.
- **Client and health:**
  - A primary failure followed by a successful fallback is a normal answer. If both providers fail, the response is the existing safe retryable 503. Keys and raw provider errors are never exposed.
  - `/health` shows the order, circuit state and remaining fallback count, with no credentials or failure details.
- **Limits and obligations:**
  - The Groq free tier has daily token and rate limits, so it is **unsuitable as a guaranteed production SLA**.
  - The router needs **no database** for one API process; a distributed deployment needs shared circuit and budget state.
  - Sinhala quality remains unclaimed until teacher review.
  - Authentication, parent/guardian consent and ethics approval are still required before any student deployment (D28).
- **Evaluation:** `evaluate_generation.py --provider groq|openai` calls one provider **directly**, bypassing failover so results are not contaminated.
  - It checkpoints completed (provider, model, track, run, case) records privately and resumes without repeating calls.
  - A 429 pauses the run (exit 3) and is never recorded as a quality failure.
  - `check_providers.py` sends exactly one Groq request and one OpenAI request when confirmed.
- **Status (2026-10-11):** no live call has been made, because the keys are not available to the tooling. Two keys were pasted into `.env.example` and have been removed from the file; **they should be rotated**.
