# Audit report → implementation traceability

Source: `J26-SE-364_Final_Code_Audit_Development_and_Commercialization_Report.pdf` (26 Nov 2026), which audited an earlier ZIP of `all-features`.

This file maps each of its findings and backlog tickets to the current working tree (2026-11-27, uncommitted).

Labels: `[TESTED]` (executed locally, with results recorded in `EXECUTION_STATE.md`), `[VERIFIED IN CURRENT CODE]`, `[NOT VERIFIED]`, `[BLOCKED]` (needs an operator, an owner, content or real users). No item here is a live or production result.

## §10.1 release blockers

| Report finding | Status now | Evidence |
|---|---|---|
| P0 `frontend/` package.json and App/main concatenated, cannot build | Fixed `[TESTED]` | Rebuilt from the branch blobs. Lint has 0 errors, 96/96 tests pass and `npm run build` succeeds (S14) |
| P0 C2 attempt routes lack caller/ownership checks | Fixed `[TESTED]` | `require_owned_attempt` on all 7 `/{attempt_id}` routes, plus the paper IDOR fix. A whole-app route-guard inventory fails 3 tests on the old routers (S11) |
| P0 C4 flagged-question intake accepts any user for any student | Fixed `[TESTED]` | Service key only (`X-Integration-Key`); an end-user token gets 401 (S3) |
| P0 C1 no real auth / in-memory sessions | Partly fixed | Supabase JWKS principal on the lab API `[TESTED]`. Still to do: the browser sending the token and persistent session ownership in Postgres |
| P0 C2 generative judge allocates marks | Fixed `[TESTED]` | GRD-011: AI verdicts are suggestions (`needs_review`, 0 marks); mastery and feeds use rule/checker/teacher only |
| P0 divergent identity formats | Fixed for C2→C3 `[TESTED]` | Supabase user id end to end. Assessment links accounts by `supabase_user_id`, never by email. The C1 browser side is still open |
| P1 multiple KB stores | Open | KB-013 not started |
| P1 C4 grounding validated weakly | Partly addressed `[TESTED]` | The TUT-014 validator rejects invented citations, wrong numbers, unbalanced equations and unsafe text. `/tutor/ask` whiteboard mode (S23) is validated against the passages retrieved for that question, or falls back to the plain answer. The plain free-text answer itself is still not claim-checked |
| P1 voice/upload privacy | Open `[BLOCKED]` | Needs provider agreements and a consent policy (operator/legal) |
| P1 push/pull adapters not one proven E2E | Fixed for C2→C3 `[TESTED]` | Finalized-mark feed, consumer and ledger: idempotent, with corrections, quarantine and per-page transactions (S9, S10) |

## §13.1 ticket backlog

| Ticket | Status | Where |
|---|---|---|
| INT-001 repair frontend | Done `[TESTED]` | `frontend/` |
| SEC-002 attempt owner checks | Done `[TESTED]` | `assessment-service/app/security.py`, `tests/test_attempt_ownership.py`, `tests/test_route_guards.py` |
| SEC-003 flagged intake | Done (service key) `[TESTED]` | `chemistry-tutor/support-service/app/security.py`. A separate "flag my own question" student endpoint is not built |
| SEC-004 lab JWT + durable sessions | JWT done `[TESTED]`; durable sessions open | `apps/api/app/principal.py` |
| DAT-005 canonical ids + event schemas | Done for C2→C3 `[TESTED]`; topic aliases `[BLOCKED]` | `shared/contracts/assessment-criterion-finalized.v1.json`, `topic-registry.v1.json` (0 approved aliases; needs C2+C3 owner review) |
| GRD-006 remove AI judge from official scoring | Done `[TESTED]`; legacy policy (every AI-only decision → teacher review; confidence only orders the review) implemented, not yet run on real data | `assessment-service/app/services/marking.py`, `mastery.py`. Plan for historical marks: `LEGACY_AI_MARKS_RECONCILIATION.md` (operator decision) |
| GRD-007 expand chemistry equivalence | `[BLOCKED]` | Needs teacher-approved equivalence content; we must not invent chemistry rules |
| PL-008 coverage-percentage planner | Done `[TESTED]` | `PlanInput.coverage`, parent/child consistency, coverage-scaled priority, coverage-driven activity, Setup UI (S12) |
| PL-009 evidence-source labels | Done `[TESTED]` | `reason_details.evidence_source` (results / self_reported_coverage / student_choice / no_evidence); UI "why now" text (S12) |
| PL-010 scheduler benchmarks + model registry | Open | Greedy scheduler kept. Add OR-Tools only after a measured improvement (report §6.3) |
| LAB-011 per-practical capability registry | Done `[TESTED]` | `simulation-core/src/capabilities.ts`, derived from each engine. Published as `content/experiments/capabilities.v1.json` with a drift test. Used by the lab app (modes, levels, library notes) and the lab API (`GET /experiments` modes, `POST /sessions` refuses other modes) (S24) |
| LAB-012 science-family expansion | `[BLOCKED]` | Needs teacher-validated chemistry |
| KB-013 unified source metadata | Open | |
| TUT-014 teaching-action validator + whiteboard | Done for Modes A/B/C `[TESTED]` | Mode B: worked examples (S13). Modes A/C: `/tutor/ask` `whiteboard: true`, with schema 1.1 text, table and equation blocks; atom and charge balance in `teaching/chemistry.py`; fallback to the plain answer (S23). Open: the real-model pass rate |
| TUT-015 original wireframe avatar, lip sync | Open | After the TUT-014 Mode A/C integration |
| OPS-016 CI/CD + telemetry | CI written `[NOT VERIFIED]`; CD/telemetry open | `.github/workflows/ci.yml`: YAML parses and each step mirrors a locally passing command, but it has not run on GitHub (no push authorized) |
| BIZ-017 licensing, pilots, pricing | `[BLOCKED]` | Product/operator |

## §12.1 end-to-end scenarios

| Scenario | Status |
|---|---|
| E02 manual coverage 0/30/100%, no fabricated mastery | `[TESTED]` `planning-service/tests/test_coverage_planning*.py` |
| E03 one idempotent finalized event | `[TESTED]` `tests/test_finalized_marks_db.py` |
| E04 repeated/revised event | `[TESTED]` duplicate, correction, out-of-order |
| E05 cross-account attempt UUID | `[TESTED]` `assessment-service/tests/test_attempt_ownership.py` |
| E10 teacher changes a point → C3 amendment | `[TESTED]` locally (producer version bump + consumer supersession + re-plan flag) |
| E12 missed task keeps completed work | `[VERIFIED IN CURRENT CODE]` existing planner tests |
| E19 whiteboard shows only validated steps | `[TESTED]` validator + `Whiteboard.test.tsx` |
| E22 provider unavailable | Partly: marking and planning never call a provider. Tutor failure modes are not re-tested |
| E01, E06–E09, E11, E13–E18, E20, E21, E23, E24 | Not yet run as cross-component E2E. E13/E14 have lab unit tests. E24 needs a tenant model (none exists yet) |
| Teacher reviews only assigned cohorts (report §10.2) | `[TESTED]` class rosters scope all `/review` routes; decisions signed by the logged-in teacher (S16) |

## §15 release gates

| Gate | Status |
|---|---|
| G1 source integrity | Local builds and tests are green; CI not yet run on GitHub; nothing committed |
| G2 security and privacy | Negative tests in every service; independent security review, consent and tenancy `[BLOCKED]` |
| G3 trustworthy content | `[BLOCKED]` teacher signatures |
| G4 marking integrity | Code path done; calibration dataset `[BLOCKED]` (teachers) |
| G5 evidence integration | C2→C3 done locally; C1→C3 and C2→C4 open; live `[BLOCKED]` |
| G6 planner reliability | Both entry methods done; holdout and usability studies `[BLOCKED]` (real users) |
| G7 tutor/avatar safety | Mode B verified whiteboard done; generator integration and avatar open |
| G8–G10 operations, legal, business | `[BLOCKED]` operator |

**Commercialization-ready:** no. The report's own rule applies: every gate must be evidenced, and G2–G4 and G7–G10 need people, permissions or live systems that this workspace does not have.
