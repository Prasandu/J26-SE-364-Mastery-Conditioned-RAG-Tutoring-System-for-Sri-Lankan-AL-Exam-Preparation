# Virtual Chemistry Laboratory — Claude Code Instructions

## Project identity

- Product: Mastery-Conditioned RAG Tutoring System for Sri Lankan G.C.E. A/L Chemistry.
- Current component: Intelligent Virtual Chemistry Laboratory only.
- Component owner: L. K. P. Yasith (IT23380196).
- Current milestone: a research-demonstrable, bilingual vertical slice in one week. This is the defined 60% prototype milestone: core engine, one official practical, three modes, bilingual UI, notebook, basic analytics, and grounded assistance—not 60% of all handbook experiments.
- Default languages: English (`en`) and Sinhala (`si`). English source text is canonical until a Sinhala translation is teacher-reviewed.

## Read this first

- Treat the official NIE documents in `research-sources/` as the chemistry source of truth.
- Never invent a chemical, quantity, observation, hazard, procedure, learning outcome, or page citation.
- If sources disagree, use this priority: syllabus for scope/outcomes; practical handbook for the experimental procedure and safety; resource book for theory and calculations. Record any unresolved conflict in `docs/SOURCE_MAP.md`.
- Do not read or paste entire PDFs into context. Extract only the relevant pages/sections listed below.
- Keep this file short and durable. Put changing plans and progress in `docs/STATUS.md`.

## Authoritative source map for milestone M1

Expected normalized files:

- `research-sources/nie-chemistry-practical-handbook-2018.pdf`
- `research-sources/nie-grade-12-chemistry-resource-book-en.pdf`
- `research-sources/nie-al-chemistry-syllabus-2017.pdf`
- `research-sources/component-01-virtual-lab-proposal.pdf`

Relevant locations:

- Handbook PDF pp. 9–10 / printed pp. 1–2: laboratory safety.
- Handbook PDF p. 16 / printed p. 8: use of volumetric flask (funnel transfer, retained washings, complete dissolution before make-up, further mixing, hold by the neck) and burette meniscus/eye-level principle.
- Handbook PDF pp. 29–30 / printed pp. 21–22: Experiment 4, “Preparation of standard solutions.”
- Resource book PDF pp. 123–125 / printed pp. 113–115: Unit 3.7, preparation of solutions and standard solutions.
- Syllabus PDF p. 22 / printed p. 11: competency 3.3, including preparation of a standard Na2CO3 solution.
- Handbook PDF pp. 119–120 / printed pp. 111–112: Experiment 36, reserved for the next milestone; do not build it during M1.

Every extracted knowledge chunk must retain `sourceId`, document title, edition/year, PDF page, printed page, unit, section, language, and checksum.

## M1 experiment: Experiment 4

Build one complete experiment before adding another:

- Title: Preparation of standard solutions.
- Unit: 03 — Chemical Calculations.
- Target: prepare `250 cm3` of `1 mol dm-3` `Na2CO3` solution.
- Required calculation: `n = cV = 1 × 0.250 = 0.25 mol`; `M(Na2CO3) = 106 g mol-1`; required mass = `26.5 g`.
- Equipment: 250 cm3 volumetric flask, beakers, funnel, watch glass, four-beam balance, wash bottle.
- Chemical: solid Na2CO3.
- Experiment-specific precautions: avoid touching chemicals; use clean glassware.
- Canonical procedure: weigh the watch glass; set the balance for watch-glass mass plus 26.5 g; add Na2CO3 until balanced; transfer through the funnel; rinse the watch glass and funnel into the flask; dissolve fully; make up carefully to the 250 cm3 mark; mix; label with solution name, concentration, and preparation date.
- Include the handbook’s three pre-lab questions and three post-lab question groups as authored content references, but do not expose answer keys before submission.

The simulator may simplify graphics, but not the scientific sequence or consequences.

## Product behaviour

Support three experiment modes through the same deterministic engine:

1. `automatic`: narrated demonstration; actions are replayed by the system.
2. `guided`: student acts; scaffolding level is `beginner`, `intermediate`, or `advanced`.
3. `manual`: student chooses actions without procedural prompts; physically impossible actions remain blocked and serious safety issues still produce warnings.

Adaptive scaffolding is rule-based in M1. It may use recent errors, retries, elapsed time, hint count, and measurement quality. Do not claim an ML mastery model exists yet.

## Non-negotiable architecture

- Web: React + TypeScript + Vite.
- Interactive lab: React Three Fiber/Drei using simple programmatic geometry; provide an accessible DOM control/list fallback. Visual fidelity is secondary to correct state.
- Client state: Zustand for UI/session state only.
- Simulation core: framework-independent TypeScript package with pure transition functions.
- API: FastAPI + Pydantic.
- Persistence: Supabase PostgreSQL; use JSONB for experiment definitions/event payloads and pgvector for knowledge chunks.
- Tests: Vitest for TypeScript, React Testing Library, Playwright for one golden path, and Pytest for Python.
- Tooling: pnpm workspace and `uv` for Python. Commit lockfiles.

Preferred layout:

```text
apps/web/                  React UI and 3D workbench
apps/api/                  FastAPI, RAG and persistence adapters
packages/contracts/        Shared generated/validated schemas
packages/simulation-core/  Pure state/action/rule engine
content/experiments/       Versioned experiment definitions
content/locales/           en/si UI and authored content
research-sources/          Private PDFs; excluded from deployment
scripts/ingest/            Page-aware extraction and embedding
supabase/migrations/       Schema, indexes and RLS
docs/                      Source map, decisions, status and evaluation
```

## Simulation rules

- The simulation engine is authoritative. An LLM must never mutate experiment state, calculate scores, choose reaction outcomes, or mark an action correct.
- Use a versioned `ExperimentDefinition` with: identity, source references, outcomes, prerequisites, apparatus, chemicals, safety rules, initial state, stages, allowed actions, transition rules, observation rules, measurement rules, error rules, expected results, assessment rubric, pre-lab, post-lab, and localized text keys.
- Implement `transition(state, action, definition) -> { state, events, feedback }` as a deterministic, side-effect-free function.
- Log every accepted/rejected action in an append-only event stream with sequence number, mode, guidance level, state fingerprint, error code, measurement, hint use, and elapsed time.
- Store quantities with explicit units and central conversion helpers. Never compare unlabelled numeric values.
- Seed any simulated noise so tests and replays are reproducible.
- Model real consequences, including wrong mass, dirty/wrong glassware, incomplete transfer, missed rinsing, undissolved solid, tap water, overshooting the calibration mark, incorrect meniscus/eye level, insufficient mixing, and missing/incorrect labelling.
- Only apply a numerical concentration change when the modeled mass or final volume supports it. Treat dirty glassware/tap water as purity-validity risks and insufficient mixing as a homogeneity/sampling risk unless the state contains evidence for a numerical effect.
- Separate `safety violation`, `technique error`, `measurement error`, and `completion error`; do not collapse them into one score.
- A correct run and every modeled error path need unit tests.

## M1 scoring and analytics

- Compute scores deterministically from event data: safety, technique, measurement accuracy, procedural completeness, and independence.
- Show evidence for deductions; never output an unexplained percentage.
- Store hint count, retries, completion time, action sequence, achieved concentration, absolute/relative error, and completion status.
- Label M1’s overall result as `practical competency estimate`, not a validated mastery score.

## English and Sinhala

- All visible strings must use translation keys; no user-visible text inside simulation logic.
- Use Unicode, `lang="en"` / `lang="si"`, and a Sinhala-capable font such as Noto Sans Sinhala.
- Preserve formulas, symbols, units, subscripts, and chemical names when translation could create ambiguity; a reviewed glossary controls terminology.
- Store `translationStatus: draft | reviewed` plus reviewer/date for authored Sinhala chemistry content.
- Because the supplied sources are English, generated Sinhala content is `draft` until reviewed by a qualified A/L Chemistry teacher.
- Add a locale-completeness test and allow language switching without resetting experiment state.

## RAG and model policy

- Knowledge base: only approved NIE syllabus, practical handbook, resource book, and explicitly approved project material.
- Chunk by section and page, normally 250–450 tokens with small overlap; do not split equations, procedures, tables, or safety lists across chunks.
- M1 embedding baseline: `intfloat/multilingual-e5-small` with the model’s required `query:`/`passage:` prefixes. Store its dimension in configuration and the migration; do not guess it in code.
- Vector store: Supabase pgvector with metadata filtering by source, unit, experiment, section, and language. Add exact title/heading matching before semantic retrieval.
- Create a small English/Sinhala retrieval gold set. Benchmark cross-language recall before claiming Sinhala retrieval quality. Evaluate `BAAI/bge-m3` later only if the lightweight baseline is inadequate.
- Generation: a server-side provider adapter configured through `LAB_LLM_PROVIDER` and `LAB_LLM_MODEL`; never hard-code a temporary model ID. Tests use a fake provider.
- Retrieve at most 8 candidates and send at most 4 compact chunks to the generator. Answer only explicit student questions; static instructions and hints come from the experiment definition.
- Include current safe experiment state, locale, and retrieved evidence in the generation request. Never include secrets or unrelated student records.
- Answers must cite document title and page, distinguish source facts from inference, and say when evidence is insufficient. No evidence means no chemistry answer.
- Cap normal answers at roughly 180 English words or Sinhala equivalent; cache by normalized question, locale, source version, and safe-state fingerprint.

## API boundary for M1

- `GET /health`
- `GET /experiments`
- `GET /experiments/{id}`
- `POST /sessions`
- `POST /sessions/{id}/actions`
- `GET /sessions/{id}`
- `PUT /sessions/{id}/notebook`
- `POST /assistant/ask`
- `GET /sessions/{id}/report`

Validate all requests. The server replays or verifies action events before persistence; never trust a client-calculated score.

## Security and research ethics

- No secrets in code, logs, prompts, screenshots, or commits. Provide `.env.example` only.
- Keep LLM and database service credentials on the server. Apply Supabase Row Level Security to student data.
- Minimize personal data; use pseudonymous IDs in analytics exports.
- Do not deploy source PDFs publicly unless licensing permission is documented.
- AI feedback must be labelled as assistance, not laboratory safety certification or a substitute for supervised practical work.

## Quality gate

Before calling M1 complete:

- Run formatting, lint, type-check, unit/integration tests, production builds, and the Playwright golden path.
- Verify one perfect run plus each required error path.
- Verify both locales, keyboard-only controls, labels, contrast, and state-preserving language switching.
- Verify RAG citations point to the correct source/page and the assistant refuses unsupported questions.
- Update `docs/STATUS.md` with completed acceptance criteria, commands run, known limitations, and the next smallest task.

## Scope control

The remaining 40% begins after M1: more official experiments (starting with Experiment 36), teacher-reviewed Sinhala content, validated mastery/adaptation research, production authentication/deployment, broader retrieval evaluation, and optional WebXR/visual polish.

Not in M1: WebXR/headsets, photorealistic assets, multiplayer, voice, fine-tuning, GraphRAG, autonomous grading by an LLM, all 45 practicals, or Experiment 36 implementation. Prefer a tested vertical slice over additional screens.

## How Claude Code should work

- Inspect before editing; preserve user changes.
- For a large request, plan first and implement in small verified slices.
- Read only files relevant to the current slice; do not repeatedly scan PDFs or the entire repository.
- Reuse schemas and fixtures. Avoid speculative abstractions and unnecessary dependencies.
- After each slice, run the narrowest relevant tests, then update `docs/STATUS.md`.
- Report: files changed, behaviour delivered, tests run/results, scientific assumptions, and remaining blockers. Keep reports concise.
