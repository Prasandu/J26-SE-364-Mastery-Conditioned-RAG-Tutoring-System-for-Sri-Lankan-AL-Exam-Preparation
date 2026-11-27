# Production readiness (Phase 6)

What is checked automatically, what an operator must do, and what is still open. Nothing
here was run against a live database, a live Supabase project or a paid provider.

Last updated 2026-11-27 (S25, S26).

## 1. Automatic gates (GitHub CI, every push)

| Job | What it proves |
|---|---|
| `security` | `scripts/security/scan_secrets.py`: no tracked file looks like it holds a credential. It prints file, line and the kind of credential, never the value, and has a self-test. `scripts/security/audit_dependencies.py`: no known vulnerability in the lab workspace, the frontend, C2, C3, C4 or the lab API beyond the register in `scripts/security/accepted-advisories.json` (each entry has a reason and a review date; an expired date fails). |
| `journey` | `scripts/e2e/platform_journey.py`: the four real services on one disposable PostgreSQL, with locally signed Supabase-style tokens (62 checks; see §5). |
| `shared-database` | All four migration chains in one database, RLS on every public table, the read-only live verifier, and a negative RLS check. |
| per-service jobs | Each service's own suite, lint and type checks. |

## 2. Credentials

The inventory (names and systems only) is `BASELINE_AUDIT.md` §4.3. It was corrected on
2026-11-27: a scan of all of git history found no committed password.

- The support `.env.example` only ever held the `[YOUR-PASSWORD]` template.
- The one flagged value in history is a documentation example (project ref `abcdefgh`).

Credentials still to rotate, because they were exposed outside git (pasted into a chat):

- the shared Supabase database password and the planner `INGEST_API_KEY`;
- on the old assessment project: its database password, `JWT_SECRET`, `INTEGRATION_KEY_COMPONENT1/3/4`, the Groq, Gemini and OpenRouter keys;
- the lab's Groq and OpenAI keys, which are in local checkpoint refs only.

**Rotation runbook.** The operator does this; no value is ever written to the repo, a log or a chat.

1. **Supabase database password** (Dashboard → Project Settings → Database → Reset password).
   - Update `DATABASE_URL` / `LAB_DATABASE_URL` in each service's secret store, not in `.env.example`.
   - Restart each service.
   - Run `scripts/db/verify_live_database.py` (read-only) and check `/health` on all four services.
2. **Provider keys** (Groq, Gemini, OpenAI, OpenRouter).
   - Create the new key in the provider console and update the service's secret store.
   - Restart, then revoke the old key.
   - Watch for 401 or 403 from the provider in the logs.
3. **Service-to-service keys** (`INTEGRATION_KEY_COMPONENT*`, `INGEST_API_KEY`).
   - Generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
   - Update the producer (C2) and the caller (C3's `ASSESSMENT_SERVICE_API_KEY`) together, then check `GET /api/v1/integration/assessment/status`.
   - Between the two updates the C2→C3 pull returns 401 and retries with backoff. No mark is lost: the next pull re-reads from the high-water mark.
4. **`JWT_SECRET` (C2 local accounts).** Rotating it signs out every locally signed-in user. Supabase sign-ins are unaffected.
5. **Git history.** Removing a value from the tip does not remove it from history. Rotate first. Rewriting history (and deleting the local `refs/agents/*`) needs the owner's approval.

## 3. Data protection

- **RLS.**
  - Every `public` table has RLS (shared-database job). The planner schema has no `USAGE` grant for browser roles.
  - Not verified against the live project: Supabase was unreachable. Run `SUPABASE_GO_LIVE.md` steps 1-8 when it is restored.
- **Ownership.** The journey proves each case over HTTP:
  - another student gets 404 for an attempt (C2) or a practical (C1);
  - a student cannot mark (403);
  - C4's self-only routes answer 403 to another student's id;
  - C3 answers only for the token's own student.
- **AI marks.**
  - Only rule, checker or teacher decisions leave C2 (GRD-011). Historical AI-only decisions stay in C2's records and never reach C3. The journey proves this end to end.
  - The legacy reconciliation (`LEGACY_AI_MARKS_RECONCILIATION.md`) on real data still needs explicit approval.

## 4. Limits, health and recovery

**Rate limits and quotas today**

| Service | What exists |
|---|---|
| C4 | Per-user limits and daily caps on every paid route (`app/rate_limit.py`) |
| C2 | Per-user and total daily caps on AI paper generation |
| Lab | A daily cap on paid OpenAI fallback calls. No per-user limit on `/assistant/ask` |
| C3 | None; it makes no paid calls |

The C2, C3 and lab gaps are **open** (§6).

**Health.** `/health` exists on C2, C3 and the lab API, and `/api/v1/health` on C4. The C2→C3 feed reports its state at `GET /api/v1/integration/assessment/status` (service key): last success, failures, high-water mark and quarantine counts. Alerting on these is not configured yet; the deployment platform is still undecided.

**Backup and recovery.** Supabase backups and point-in-time recovery depend on the project's plan, a cost decision for the owner. Until one is chosen:

- recovery means restoring a Supabase backup;
- the C2→C3 ledger rebuilds by re-pulling, because events are idempotent and keyed by event id;
- lab sessions are append-only event streams that replay to the same state.

A restore drill in staging is listed in §6.

## 5. Integration and concurrency evidence

`platform_journey.py` (local run: 62/62) starts C2, C3, C4 and the lab API with every AI provider disabled, then checks the following.

1. Sign-in: no token and expired tokens get 401 on all four services.
2. Assessment: A submits, and the points wait for the teacher. B cannot see A's attempt, and a student cannot mark.
3. Feed before marking: empty until the teacher decides, and a wrong integration key gets 401.
4. Teacher decision: the feed then carries exactly the two teacher-verified points. A seeded historical AI-only decision never appears.
5. Planner pull:
   - an unreviewed topic alias quarantines both marks, and A has no mastery;
   - after the test alias is approved, release applies them (in a test registry in a temp directory; the real DAT-009 registry still has no approved alias);
   - a repeated pull changes nothing, and a wrong service key is refused.
6. Correction: a teacher's corrected mark supersedes the old one, and mastery moves up.
7. Reassessment: a second attempt applies, and mastery moves down.
8. Planner, tutor and lab with A's token: each answers for A only. The tutor's worked example is verified on the server and labelled AI-generated. A's practical is 404 to B.
9. Evidence: A's planner evidence is exactly the four teacher decisions in force.

Concurrency covered by tests:

- a retried lab action is applied once (`clientActionId`, Postgres e2e);
- the C2→C3 worker holds a Postgres advisory lock (one pull at a time across replicas).

**Not done:** load testing (throughput and latency under many students), §6.

## 6. Open items (smallest next steps)

1. **Per-user rate limits** on C2, C3 and the lab API, at the gateway or in each app, starting with the lab's `/assistant/ask`. The lab needs a new API error code in `packages/contracts`.
2. **Load test** of the journey's hot paths (attempt submit, lab actions, C3 pull) against a staging database.
3. **Monitoring and alerts** on `/health` and the feed `status` once a host is chosen.
4. **Backup plan and restore drill** (an owner cost decision).
5. **Accepted advisories** (review by 2027-01-31):
   - `undici` in tests: needs Node ≥ 22.19 to patch;
   - `transformers` / `sentence-transformers` in C4: major upgrades that need a retrieval re-evaluation first.
6. **Live verification** after Supabase is restored (`SUPABASE_GO_LIVE.md`).
