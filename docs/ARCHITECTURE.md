# Architecture — M1

## Principles

1. **The engine is authoritative.** `packages/simulation-core` owns state, transitions, measurements, errors, scores and the public projection. React renders the projection; the server replays events through the same engine; the LLM (Slice 5) will only explain.
2. **Data, not conditionals.** Experiment 4 is a versioned `ExperimentDefinition` under `content/experiments/`; the engine interprets it.
3. **Works offline.** The default `local` adapter runs the engine in the browser. LLM, embeddings and Postgres are adapters that may be disabled.
4. **Every chemistry fact is traceable** to [SOURCE_MAP.md](SOURCE_MAP.md); values absent from NIE sources are `simulation_assumption` parameters ([DECISIONS.md](DECISIONS.md)).
5. **Disclose deliberately.** Manual mode sees only what a learner could observe until the completed report.

## Components

```text
 apps/web ── React views ── Zustand store ── EngineAdapter ─┬─ local: simulation-core in the browser
                                                            └─ api:   HTTP ──► apps/api (FastAPI)
                                                                               │ routes → SessionService
                                                                               │ repositories (in-memory; Postgres boundary)
                                                                               └ NodeCliVerifier ──stdin/stdout JSON──► node dist/verifier.mjs
                                                                                                                       (simulation-core + contracts)
 packages/contracts: Zod → JSON Schemas (schema/) ─► Python jsonschema validation; shared fixtures (fixtures/) ─► parity tests
 supabase/migrations: experiments, sessions, action_events (append-only), notebooks, reports (RLS, owner = auth.uid())
                      knowledge_versions, knowledge_chunks (vector(384); RLS, no client policies; server-side only)
```

## One action in API mode

1. The UI builds a typed action; the store adds a fresh `clientActionId` and the current `expectedSequence`, and blocks further submissions until a response arrives.
2. `POST /sessions/{id}/actions` validates the body against `api-action-submission.v1.json`. Under a per-session lock the service:
   - returns the stored response for a repeated `clientActionId` with the same payload (409 if the payload differs);
   - rejects a stale `expectedSequence` with 409;
   - stamps elapsed time from the server clock;
   - calls the verifier `apply` with the canonical definition, assessment, `SessionInit` and **all stored events**. The CLI replays and verifies the chain (sequence, fingerprints) before applying the action.
3. The full event is appended atomically with its idempotency key (`commit_action`). The client receives only `{ event, feedback, session }` as public projections.
4. The store updates only from that response. Language changes never touch the session.

`GET /sessions/{id}/report` (only after submission) replays the chain through `report`, checks the head fingerprint and caches the report per head fingerprint.

## Public projection (`projectSession`)

| Field                                                                            | guided / automatic | manual (before and after submission)         |
| -------------------------------------------------------------------------------- | ------------------ | -------------------------------------------- |
| event error codes, resolved errors                                               | yes                | no (`[]`)                                    |
| derived measurements (mass reaching the flask, true final volume, concentration) | yes                | no; balance readings only                    |
| validity (purity risks, volume validity, restart)                                | yes                | `null`                                       |
| liquid level                                                                     | true fraction      | drawn at the mark when judged at the mark    |
| procedural feedback                                                              | yes                | no; rejections, observations and safety only |
| RNG state, seed, fingerprints                                                    | never              | never                                        |

The completed report (`buildReport`) is the only place manual-mode mistakes and calculated results appear. The offline adapter applies the same projection but cannot keep secrets from a determined user, because the full state lives in the tab.

## Engine layout (`packages/simulation-core`)

| File                   | Responsibility                                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| `src/engine.ts`        | `createInitialState`, `transition`: rejection/acceptance, events, feedback |
| `src/preconditions.ts` | Physical preconditions named in the definition's `transitionRules`         |
| `src/actions.ts`       | Per-action effects on a cloned lab state                                   |
| `src/lab.ts`           | Lab helpers, stage derivation, `achievedConcentration`, invariants         |
| `src/procedure.ts`     | Canonical steps (guidance, automatic mode)                                 |
| `src/guidance.ts`      | Profiles, feedback visibility, dry-run prediction, level advice            |
| `src/projection.ts`    | Public session/event projection and disclosure rules                       |
| `src/operations.ts`    | Shared apply/preview/report rules (system actions, preview filter, gating) |
| `src/scoring.ts`       | Evidence-based report (practical competency estimate)                      |
| `src/replay.ts`        | Replay, event-chain verification, automatic runner                         |
| `cli/verifier.ts`      | JSON stdin/stdout protocol for the API (bundled to `dist/verifier.mjs`)    |

## API layout (`apps/api/app`)

| Module                   | Responsibility                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `main.py`                | App factory, routes, correlation IDs, CORS, body-size limit                                                                |
| `service.py`             | Session use cases, idempotency, sequence checks, notebook versions, report cache                                           |
| `verifier.py`            | `NodeCliVerifier`: fixed argv, `shell=False`, timeout, size limits, contract validation                                    |
| `repositories.py`        | Repository protocols + in-memory adapter                                                                                   |
| `contracts.py`           | jsonschema validation against `packages/contracts/schema`                                                                  |
| `principal.py`           | Principal providers (development/test fixed; Supabase JWT placeholder)                                                     |
| `errors.py`              | Single structured error shape                                                                                              |
| `settings.py`            | Configuration and startup safety checks                                                                                    |
| `knowledge/`             | Approved-page extraction (pypdf), normalisation and repairs, chunking, build + manifest                                    |
| `rag/embeddings.py`      | `EmbeddingProvider`: `fake`, `e5_local` (prefixes, 384-d unit vectors, token limit)                                        |
| `rag/repository.py`      | `KnowledgeRepository`: in-memory and Postgres/pgvector (exact cosine, active version)                                      |
| `rag/retrieval.py`       | Heading match → exact cosine → merge; ≤ 8 candidates, ≤ 4 evidence chunks                                                  |
| `rag/generation.py`      | `GenerationProvider` (`disabled`, `fake`, `openai`), prompt, strict claims schema, grounding validation, cache             |
| `rag/groq_provider.py`   | GroqCloud adapter (OpenAI SDK at api.groq.com, Chat Completions strict JSON schema, no tools/streaming)                    |
| `rag/failover.py`        | Failover router: ordered providers, technical-failure-only fallback, circuit breaker, daily paid-fallback limit, deadlines |
| `rag/provider_errors.py` | Maps SDK errors to typed, safe failure kinds (Retry-After kept; provider bodies dropped)                                   |
| `rag/openai_provider.py` | OpenAI Responses API adapter: strict JSON schema, no tools, `store=False`, safe error mapping                              |
| `rag/generation_eval.py` | Two-track (oracle / end-to-end) generation metrics and critical gates                                                      |
| `rag/assistant.py`       | `POST /assistant/ask` use case: safe state, refusals, citations projection                                                 |
| `rag/evaluation.py`      | Gold-set loading and Recall@k / MRR@8                                                                                      |

## Grounded assistant (Slices 5–6b)

```text
 build (offline, scripts/ingest/build_knowledge.py)
   approved-pages.v1.json + sources.v1.json checksums ─► pypdf (approved pages only) ─► normalise + reviewed repairs
   ─► section-aware chunks (≤ 512 tokens incl. "passage: ") ─► E5 passage embeddings
   ─► data/knowledge/<version>/chunks.jsonl (private, gitignored)  +  content/knowledge/manifest.v1.json (metadata only)

 request  POST /assistant/ask {sessionId, question, locale}
   owner check ─► safe state (experiment, mode, completed) ─► injection screen ─► cache lookup
   ─► E5 "query: " embedding ─► heading match + exact cosine (in-scope only) ─► ≤ 4 evidence chunks
   ─► GenerationProvider: disabled | fake | openai (single turn, no tools, untrusted data as one JSON object;
        session = {experimentId, mode, submitted} only) ─► {decision, answer, claims[citedChunkIds, supportingSpans]}
   ─► validation (strict schema; citations ⊆ supplied chunks; spans verbatim in cited chunk; numbers, formulae and
        chemical entities in cited text; notation preserved; language; ≤ 180 words) ─► grounded | refused
   ─► response: answer, safe citations (title, year, PDF/printed page, section), aiAssistanceLabel (si), sequence, fingerprint, cached
```

The client never supplies state, chunks, source IDs, prompts, provider or model names. Chunk text
never leaves the server except inside a validated answer. The provider is `disabled` by default;
`openai` or `groq` may be selected alone, or `failover` (Groq qwen/qwen3.8-27b first, OpenAI
gpt-6.1-sol as paid technical fallback). Failover happens only on 429, connection, timeout,
5xx or unavailable-model failures; a validated answer or any refusal, schema or grounding failure
is final. Circuit and fallback budget are process-local (no database; shared state would be
needed for several processes). Logs carry metadata only (no question, answer or
evidence). The assistant is advisory and never grades (D28).
