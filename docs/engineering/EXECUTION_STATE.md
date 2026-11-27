# Execution state

Resumable checkpoint (V2 prompt §A5/B2). Read this, then `git status`, before continuing.

| | |
|---|---|
| Repository root | `<local clone parent>\J26-SE-364-…` (verified with `git rev-parse --show-toplevel`; never `%USERPROFILE%`) |
| Branch / base | `all-features` @ `e186ecf`, dirty (all work uncommitted; nothing staged) |
| Stash | `stash@{0}` (lab, GitHub Desktop) intact - do not apply wholesale |
| Gate | **G0: `M0_LOCAL_VERIFIED` with exceptions** (all suites executed; see §G0 below); `M0_REMOTE_BLOCKED`; M1 in progress: DAT-010 producer + consumer done locally (S9, S10) |
| Remote | Supabase `oepkg…` unreachable (`M0_REMOTE_BLOCKED`) - every result below is local |
| Updated | 2026-11-27 06:25 +05:30 |

## Running processes

None. The C2/C3 installs recorded earlier finished (S8). Test containers are named
`j26-dat010-pg` / `j26-shared-db-smoke-*`, bound to 127.0.0.1, and removed after use.

## Slices this session

### S1 - M0: RLS role matrix for 0023 - DONE (local)

- Change: `scripts/db/shared_db_smoke.py` applies Supabase-like grants (`anon`, `authenticated`
  get SELECT/INSERT/UPDATE/DELETE on `public`), seeds one `users` row as owner, then checks.
- Command: `python -I scripts/db/shared_db_smoke.py` → exit 0, **43/43 PASS**: `anon` and
  `authenticated` read 0 rows from users, attempts, answers, answer_images, point_results,
  point_reviews, topic_edges, alembic_version; inserts refused with a row-level-security error;
  owner still reads its row; container removed.
- Limit: local approximation; the live project's grants/PostgREST exposure are not verified.

### S2 - G1: SEC-PAPERS-IDOR - CODE DONE, route tests PENDING full C2 env

- Invariant: a student-facing route returns a paper only if it is published **and** either
  shared (`created_by IS NULL`) or created by the signed-in student; otherwise the same
  `404 Paper not found` as a missing id, and PDF bytes are never read.
- Three paths fixed, one lookup: `app/services/papers.py` `get_visible_paper`, used by
  `GET /papers/{id}`, `GET /papers/{id}/file` (visibility before `store.load`) and
  `POST /attempts` (`app/services/attempts.py`, which returned the full question tree).
  Staff routes keep the unscoped `get_paper`.
- Callers: `frontend/src/api/papers.ts` (`getPaper`, `getPaperFile`) and `startAttempt` already
  send the Supabase token (`request`/`requestBlob`) - no frontend change needed.
- Tests: `assessment-service/tests/test_paper_access.py` - lookup matrix (shared/own/other/
  anonymous/draft/missing, identical 404 text), source guard that student routes use
  `get_visible_paper`, and HTTP tests (anonymous + other student → 404 with identical body for
  detail, PDF and missing id, `store.loads == []`; owner gets detail + PDF; anonymous sees shared;
  other student's `POST /attempts` → 404).
- Run status `[TESTED]` (full C2 env, 22:45): first run exposed a fixture bug in the new route
  tests (detached `User` rows); fixed with `expire_on_commit=False`. Now **15/15**. Before/after:
  the same file against the HEAD papers/attempts code → **7 failed** (anonymous and other
  student read the private paper and PDF, existence distinguishable, attempt start allowed);
  files restored from a backup (hash-verified). `ruff check` + `ruff format --check`: clean.

### S3 - G1: SEC-007a/b/c support-service routes - CODE DONE, backend tests PENDING C4 env

- `/tutor/ask`, `/voice/transcribe`, `/voice/synthesize`: `dependencies=[Depends(get_current_user_id)]`
  (resolved before the handler, so no provider call for anonymous requests).
- `/tutor/ask-raw`: `require_raw_tutor_enabled` → 404 unless `ENABLE_RAW_TUTOR=true`; also requires
  sign-in; `Settings` raise if enabled with `ENVIRONMENT=production`.
- `POST /practice/flagged-questions`: `require_integration_caller` (`X-Integration-Key` =
  `INTEGRATION_KEY_COMPONENT2`, ≥16 chars, 503 if unset); end-user tokens no longer accepted.
- Frontend callers changed in the same slice: `frontend/src/features/tutor/services/tutorApi.ts`,
  `voiceApi.ts`, and standalone `chemistry-tutor/frontend/src/services/tutorApi.ts`, `voiceApi.ts`
  → `authFetch`.
- Tests: `chemistry-tutor/support-service/tests/test_route_auth.py` (no/garbage/wrong-scheme
  token → 401 with zero provider calls, signed-in → 200; raw tutor 404 by default, 200 only when
  enabled + signed in, 401 anonymous, production settings refused; ingest 503 unconfigured,
  401 for no key / wrong key / user token only, 200 with key; inventory: every `/api/v1` route
  except health and the public question bank requires a user or a service). Updated
  `tests/test_tutor_ask_raw.py` to enable the dev flag explicitly.
- Run status: backend `[NOT YET RUN]` (C4 env needs torch via `sentence-transformers`).
  Frontend `[TESTED]`: `cd frontend; npx vitest run` → **90/90** (86 + new
  `tests/tutorAuth.test.ts` 4: Authorization header on ask/transcribe/synthesize, 401 surfaced);
  `npx tsc -b` exit 0; `npx eslint .` 0 errors / 11 warnings (unchanged). Standalone
  `chemistry-tutor/frontend` not built (no `node_modules`) `[NOT VERIFIED]`.
- `ruff check` + `ruff format --check` on changed support files: clean.
- Not yet: per-principal quota/cost caps (R40), audio duration limits beyond the existing 15 MB.

### S4 - G1: R06 production guards - DONE

- `planning-service/app/config.py`: new `environment` setting; `Settings` raise if
  `DEMO_MODE=true` with `ENVIRONMENT=production` (`.env.example` documents it).
  Test `planning-service/tests/test_production_guards.py`:
  `uv run --no-project --python 3.13 --with pydantic-settings --with pytest python -m pytest -q --noconftest tests/test_production_guards.py`
  → **4 passed**.
- Support: config guards moved to `chemistry-tutor/support-service/tests/test_config_guards.py`
  (raw tutor refused in production; off by default; short integration key refused): same
  command form → **3 passed**.
- Planner route inventory (static): every student route takes the student from the token
  (`StudentId = Annotated[str, Depends(get_student_id)]`); `/predictions/{student_id}`
  404s unless it equals the token's id; event push routes share one `INGEST_API_KEY` (SEC-008).

### S5 - G3: GRD-011 no generative official marks - CODE DONE, tests PENDING full C2 env

- `assessment-service/app/services/marking.py`: `_apply_verdict` (text) and
  `_apply_drawing_verdict` (drawings) always end in `needs_review`, `awarded = 0`, with the
  model's view kept as a labelled suggestion (`ai_awarded`, confidence, evidence,
  `AI_SUGGESTION_PREFIX` reason). Checker-decided points keep the checker's decision; AI
  disagreement only sends them to a teacher. The only remaining writers of
  awarded/not_awarded are `_judge_mcq` (rule), `_finalize_from_checker` (checker) and
  `review.record_decision` (teacher).
- `app/services/mastery.py`: `decided_points` counts only `TRUSTED_METHODS` (rule, checker,
  teacher), so historical `method = llm` decisions no longer reach mastery or `/integration`.
- Docstrings of `POST /attempts/{id}/submit` and `POST /admin/attempts/{id}/judge` corrected.
- Tests `tests/test_no_generative_marks.py`: R24 fake judge 100% sure → `needs_review`,
  every text-verdict shape, confident drawing verdicts, checker-agree / checker-disagree,
  and SQLite check that llm-decided rows are excluded from `decided_points`.
  `[TESTED]` **10/10** in the full C2 run (R24 fake judge 100% sure → `needs_review`).
- **Needs operator decision:** historical attempts already scored by the AI keep those
  points in `attempts.score`; a data migration (llm-decided → `needs_review`, recompute
  scores, keep `ai_awarded`) would change live marks, so it is not written to run.
- Admin research export (`app/services/export.py:224`) still counts all methods - staff-only.

### S6 - G1/G5: LAB-018 lab Supabase sign-in (backend) - DONE, browser side TODO

- `apps/api/app/principal.py`: `SupabaseJwtPrincipalProvider` now verifies the Bearer token
  (ES256/RS256 via JWKS, audience, expiry, `sub` required and a UUID) and returns
  `Principal(sub)`; 401 `unauthenticated` for missing/invalid tokens; 503 `auth_not_configured`
  if JWKS is unreachable or unset. Owner never taken from bodies/headers.
- `app/settings.py`: `LAB_SUPABASE_URL`, `LAB_SUPABASE_JWKS_URL`, `LAB_SUPABASE_JWT_AUDIENCE`,
  `jwks_url` property; startup refuses `supabase_jwt` without a JWKS source (production
  already refused any other provider). `app/main.py`: wires the URL; CORS now allows
  `Authorization` (without it a browser could never send the token).
- Contract: new error code `unauthenticated` in `packages/contracts/src/api.ts`;
  `api-error.v1.json` regenerated with `npx vitest run --config vitest.write-schemas.config.ts`
  (only that file changed, LF). Contracts: `npx vitest run` → **95/95**.
- Dependency: `pyjwt[crypto]>=2.10` added with `uv add --no-sync`, installed with
  `uv sync --inexact --offline` (adds cffi, cryptography, pycparser, pyjwt; lock diff is
  additions only; torch from the `rag` group untouched). Originals backed up in the session
  scratchpad.
- Tests `apps/api/tests/test_supabase_principal.py` **11 passed**: start/read own session;
  missing, garbage, expired, wrong-audience, forged-signature, non-UUID `sub` → 401
  `unauthenticated`; student B cannot read A's session or report (404); startup refusal; CORS
  preflight allows `authorization`.
- Regression: `cd apps/api; GROQ_API_KEY= OPENAI_API_KEY= LAB_LLM_PROVIDER=disabled
  LAB_EMBEDDING_PROVIDER=disabled LAB_ADMIN_EXTRACTION_ASSIST=disabled HF_HUB_OFFLINE=1 uv run
  --no-sync pytest -q` → **396 passed** (385 + 11); `ruff check .`, `ruff format --check`,
  `mypy app`: clean.
- Not done: `apps/web` has no Supabase client, so `LAB_PRINCIPAL_PROVIDER` stays `development`
  locally until the lab web app sends the shared token (next lab slice); persisted Postgres
  sessions (`LAB_REPOSITORY=postgres`) still not implemented.

### S7 - G2: DAT-009 canonical topic registry (mechanism) - DONE, mappings BLOCKED on review

- `shared/contracts/topic-registry.v1.json`: canonical ids = `shared/contracts/topics.json`
  (195 ids, 14 units); `aliases: []` - assessment's codes come from its git-ignored syllabus
  import, and no alias may be written without a Chemistry reviewer.
- `planning-service/app/services/topic_registry.py`: `load_registry()` / `resolve(source, code)`
  → `Resolved(topic_id)` only for an approved alias; otherwise `Quarantined(reason)`. Exact
  match only; load fails closed on unknown topic ids, double mappings, bad status/source,
  approval without reviewer/date. Default path also resolves to `/shared/contracts` in the
  planner container (as mounted by `infra/docker-compose.yml`).
- Tests `planning-service/tests/test_topic_registry.py`:
  `uv run --no-project --python 3.13 --with pydantic-settings --with pytest python -m pytest -q --noconftest tests/test_topic_registry.py`
  → **17 passed** (near misses `u03_5`, `U03_5 `, `U03`, names → quarantined; other source not
  borrowed; inconsistent registries refused; shipped registry loads).
- Blocked: real aliases need the assessment topic list (export from its DB) + reviewer sign-off.
  Not yet wired into event ingestion (DAT-010).

### S8 - G0: C2 and C3 full suites - DONE

- C2 (`assessment-service`, full available suite, torch-free requirements): first run 42/45 (3
  fixture bugs in new route tests), fixed → **45/45**; with S9 → **50/50**.
- C3 (`planning-service`, `requirements-dev.txt`, Python 3.12): **336/336** (incl. 21 new).
- C4 (`chemistry-tutor/support-service`): `requirements.txt` is **unsatisfiable** as committed -
  `google-genai==2.32.0` needs `pydantic>=2.12.5` and `httpx>=0.28.1`, but the file pins
  `pydantic==2.9.2` and `httpx==0.27.2` (introduced with google-genai in `0800141`). Candidate
  fix resolved (`pydantic` 2.14.4, `httpx` 0.29.0) and applied to `requirements.txt` after the suite
  passed with it: disposable migrated + seeded Postgres → **109 passed / 6 blocked** (licensed PDF
  missing; `BAAI/bge-m3` not cached - deliberately not downloaded). Unseeded it is 72/43, i.e. the
  suite depends on `scripts/seed_*.py` data - should become a fixture (QA-004).

### G0 exceptions (documented, not passes)

| Item | Status |
|---|---|
| Live Supabase (auth, RLS, PostgREST grants) | `[BLOCKED]` project unreachable |
| C2 original test suite | missing from git (owner) - 50 new tests only |
| C4 RAG/consultation (6 tests) | `[BLOCKED]` licensed PDF + embedding model |
| Standalone `chemistry-tutor/frontend` build | `[NOT VERIFIED]` no `node_modules` |
| CI matrix (QA-004) | not started |

### S9 - G2: DAT-010 finalized-mark producer feed - DONE (producer)

- `GET /integration/events` (see `INTEGRATION_CONTRACTS.md`): trusted, finalized, shared-paper,
  linked-student decisions only; stable UUIDv5 event ids; teacher correction = next
  `source_version`; datetimes normalised to UTC (SQLite returned naive values).
- Tests `assessment-service/tests/test_integration_events.py` **5 passed**: exactly the
  rule/checker/teacher points of the linked student (LLM, needs-review, unlinked account and
  practice paper excluded), stable ids, correction → new version and id, `since` filter, route
  401 without / with wrong key / with a user token.
- Consumer (planner): done in S10.

### S10 - M1/G2: DAT-010 finalized-mark consumer (planner) - DONE (local) `[TESTED]`

**Producer refinements (assessment)**

- Keyset paging: `after` cursor, `next_cursor`, `has_more`, ordered by (final-decision time, point id).
- `assessed_at` (attempt submitted, else marked) for recency.
- The shared JSON Schema `shared/contracts/assessment-criterion-finalized.v1.json`, which publishes the id namespace.

**Consumer (planner)**

- `app/schemas/finalized_marks.py`: the v1 model.
  - Refuses any major version other than 1.
  - Refuses an `event_id` not derived from `source_entity_id#source_version`, and a non-UUID subject.
  - Refuses `awarded > maximum` and naive timestamps.
  - Ignores additive fields.
- `app/models/integration.py` and migration `0010_assessment_decisions`:
  - `assessment_decisions` ledger, status `applied | superseded | stale | quarantined | legacy_unverified`. A partial unique index allows only one applied version per point.
  - `integration_rejections`, deduplicated by fingerprint.
  - `integration_cursors`.
- `app/services/finalized_marks.py`:
  - Duplicate → no-op.
  - Same id with different content → rejected.
  - A point that already belongs to another student → rejected.
  - Newer version → retracts the old version's `TopicEvidence` (ledger row and `RawEvent` kept for audit). Older version arriving late → `stale`.
  - Non-trusted evidence class → `legacy_unverified`.
  - Unmapped or unapproved code → the whole event is quarantined. `release_quarantined` applies it after a reviewer approves the alias.
  - Mastery is recomputed once per touched student/topic. A topic left with no evidence loses its stale state row.
- Re-planning: predicted plans whose topic mastery moved by ≥ `FINALIZED_MARK_REPLAN_EPSILON` (0.05) get `rolling.pending_assessment_evidence`.
  - `checkpoint_status` then reports `new_evidence`, keeping the existing 3-day throttle.
  - `run_checkpoint` clears the flag and logs `assessment_topics`.
  - Manual plans are never flagged and keep the student's priorities.
- `app/adapters/assessment_feed.py`:
  - Sends `X-Integration-Key` only. Fails closed without a URL or key.
  - Timeouts: 10 s, connect 3 s. 3 attempts with backoff of 0.5 s then 1 s; `Retry-After` capped at 30 s. 401/403 are not retried. Redirects are not followed.
  - One transaction per page together with the cursor, under a Postgres advisory lock. Each run re-reads a 15-minute overlap.
  - Errors are recorded on the cursor without SQL parameters or keys.
- Routes and script:
  - Service-only routes `POST /api/v1/integration/assessment/pull`, `GET …/quarantine` and `POST …/quarantine/release`, all requiring `X-API-Key` = `INGEST_API_KEY`.
  - `python -m scripts.pull_assessment_marks [--release|--quarantine]`.

**Also fixed**

- `PlanInput` judged "exam date in the future" by the UTC date. Between 00:00 and 05:30 in Sri Lanka an exam on the same day was accepted, and `test_plans.py::…[future]` failed at 04:58 +05:30. It now uses the plan's own timezone.
- Before/after: the HEAD validator fails the new regression test for Colombo and Kiritimati; the fix passes for all 3 zones.

**Legacy AI marks**

- `assessment-service/app/services/legacy_ai_marks.py` + `python -m app.report_legacy_ai_marks`: a read-only, pseudonymous report.
- Plan with options A/B/C, operator-gated: `docs/engineering/LEGACY_AI_MARKS_RECONCILIATION.md`.

**Commands and results** (disposable `pgvector/pgvector:pg16` `j26-dat010-pg`, 127.0.0.1 only):

| Command | Exit | Result |
|---|---|---|
| `cd planning-service; uv run --no-project --python 3.12 --with-requirements requirements-dev.txt python -m pytest -q` | 0 | **377 passed, 20 skipped** (the DB tests skip without a disposable DB) |
| same with `PLANNING_TEST_PG_URL=postgresql+psycopg://test:***@127.0.0.1:<port>/planning_test` | 0 | **397 passed**: 336 baseline + 38 `test_finalized_marks_contract.py` + 20 `test_finalized_marks_db.py` + 3 timezone regression |
| `cd assessment-service; uv run --no-project --python 3.13 --with-requirements <C2 reqs minus sentence-transformers> python -m pytest -q tests` | 0 | **54 passed, 7 skipped** |
| same with `ASSESSMENT_TEST_PG_URL=…/assessment_test` | 0 | **61 passed** (producer tests run on SQLite and Postgres; Postgres caught a fixture gap - missing `marking_schemes` rows, which SQLite's unenforced FK hid) |
| `python scripts/db/shared_db_smoke.py` | 0 | **48/48 PASS** (+5: planning 0010 down/up, ledger tables present, `anon`/`authenticated` denied on `planning.assessment_decisions`) |
| `ruff check` / `ruff format` on changed files (both services) | 0 | clean |

**Mutation check:** each safeguard was removed in turn, and the matching tests failed (counts are failed tests):

| Safeguard removed | Failed |
|---|---|
| stale guard | 2 |
| retraction | 3 |
| subject check | 1 |
| trusted-class check | 3 |
| conflict check | 1 |
| plan flag | 1 |
| quarantine | 1 |

The file was restored and its hash verified.

**Not verified**

- Live Supabase and the real assessment topic codes. The registry still has 0 approved aliases, so in a real deployment every event is quarantined until the C2 and C3 owners approve mappings.
- No scheduler is configured. Cron or the operator must call the script or route.

### S11 - M1/G1: SEC-005c C2 route inventory + SEC-006 C3 cross-student - DONE (local) `[TESTED]`

**C2 route inventory**

`assessment-service/tests/test_route_guards.py` (7) walks the running app's dependency graph. It covers lazily included routers, router-level guards and `require_role` tiers read from the closure. It asserts:

- Every route has a guard, or is in a 6-entry `PUBLIC` allowlist with a reason: health, login, register, topic catalogue, rate table, paper-shape calculator. The allowlist has no stale entries.
- Optional identity is used only on the 3 paper routes with a visibility check.
- `/admin/*` and the role change need an admin.
- `/review/*` needs a teacher.
- `/integration/*` needs a component key and nothing else.
- `/attempts` routes are student-scoped, and the per-attempt ones check the owner.

Before/after: with HEAD `api/papers.py` and `api/attempts.py`, **3 failed**, which reproduces the original IDOR. The current code passes. Files were restored and hashes verified.

**C3 cross-student**

`planning-service/tests/test_cross_student_db.py` (7) runs over HTTP with real HS256-signed tokens (JWKS disabled in the test) on the disposable Postgres:

- Bob gets **404** on all 16 of Alice's plan, task, timer, notification and prediction routes, and Alice's plans, tasks and notifications are byte-identical afterwards.
- Lists and topic history show only the caller's own data.
- The owner still succeeds.
- A missing, garbage, wrong-secret or expired token → 401.

Mutation check: removing the ownership condition in `plans._owned_plan`, `timer` or `notifications` fails the test each time. Files were restored and hashes verified.

**Other changes**

- Shared Postgres fixtures `pg_engine` / `pg_session` moved to `tests/conftest.py`. They truncate real tables only, because `planning.attempts` is a view.

**Results**

| Suite | Result |
|---|---|
| C2 with Postgres | **68 passed** |
| C3 default | **377 passed, 27 skipped** |
| C3 with Postgres | **404 passed** |
| ruff | clean |

The container was removed.

**Product decision recorded, not changed:** any teacher can review any student's attempt (there is no class or roster model). Scoping review to a teacher's own students needs a roster, which is the C2 owner's and operator's call.

The audit report (`J26-SE-364_Final_Code_Audit_…pdf`) is mapped item by item in `AUDIT_REPORT_TRACEABILITY.md`.

### S12 - PL-008 / PL-009: manual syllabus coverage + evidence-source labels - DONE (local) `[TESTED]`

**Backend**

- `PlanInput.coverage` (manual plans only): `topic_id`, `covered_percent` 0-100 and an optional `need`.
  - Rejected with 422: duplicates, a topic outside `topics`, coverage on a predicted plan, a parent and its sub-topic in contradiction.
- Stored in `constraints.coverage` with `source: "self_reported"` and `updated_at`. Never TopicEvidence or mastery.
- Priority = the student's priority × (0.25 + 0.75 × remaining coverage), `COVERAGE_PRIORITY_FLOOR`.
- While a topic has no results, the coverage and need choose its activity (`priority.coverage_activity`).
- Every task's `reason_details` carries `evidence_source` (results / self_reported_coverage / student_choice / no_evidence) plus the coverage values.

**Frontend**

- The Manual setup has a coverage % and "what you need" per selected topic, labelled as an estimate that is never shown as mastery.
- The "why now" text says "self-reported, not a mark".

**Docs:** `docs/api-contracts/planning-service.md`.

**Tests**

- `planning-service/tests/test_coverage_planning.py`: 17 tests (schema, priority, activity, reason).
- `tests/test_coverage_planning_db.py`: 3 tests, Postgres.
  - A plan from coverage with no marks creates 0 evidence and 0 mastery rows.
  - Contradiction → 422.
  - Once finalized marks arrive the source becomes `results` and the coverage stays visible.
- Frontend: 3 setup tests and 1 why-now test.

### S13 - TUT-014: verified teaching-action contract + whiteboard (Mode B) - DONE (local) `[TESTED]`

**`chemistry-tutor/support-service/app/services/teaching/actions.py`** validates `TeachingResponse`:

- The schema is strict, and visual actions come from a finite vocabulary. Unknown ones are dropped, never executed. Actions must point at real steps and terms.
- Every step is recomputed by an AST arithmetic evaluator: numbers, `+ - * / **` and earlier variables only. Exponents are capped, and division by zero is refused.
- The displayed number must be the correct rounding.
- Units: an algebra over A/L units for the formula's quantities, and an exact-factor table for unit conversions.
- Citations must be retrieved sources. URLs, markup and script in any text are refused.
- A wrong number, an invented citation or unsafe text rejects the whole response, so the student gets a plain notice.

**`worked_examples.py`** builds the deterministic concentration example: the Exp. 4 numbers give 0.250 dm3, 0.250 mol and 1.00 mol dm-3, all verified. It has English narration only; Sinhala needs reviewed wording.

**Route:** `POST /api/v1/teaching/worked-examples/solution-concentration` (auth).

**Frontend:** `Whiteboard` renders only verified steps, one at a time or all, and shows nothing for a rejected response. The `/tutor/worked-example` page and a nav tab "Worked steps" were added.

**Tests**

- `tests/test_teaching_actions.py`: 34.
- `frontend/tests/Whiteboard.test.tsx`: 3.

### S14 - QA-004: CI workflow + gate rerun - WRITTEN `[NOT VERIFIED]` on GitHub

`.github/workflows/ci.yml` has 6 jobs (lab, frontend, assessment, planning, support, shared-database).

- Every provider key is blank and models are offline.
- Each database job uses its own Postgres service.
- The 6 asset-blocked C4 tests are deselected by exact id; they were re-confirmed this session as the only failures.
- The YAML parses. Each step mirrors a command that passed locally. Full-tree `ruff check` is clean for C2 and C3.
- It has not run on GitHub, because no push is authorized.

**Gate rerun this session** (disposable Postgres, removed afterwards):

| Suite | Result |
|---|---|
| Planner | **425 passed** with Postgres |
| Support | **143 passed, 6 failed** (the same 6 asset-blocked tests: `test_rag_extraction`, `test_retrieval`, 4 in `test_consultation`) |
| Frontend | **96/96**; eslint 0 errors (11 pre-existing warnings); `tsc -b` clean; `npm run build` OK |

### S15 - operator approvals (2026-11-27) and legacy AI-marks policy - DONE

**Committed and pushed** `all-features`: `e186ecf..d78b302` (7 commits), then `cbc25da` (CI fix).

**Before committing:**

- Full-tree secret scan. It found a **real Supabase pooler `DATABASE_URL` with password committed in `chemistry-tutor/support-service/.env.example` since `b8abed0`**. It is replaced by a placeholder at the tip; it **still has to be rotated** and remains in history.
- Removed personal local paths from the docs.

**CI on GitHub:**

- Run 1 (`d78b302`): 5/6 jobs passed. The support job failed: with the PyTorch CPU index first, uv saw only `requests` 2.28.1 there.
- Fixed with `UV_INDEX_STRATEGY=unsafe-best-match` (both indexes trusted).
- Run 2 (`cbc25da`): **all 6 jobs passed** - `[TESTED]` on GitHub.

**Refs:** `refs/agents/*` deleted (17 refs, none contained in any branch).

**Blocked:** deleting `%USERPROFILE%\.git` (0 commits, 0 refs, an index of 8,911 staged profile files, ~575 MB of blobs) was blocked by the tool's safety layer. The operator should run it.

**Decisions:**

- Lab stash: kept.
- Class rosters: approved; next slice.
- Legacy AI marks: first version (confidence <= 0.5 → review, else kept and labelled) **superseded by the operator's correction in S17**: every AI-only decision goes to review.

**Legacy AI-marks policy as built:** `app/services/legacy_ai_policy.py`, CLI `app/reconcile_legacy_ai_marks.py`, migration 0024 `legacy_ai_reclassifications` (RLS), `AttemptOut` labels and the frontend `AttemptNotices`.

**Results:**

| Suite | Result |
|---|---|
| C2 with Postgres | **81 passed** |
| Shared-DB smoke | **50/50** (0024 down/up, RLS, anon/authenticated denied on the new table) |
| Frontend | **99/99**, tsc clean |

Not applied to real data (Supabase is unreachable).

### S16 - class rosters for teacher review (operator decision 2026-11-27) - DONE (local) `[TESTED]`

**Backend**

- Migration 0025: `classes`, `class_teachers`, `class_students`, all with RLS.
- `app/services/classes.py`: a `ReviewScope` scopes every `/review` route (queue, scripts, attempt points, images, history, decision, agreement). A teacher sees only students in an active class they teach; an admin sees all. Out-of-scope ids → 404.
- `POST /review/points/{id}` records the signed-in account as `teacher_ref`. Before, it came from the request body, so any teacher could sign as another.
- Admin API `/admin/classes` (list, create, set teachers or students with role checks, archive).

**Frontend:** admin page `Classes`.

**Tests**

- `tests/test_class_rosters.py`: 12 (SQLite and Postgres).
- Mutation check: disabling the scope → 4 failed; the file was restored and its hash verified.
- `frontend/tests/ClassesPage.test.tsx`: 3.

**Results**

| Suite | Result |
|---|---|
| C2 with Postgres | **93 passed** |
| Frontend | **102/102**, tsc clean |
| Shared-DB smoke | **56/56** |

**Rollout note:** after migrating, an admin must create classes before teachers see any scripts.

### S17 - legacy AI-marks policy corrected (operator, 2026-11-27) - DONE (local) `[TESTED]`

- No AI-only decision is an official mark at any confidence. Every one goes to teacher review, and confidence only sets `review_priority` (migration 0026).
- Original results are kept in the audit row and on the point.
- Attempts still counting an AI-only mark are reported provisional even before a run.
- Results: C2 **97 passed** (Postgres); smoke **56/56**; frontend **102/102**. Pushed `7578873`.
- Not run on real data.

### S18 - C4 authorization hardening + SEC-008 service keys - DONE (local) `[TESTED]`

**C4**

- Rate limits are keyed by the signed-in user (`principal_key`), not by the shared IP.
- Daily caps on every paid-provider route: tutor 200/day, voice 100/day, consultation/report 50/day.
- Another student's flagged question → **404**, not 403 (the ids are sequential).
- Tests: `tests/test_quotas_and_ownership.py`. Teaching, route-auth and quota tests: **65 passed**.

**C3 (SEC-008)**

- Per-component keys `INTEGRATION_KEY_COMPONENT1/2/4` on `X-Integration-Key` for `/api/v1/events/*`. The operator `INGEST_API_KEY` is still accepted, also on the old `X-API-Key` for one release.
- Operator routes reject component keys. Short keys are refused at startup.
- Tests: `tests/test_service_auth.py`. The events test fixture now overrides the guard the router actually uses.
- The matrix is in `INTEGRATION_CONTRACTS.md`.

### S19 - deployment-managed C2 → C3 synchronisation - DONE (local) `[TESTED]`; not deployed

- Worker: `app/services/feed_worker.py`, run as `python -m scripts.pull_assessment_marks --loop`.
  - Postgres session advisory lock: one run at a time across replicas.
  - Interval with jitter; capped exponential backoff.
  - Stops on SIGTERM. JSON logs carry counts and error types only.
- `GET /api/v1/integration/assessment/status` (operator) for monitoring.
- Examples in `deploy/assessment-feed/`: Compose worker, Kubernetes Deployment/CronJob, systemd timer.
- Tests:
  - `tests/test_feed_worker.py`: backoff, no secrets in logs, prompt stop.
  - `tests/test_feed_worker_db.py`: lock contention, lock released after a failure, status route and its auth.
- Planner: **446 passed** with Postgres.

### S20 - live Supabase verification prepared (nothing run against the cloud) - DONE (local) `[TESTED]` locally

- `scripts/db/verify_live_database.py` is a read-only verifier.
  - It uses a `default_transaction_read_only` session and takes the URL from an env var it never prints.
  - It derives the expected Alembic heads from the repository.
  - Checks: RLS on every public table, anon/authenticated denied on the `planning`/`support` schemas, pgvector, roster readiness and pending AI-only marks (as counts).
- The shared-DB smoke runs it on a freshly migrated database and checks that it fails when RLS is turned off on a table: smoke **59/59**.
- `docs/engineering/SUPABASE_GO_LIVE.md` is the ordered runbook:
  1. rotate credentials;
  2. back up;
  3. read-only baseline;
  4. review `alembic upgrade head --sql`;
  5. apply (approval);
  6. verify;
  7. app configuration;
  8. roster onboarding;
  9. legacy-marks dry run;
  10. end-to-end check.
- `[BLOCKED]` on the operator restoring the project.

### S21 - SEC-004/LAB-018: durable lab sessions in PostgreSQL - DONE (local) `[TESTED]`

**`apps/api/app/repositories_pg.py`** implements the lab's repository protocols on the existing `supabase/migrations` tables:

- Ownership is part of every lookup.
- `commit_action` is one transaction: row lock, next sequence, unique client id, then advance the head.
- Append-only events, enforced by the triggers.
- Notebooks use optimistic versions.
- The report cache is keyed per version and never overwritten.
- Each loaded experiment version is mirrored into `public.experiments`.

**Startup rules** (the `LAB_REPOSITORY=postgres` setting previously refused "not implemented in M1"):

- `LAB_REPOSITORY=postgres` needs `LAB_DATABASE_URL` and `LAB_PRINCIPAL_PROVIDER=supabase_jwt`.
- **Production now refuses in-memory sessions.**

**Tests**

- `tests/test_repositories_pg.py`, 8 on a fresh database migrated with the real lab SQL: owner isolation, non-uuid owners, sequence/idempotency conflicts, append-only trigger, 4 concurrent commits → exactly one wins, notebook versions, report cache, **survives a restart**.
- `tests/test_repository_settings.py`, 4.

**Results**

| Check | Result |
|---|---|
| Lab API full suite | **404 passed** (before the settings tests) |
| Targeted tests | 8 + 4 passed |
| `mypy app tests` | clean |
| ruff | clean |

The CI lab job gained a Postgres service, so these tests run in CI.

**Still open for LAB-018:** the lab web app sending the shared Supabase token (browser side).

### S22 - LAB-018 browser side: lab sign-in, token handling, session restore - DONE (local) `[TESTED]`

**Sign-in.** `apps/web/src/auth/labAuth.ts` signs in with the platform's Supabase project (`@supabase/supabase-js` added to `apps/web`).

- The token is sent as `Authorization: Bearer` on every lab API request. The browser never names the student.
- On a 401 it refreshes once and retries; the action's `clientActionId` keeps a retry idempotent. If it is still refused, the state becomes `expired`.
- A production build in API mode throws without `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, so there is no unsigned fallback.

**Screens.** `AuthGate.tsx` has loading, signed-out, expired ("your work is saved") and restoring states, plus sign-out (English strings; Sinhala draft).

- The open session id is remembered per user in `localStorage` (`vlab.activeSession.<userId>`).
- After a refresh the store reopens it through the new `GET /sessions/{id}` adapter call (`restoreSession`). A 404 forgets it.
- If a different student signs in on the tab, or the student signs out, the page reloads so no in-memory lab state carries over.

**Tests**

- `apps/web/src/test/lab-auth.test.tsx`, 15: token, refresh-retry, expiry, production refusal, the sign-in form, restore for the right student only, forget on 404, identity change.
- `apps/api/tests/test_lab_session_e2e_pg.py`: signed students and Postgres over HTTP.
  - The practical and its recorded action survive an API restart.
  - A retried action is applied once.
  - Another student gets 404 on read and act; no token or a forged token gets 401.

**Results**

| Check | Result |
|---|---|
| Lab web | **402/402** |
| typecheck | clean |
| eslint | clean |
| build | OK |
| Lab API | e2e + repository tests 9 passed; mypy and ruff clean |

A real bug found and fixed by the tests: the disabled auth returned a new state object on every read, which made React re-render forever.

**Not done:** a browser (Playwright) run against a real Supabase project. It is `[BLOCKED]` on the project being restored, and the CI e2e still uses the local engine.

### S23 - TUT-014 Mode A/C: verified tutor whiteboard - DONE (local) `[TESTED]`

**Schema 1.1.** `TeachingResponse` gains `schema_version` (`1.0` still accepted) and `ai_generated: true` (it is always an explanation, never a mark). It also gains `blocks`:

- `text`: plain explanation;
- `table`: up to 6 headers and 12 rows, with one cell per header;
- `chem_equation`: coefficients and formulas, `->` or `<=>`.

**Equation check.** `app/services/teaching/chemistry.py`, with no model involved:

- every formula must parse into real element symbols (brackets, hydrates, caret charges such as `SO4^2-`, and states);
- both sides must balance in atoms and in charge.

It checks bookkeeping, not whether the reaction happens; citations cover that.

**`/tutor/ask` whiteboard mode.** It is opt-in: `whiteboard: true`, plus an optional `learner_level` of `weak`, `developing` or `strong`. It is ignored for voice (`concise`) answers.

- The model gets the same NIE passages and anti-injection rules, and is asked for TeachingResponse JSON (`app/services/tutoring/whiteboard.py`).
- The server checks the whole response before returning it:
  - the shape, markup, URLs and the language;
  - every calculation is recomputed;
  - every equation is balanced;
  - citations must be passage numbers that retrieval actually returned for this question. They are mapped back to those passages' titles and pages.
- Anything that fails falls back to the plain grounded answer, with `whiteboard.status = "rejected"` and no content. An unverified board is never returned.

**C3 mastery.** On a study-plan task, "Why this task?" links to `/tutor?topic=...&level=...`.

- The level is sent only when mastery was measured from results. Under PL-009, self-reported coverage, student choice and no-evidence tasks never send one.
- The level only changes the depth of the explanation; unknown values are refused (422 on the API, ignored on the page).

**Frontend.** `Whiteboard.tsx` draws text, tables and equations from plain strings with React: real `<sub>`/`<sup>` elements via `whiteboard/formula.ts`, and no HTML path. Unknown block types are ignored.

- It has English and Sinhala labels; the Sinhala is a draft pending teacher review.
- The tutor page has a "Whiteboard" toggle.
- A rejected board shows a note that only the text answer is shown.

**Tests**

- `support-service/tests/test_tutor_whiteboard.py` (44):
  - formulas: parsing, and refusing what is not real chemistry;
  - balance: atoms and ionic charge;
  - blocks: each block type, Sinhala, and the 1.0 shape still accepted;
  - 11 rejection paths: markup, URL, table shape, unbalanced equation, unknown element, invented citation, wrong number, bad version, `ai_generated` false, unknown block;
  - the route with a fake provider: a verified board and cited pages; 5 fallback paths (prose, wrong language, invented passage, markup, provider error); opt-in only; voice; learner level; no evidence means no generation.
- `test_route_auth.py`: the recording fake was updated to the new result shape.
- `frontend/tests/Whiteboard.test.tsx` (+9): blocks; markup and script shown as text with no elements created; Sinhala labels; formula formatting.
- `frontend/tests/TutorWhiteboard.test.tsx` (9, new): opt-in, the rejected board not drawn, the planner level used, a forged level ignored, link levels for measured mastery only.

**Results**

| Check | Result |
|---|---|
| Support | **197 passed**, 6 asset-blocked deselected as in CI (disposable Postgres, migrated and seeded); ruff clean except the pre-existing `hints.py` import order |
| Frontend | **120/120**; eslint 0 errors; `tsc -b` clean; build OK |
| CI on `7ce8fbf` (S22) | all 6 jobs green |

**Not done:**

- no run against a real LLM; the prompt's yield of valid boards is unmeasured;
- Sinhala whiteboard strings are drafts.

**Note.** Running the support tests without `DATABASE_URL` picks up the local `.env` (the real pooler). The project is unreachable, so nothing was read or written. Always set `DATABASE_URL` to a disposable database.

### S24 - LAB-011: practical capability registry - DONE (local) `[TESTED]`

**What it is.** `packages/simulation-core/src/capabilities.ts` holds one versioned entry (`registryVersion` 1.0.0) per practical that has a simulation, 1-30. Each entry records:

- the engine and the content version it was derived from;
- the supported modes and guidance levels;
- objectives, apparatus, chemicals, actions, inputs and safety rules;
- calculations and observations;
- assessment (competency estimate, written-answer handling, report, and pre-lab/post-lab counts);
- an explicit **unsupported** list and the practical's own limitation text;
- the handbook pages cited;
- `results: deterministic_engine`.

**Derived, not hand-written.**

- Experiment 4 comes from its `ExperimentDefinition` and handler (`supportsMode`). Its handbook pages are every page cited anywhere in the definition: pp. 9, 10, 16, 29 and 30.
- Bounded handbook models (1-3, 5-20) come from the model itself. Observations and calculated readings are found by running the model's own `calculateHandbook` over every choice combination. Combinations the engine refuses (sodium with dilute HCl in Experiment 9) are recorded as a safety behaviour.
- Teaching templates 21-30 come from their definitions.
- `buildCapabilityRegistry` refuses two engines claiming one practical, and any entry that claims more than its engine supports: a missing mode not declared unsupported, or a competency estimate outside the full engine.

**Used by.**

- **Lab app.** The catalog modes and the mode picker (modes and guidance levels) come from the registry. In API mode the server's modes are intersected with what the engine supports. Library cards for bounded models and teaching templates have a "What this simulation covers" note listing what is not included (English, and Sinhala as a draft). The registry is reached only through `engine/localAdapter.ts`, the lab's single engine boundary, which the `no-chemistry` guard enforces.
- **Published artifact.** `content/experiments/capabilities.v1.json` is written by `pnpm --filter @vlab/simulation-core fixtures:write`. A drift test fails if it differs from what the engines derive.
- **Lab API.** `app/capabilities.py` reads that file at startup and fails fast if it is missing or malformed. `GET /experiments` lists only the registry's modes, and `POST /sessions` refuses any other mode with 422 `invalid_request`. A practical missing from the registry offers no mode.

**Tests**

- `simulation-core/test/capabilities.test.ts` (11):
  - one entry per practical 1-30;
  - Experiment 4 matches its definition and handler;
  - bounded models are guided-only and list their gaps;
  - every declared step is accepted by the handbook engine in order;
  - observations come from the calculation;
  - the refused combination;
  - teaching templates;
  - a duplicate claim is refused;
  - an over-claim is flagged;
  - the registry is deterministic;
  - the artifact is up to date.
- `apps/web/src/test/capabilities.test.tsx` (4): catalog and registry agree; every unsupported code has English and Sinhala text; library notes; the mode picker offers only registry modes and levels.
- `apps/api/tests/test_capabilities.py` (8): published modes; the list uses them; an unsupported mode is neither listed nor started; an unlisted practical offers nothing; a missing or malformed registry stops startup.

**Results**

| Check | Result |
|---|---|
| contracts | 95/95 |
| simulation-core | **242/242** |
| Lab web | **407/407** with `--maxWorkers=3` |
| Lab API | 408 passed, 9 skipped (Postgres-only); ruff, format and mypy clean |
| Lab typecheck | clean |
| eslint | clean |
| `pnpm build` (with content validation) | OK |

A registry build takes about 1.3 ms.

**Local timing note.** With the default worker count on this machine, two long handbook-journey tests (`handbook-labs`, plus `bilingual-answers` or `practical-journey`) sometimes miss their 1-second `findBy` wait. They pass alone and with fewer workers, and CI has been green. This is not caused by the registry; it is recorded here rather than hidden.

**Not done:**

- practicals 31-45 have no simulation, so no entries (Experiment 36 stays reserved);
- the tutor (C4) and planner (C3) do not read the registry yet.

### S25 - Phase 5: cross-component journey on real processes - DONE (local) `[TESTED]`

`scripts/e2e/platform_journey.py` starts its own test environment, then runs the journey:

- a throwaway pgvector container with all four migration chains (it reuses `shared_db_smoke.py`);
- a local JWKS endpoint that signs ES256 tokens for students A and B and a teacher;
- C2, C3, C4 and the lab API as separate processes, with every AI key empty. C2-C4 run from an empty working directory, so no `.env` is read, and every `LAB_*` setting is pinned.

Two fixture helpers support it:

- `seed_assessment.py`: the teacher, A on the teacher's roster, one published paper with a two-point scheme, and one historical AI-only decision.
- `run_planner.py`: points the planner at a **test** topic registry in a temp directory. The real DAT-009 registry is unchanged and still has no approved alias.

**Result: 62/62 checks.**

1. Sign-in: no token and expired tokens get 401 on all four services.
2. Assessment: A submits; B gets 404 on A's attempt; a student cannot mark.
3. Feed before marking: empty, and a wrong integration key gets 401.
4. Teacher decision: the feed has exactly the two teacher-verified points; the AI-only decision never appears.
5. Planner pull:
   - an unreviewed alias quarantines both marks, with no mastery;
   - an approved alias then releases and applies them;
   - a repeated pull changes nothing, and a wrong service key is refused.
6. Correction: it supersedes the old decision, and mastery goes up.
7. Reassessment: it applies, and mastery goes down.
8. Planner, tutor and lab answer for A only:
   - C4's self-only routes give 403 for another student's id;
   - the worked example is verified and labelled AI-generated;
   - A's practical is 404 to B.
9. Evidence: A's planner evidence is exactly the 4 teacher decisions in force.

**Fixed along the way (harness only):**

- the planner needs its topic taxonomy, so the journey now runs the real `python -m scripts.seed_topics` deployment step;
- C4 self-only routes answer 403 by design (`require_self`), not 404.

**CI.** It is a new `journey` job.

### S26 - Phase 6: secret scan, dependency audit, production-readiness runbook - DONE (local) `[TESTED]`

**Secret scan.** `scripts/security/scan_secrets.py` checks tracked files and reports file, line and kind only, never the value. It has a self-test. The tip is clean.

A scan of all git history **corrected `BASELINE_AUDIT.md` §4.3**:

- the support `.env.example` only ever had the `[YOUR-PASSWORD]` template, so no password was committed;
- the one other hit (`2f7f981`) is a documentation example.

Rotation is still needed for the credentials pasted into a chat.

**Dependency audit.** `scripts/security/audit_dependencies.py` covers pnpm, npm, and pip-audit on each Python service resolved as CI installs it. It fails on anything not in `accepted-advisories.json`, where every entry has a reason and a review date.

**Fixed:**

- `zod` raised to ^4.6.7: runtime in contracts, plus a lint-only copy via override;
- `minimatch` override (eslint);
- lab API `pypdf` 6.20.0 → 6.21.4 (it parses uploaded PDFs; capped below 7) and `opentelemetry-api` 1.45.2;
- C4: `fastapi` 0.115 → 0.165 (Starlette 1.10), `python-multipart` 0.0.17 → 0.0.34, `uvicorn` 0.54, `python-dotenv` 1.2.4 and `pytest` 9.0.3, aligned with assessment-service;
- C3: the CI install now uses `UV_INDEX_STRATEGY=unsafe-best-match`. The PyTorch index had been supplying years-old `certifi`, `idna` and `setuptools` with known CVEs. Also `pytest` 9.

**Accepted until 2027-01-31:**

- `undici` via jsdom, tests only: every patched release needs Node ≥ 22.19, above the declared engines;
- C4 `transformers` / `sentence-transformers`: the fixes are major versions that need a retrieval re-evaluation first.

**Runbook.** `docs/engineering/PRODUCTION_READINESS.md` covers credential rotation (names only), RLS and ownership evidence, rate-limit inventory, health, recovery and open items. CI gains a `security` job.

**Results**

| Check | Result |
|---|---|
| Lab web | 407/407 (`--maxWorkers=3`) |
| contracts | 95/95 |
| simulation-core | 242/242 |
| Lab API | 408 passed, 9 skipped |
| C4 | 197 passed, 6 deselected |
| C3 | 446 passed; ruff clean |
| Audit | 0 new in all six sources |
| Lab-scope eslint | clean |

The root `eslint .` reports 5 pre-existing errors in `chemistry-tutor/frontend`: disable comments for a plugin the root config only loads for `apps/web`. A gitignored local folder (`apps/web/final-screens/`) is unreadable to eslint on this machine.

**Not done:**

- per-user rate limits on C2, C3 and the lab;
- a load test;
- monitoring and alerts;
- a backup plan (owner cost decision);
- live verification.

## Open blockers

| Blocker | Owner | Effect |
|---|---|---|
| Shared Supabase project unreachable | operator | no live auth/DB/RLS verification (R55) |
| `VITE_SUPABASE_ANON_KEY` not supplied | operator | sign-in cannot work in the browser |
| Credential rotation (`BASELINE_AUDIT.md` §4.3) | operator | exposed keys remain valid |
| Original C2 test suite missing from git | assessment owner | only new tests exist |
| Topic crosswalk sign-off (DAT-009) | C2 + C3 owners | every real finalized mark is quarantined until aliases are approved |
| Legacy AI-awarded scores (option A/B/C) | operator | historical attempt scores still include AI-judged marks |

## Next safe actions

Done since this list was written: CI runs on every push (S16 onwards); SEC-008 per-component keys (S18); LAB-018 server and browser sides (S21, S22); TUT-014 Mode A/C (S23); LAB-011 capability registry (S24).

5. **PL-010.** A scheduler benchmark fixture set, before any OR-Tools work.
