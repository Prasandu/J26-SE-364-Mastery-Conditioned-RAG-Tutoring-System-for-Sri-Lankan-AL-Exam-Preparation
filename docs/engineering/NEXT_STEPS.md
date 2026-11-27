# Next steps

_Checkpoint 2026-11-27 (after operator approvals). Everything up to `9f7c30d` is committed and pushed to `all-features`. CI on GitHub runs all 6 jobs. Evidence is in `EXECUTION_STATE.md`; the audit-report mapping is in `AUDIT_REPORT_TRACEABILITY.md`._

## Done after the operator's approval (2026-11-27)

- Committed and pushed. The first GitHub CI run failed only in the support job (index rule); after the fix, all 6 jobs pass.
- `refs/agents/*` deleted. Lab stash kept.
- Legacy AI marks (corrected 2026-11-27): **every** AI-only decision goes to teacher review whatever its confidence; confidence only sets review priority (tool built; not run on real data, `--apply` needs explicit approval).
- Class rosters for teacher review.

## Still needs the operator (access, people or permissions)

1. **Rotate credentials** (`BASELINE_AUDIT.md` §4.3), most urgently the support-service database password that was committed in `.env.example` since `b8abed0`. It is still in the git history.
2. **Restore the shared Supabase project.** Then:
   - run each service's migrations;
   - set `VITE_SUPABASE_ANON_KEY`;
   - back up the database;
   - run `python -m app.reconcile_legacy_ai_marks` (dry run, then `--apply`);
   - create classes in Admin → Classes.
3. Delete the stray `%USERPROFILE%\.git` yourself (`Remove-Item -Recurse -Force $env:USERPROFILE\.git`). The tool's safety layer blocked it here. It has 0 commits and only an index and blob copies of profile files.
4. Ask the assessment owner for the original test suite.
5. C2 + C3 owners: approve assessment-code aliases in `shared/contracts/topic-registry.v1.json`. Until then every real finalized mark is quarantined.
6. Choose a scheduler for `python -m scripts.pull_assessment_marks`.
7. Teacher-approved chemistry content (GRD-007, LAB-012), licensing, consent/privacy policy, pilots and pricing.

## M0 exceptions still open

Live Supabase verification (`[BLOCKED]`), original C2 owner test suite (owner), 6 C4 tests
(licensed PDF + uncached embedding model - not downloaded without an approved need), standalone
`chemistry-tutor/frontend` build (`[NOT VERIFIED]`), QA-004 CI matrix (not started).

## M1 plan - dependency ordered, one tested slice each

Every slice: failing test first, negative authorization tests, both sides of each caller
changed together, rollback note. Official-mark rule throughout: deterministic rules and
approved schemes decide auto-gradable points; anything else goes to teacher review; RAG may
retrieve evidence and explain a **finalized** result; no generative model awards or alters a mark.

### Phase A - public endpoints and ownership

| Slice | Endpoints | Callers to change with it | Tests | Compatibility / rollback |
|---|---|---|---|---|
| **A1 SEC-007a** auth tutor + voice - DONE `[TESTED]` | C4 `POST /api/v1/tutor/ask`, `/voice/transcribe`, `/voice/synthesize` → `Depends(get_current_user_id)` | `frontend/src/features/tutor/services/tutorApi.ts:10`, `voiceApi.ts:8,18` and the standalone `chemistry-tutor/frontend/src/services/tutorApi.ts`, `voiceApi.ts`: `fetch` → `authFetch`; `scripts/run_correctness_benchmark.py` (needs a test token) | 401 without/with a bad token for each route; existing `test_tutor_ask.py`, `test_security.py:56,109`, `test_voice.py` get an auth override | frontend and backend in one change; rollback = drop the dependency |
| **A2 SEC-007b** retire `/tutor/ask-raw` - DONE `[TESTED]` | C4 `POST /api/v1/tutor/ask-raw` | none in any frontend; only `tests/test_tutor_ask_raw.py` | route returns 404 unless `ENABLE_RAW_TUTOR=true` (dev only, refused when `ENVIRONMENT=production`) | flag off by default; rollback = flag on |
| **A3 SEC-007c** flagged-question ingest = service only - DONE `[TESTED]` | C4 `POST /api/v1/practice/flagged-questions` | no frontend and no script calls it today (the `scripts/seed_flagged_questions.py` named in its docstrings does not exist in any commit); future C2 producer | end-user token → 401/403; valid service credential → 201; forged `student_id` from a user token rejected | no current caller breaks; rollback = accept both for one release |
| **A4 SEC-005b** papers owner check - DONE `[TESTED]` | C2 `GET /papers/{id}`, `GET /papers/{id}/file` → `optional_user` + `created_by` check (shared papers: `created_by is None`) | `frontend/src/api/papers.ts:9,16` already send the Supabase token via `request`/`requestBlob` | another student's practice paper → 404; anonymous → shared papers only; route-inventory test for `papers.py` like `tests/test_attempt_ownership.py` | no caller change; rollback = remove check. Licensing decision on anonymous past-paper PDFs is the owner's |
| **A5 SEC-006** planner ownership - DONE `[TESTED]` (S11) | C3 plan/task/dashboard/notifications routes; demo routes | `frontend/src/api/planning.ts` (token already sent) | cross-user negative tests; startup refuses `DEMO_MODE=true` with production settings | config guard only |

### Phase B - cross-service identity (SEC-008)

One scheme for service calls (C3→C2 pull, C2→C4 flagged questions, later C1→C3/C4):
per-caller key or short-lived audience-scoped token, verified at the receiver, with request
ids and replay protection. Rename the planner's `X-API-Key` / `ASSESSMENT_SERVICE_API_KEY` to
assessment's `X-Integration-Key` / per-component key. Tests: wrong key 401, other
component's key 403, missing key 401. Rollback: keep the old header for one release.

### Phase C - canonical topics (DAT-009)

`shared/contracts/topic-registry.v1.json`: planner ids (`chem-u3-…`, 195 in
`shared/contracts/topics.json`) as canonical; reviewed mappings from assessment codes
(`U03_…`), support concept ids and lab experiment ids; review status per mapping. Unknown or
unreviewed ids are quarantined, never fuzzy-matched. Needs C2/C3/C4/C1 owners' sign-off.

### Phase D - finalized-mark events (DAT-010) - DONE locally `[TESTED]` (S9, S10)

Contract in `INTEGRATION_CONTRACTS.md`: `assessment.criterion.finalized` v1, `eventId` +
`idempotencyKey`, `supersedesEventId`, `evidenceClass` deterministic | teacher_verified,
`GET /integration/events?since=&cursor=`; planner consumer with idempotent upsert, a
scheduled pull, contract tests on both sides. Depends on B and C.

### Phase E - non-generative official grading (GRD-011) - P0 release blocker

| Change | Where |
|---|---|
| AI judge results never set `awarded`/`not_awarded`: they become non-binding feedback and the point goes to `needs_review` | `assessment-service/app/services/marking.py:97` (text), `:346` (drawing) |
| `submit_attempt` stops queueing official judging; `POST /admin/attempts/{id}/judge` becomes "draft feedback" only | `app/api/attempts.py`, `app/api/admin.py`, `app/services/attempts.py:294-342` |
| mastery and `/integration` count only `rule`/`checker`/teacher decisions | `app/services/mastery.py:44` |
| practice papers (model-written schemes) excluded from official evidence | `app/services/integration.py`, `mastery.py` |
| tests: a fake judge that returns "awarded" can never change a mark; teacher review finalizes; integration feed excludes LLM points | new `tests/test_no_generative_marks.py` |

Rollback: feature flag `OFFICIAL_AI_MARKING=false` (default), so the old path can only be
re-enabled deliberately for research comparison, never in production.

### Phase F - lab identity (LAB-018) and CI (QA-004)

Lab `supabase_jwt` principal (JWKS, as assessment's `app/services/supabase_auth.py`) and
persisted owner-scoped sessions; CI jobs per app plus `scripts/db/shared_db_smoke.py` and
`scripts/db/migration_smoke.py`, fake providers only.

## Next safe implementation step

Run the CI workflow once (needs push authorization) → **SEC-008** → **LAB-018** browser
token + persisted lab sessions → **TUT-014 Mode A/C** (generator emits validated
`TeachingResponse`) → **LAB-011** capability registry → **PL-010** scheduler benchmark.
Blocked on people/permissions: topic aliases, legacy AI marks decision, GRD-007/LAB-012
teacher content, licensing, pilots.
