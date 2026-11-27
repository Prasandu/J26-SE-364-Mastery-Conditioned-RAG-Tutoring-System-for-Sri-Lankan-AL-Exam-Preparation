# Next steps

_Checkpoint 2026-11-27 05:10 +05:30. M0: `M0_LOCAL_VERIFIED` with exceptions, `M0_REMOTE_BLOCKED` (`BASELINE_AUDIT.md` §6). M1 slices A1-A5, SEC-005c, D (DAT-010) and E (GRD-011), plus audit-report tickets PL-008, PL-009, TUT-014 (Mode B) and the CI workflow (not yet run on GitHub), done locally; full mapping in `AUDIT_REPORT_TRACEABILITY.md`; evidence in `EXECUTION_STATE.md`. Nothing committed._

## Needs the operator (approval or access)

1. **Restore the shared Supabase project** (`oepkg…`); then run each service's migrations
   (root `README.md`) and set `VITE_SUPABASE_ANON_KEY` in `frontend/.env`.
2. **Rotate** the credentials in `BASELINE_AUDIT.md` §4.3.
3. Approve deleting local `refs/agents/*` (old lab keys) and the stray `%USERPROFILE%\.git`
   (`Remove-Item -Recurse -Force %USERPROFILE%\.git`).
4. Decide on the lab stash (`feature/Virtual-Laboratory`); its admin-test fix is already applied.
5. Ask the assessment owner for the uncommitted assessment test suite and `conftest.py`.
6. Approve committing and pushing to `all-features`.
7. Decide on historical AI-awarded scores - option A, B or C in `LEGACY_AI_MARKS_RECONCILIATION.md`.
8. Get C2 + C3 owners to approve assessment-code aliases in `shared/contracts/topic-registry.v1.json` (until then every real finalized mark is quarantined; `GET /api/v1/integration/assessment/quarantine` lists the codes seen).
9. Choose a scheduler for `python -m scripts.pull_assessment_marks` (cron, platform job) - none is configured.

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
