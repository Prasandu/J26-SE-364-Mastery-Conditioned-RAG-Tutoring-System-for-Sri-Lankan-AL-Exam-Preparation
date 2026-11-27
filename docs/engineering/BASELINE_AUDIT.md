# Baseline audit (M0)

_Branch `all-features`, base commit `e186ecf` + uncommitted integration work (nothing committed).
Last updated 2026-11-26 22:00 (+05:30)._ Labels: `[VERIFIED IN CURRENT CODE]` (read in source),
`[TESTED]` (a command ran and its result is quoted), `[NOT VERIFIED]`, `[BLOCKED]`.

## 0. Repository recovery `[TESTED]`

On 2026-11-25 13:28-13:34 every file directly in the repository root and directly in each
top-level folder was deleted, including `.git/HEAD`, `.git/config` and `.git/index` (cause
unknown). Git then fell through to a stray, empty repository at `%USERPROFILE%\.git` whose
index stages the whole user profile (including `.android/adbkey`); it has no remote.

| Step | Evidence |
|---|---|
| Recreated `.git/HEAD` (`ref: refs/heads/all-features`) and a minimal `.git/config` (`origin` from the reflog) | `git rev-parse --show-toplevel` = the project folder; `--absolute-git-dir` = project `.git`; `git fsck --connectivity-only`: only dangling blobs |
| Rebuilt the index from `HEAD` (`git reset`; working tree untouched) | branch `all-features`, `HEAD` `e186ecf`, `origin` = GitHub repo, `stash@{0}` (lab, GitHub Desktop) intact |
| Restored 40 unmodified deleted files from `HEAD`; recreated 16 edited ones from the integration session's exact edits; recreated git-ignored `.env`s | `git ls-files -d` now lists only `frontend/src/features/papers/PapersPage.tsx` (removed on purpose); nothing staged; only ignored non-dependency path is `.vscode/` |

## 1. Test matrix

| Component | Command | Exit | Result |
|---|---|---|---|
| Integrated web app | `cd frontend; npx tsc -b; npx eslint .; npx vitest run; npx vite build` | 0 | `[TESTED]` tsc clean · eslint 0 errors / 11 warnings · **86/86** · build OK (main chunk ~2 MB warning) |
| C1 type-check | `pnpm -r typecheck` | 0 | `[TESTED]` clean |
| C1 contracts | `cd packages/contracts; npx vitest run` | 0 | `[TESTED]` **95/95** (was 92/95 - see §2.1) |
| C1 simulation core | `pnpm -r --no-bail --filter '!@vlab/api' --filter '!@vlab/contracts' test` | 0 for this package | `[TESTED]` **231/231** |
| C1 web | `cd apps/web; npx vitest run` | 0 | `[TESTED]` **385/385**; `src/test/admin.test.tsx` 38/38 after the §2.2 fix |
| C1 API (Python) | `pnpm --filter @vlab/simulation-core build; cd apps/api; GROQ_API_KEY= OPENAI_API_KEY= LAB_LLM_PROVIDER=disabled LAB_EMBEDDING_PROVIDER=disabled LAB_ADMIN_EXTRACTION_ASSIST=disabled HF_HUB_OFFLINE=1 uv run --no-sync pytest -q` | 0 | `[TESTED]` **385/385** in 172.9 s; no install (`--no-sync`), providers disabled, keys blanked |
| C1 DB migrations | `uv run --project apps/api python scripts/db/migration_smoke.py` | 0 | `[TESTED]` all checks PASS incl. RLS owner isolation, append-only events, knowledge repository; disposable container removed |
| **All 4 services, one DB** | `python scripts/db/shared_db_smoke.py` | 0 | `[TESTED]` **24/24 PASS** - see §3 |
| C2 assessment, auth tests | `uv run --no-project --python 3.13 --with fastapi --with "sqlalchemy>=2" --with pydantic-settings --with "pyjwt[crypto]" --with bcrypt --with email-validator --with pgvector --with pytest --with httpx --with pint --with sympy --with numpy python -m pytest -q tests/test_attempt_ownership.py tests/test_supabase_auth.py` | 0 | `[TESTED]` **18/18** |
| C2 assessment, full available suite | `uv run --no-project --python 3.13 --with-requirements <requirements.txt minus sentence-transformers, + pytest, httpx> python -m pytest -rA tests` | 1, then 0 | `[TESTED]` 2026-11-26 22:45: first run **42 passed / 3 failed** - the 3 were new route tests in `test_paper_access.py` (test fixture detached its `User` rows; `DetachedInstanceError` in the fixture, not product code). Fixed the fixture (`expire_on_commit=False`); rerun **45/45** (auth 11, ownership 7, offline guard 1, health 1, paper access 15, no-generative-marks 10). Same papers tests on the HEAD code: **7 failed** (IDOR reproduced), fixed code: all pass |
| C2 migrations | `alembic upgrade head --sql` (offline) | 0 | `[TESTED]` renders through `0023`; online upgrade/downgrade covered by §3 |
| C3 planning, full suite | `cd planning-service; uv run --no-project --python 3.12 --with-requirements requirements-dev.txt python -m pytest -q` | 0 | `[TESTED]` 2026-11-26: first run (install 20:17 → tests ~22:45) **336 passed** in 60 s; clean rerun **336 passed** in 42 s, incl. the 21 new tests (production guards 4, topic registry 17). DB: tests default `DATABASE_URL` to `127.0.0.1:5432` (a Docker-published container of another project listens there) but no test opened a connection - route tests override `get_db` with fakes, the rest answer before the DB (`test_cors/demo/health/security`) |
| C4 support, full suite | disposable `pgvector/pgvector:pg16` (127.0.0.1, random port) → `alembic upgrade head` → `scripts/seed_questions.py`, `scripts/seed_concepts.py` → `uv run --no-project --python 3.12 --with-requirements <reqs> python -m pytest -q` with `GROQ_API_KEY= GEMINI_API_KEY= HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 SUPABASE_URL=http://127.0.0.1:9` | 1 | `[TESTED]` 2026-11-26 23:0x. Committed `requirements.txt` **unresolvable** (google-genai 2.32.0 vs `pydantic==2.9.2`, `httpx==0.27.2`) - fixed to `pydantic==2.14.4`, `httpx==0.29.0`. Unseeded DB: 72 passed / 43 failed (tests expect the seed scripts' data). Seeded: **109 passed / 6 failed**, all 6 `[BLOCKED]`: `test_rag_extraction` (licensed NIE PDF `knowledge/sources/Grade 12- Chemistry Resource Book…` not in repo), `test_retrieval` + 4 `test_consultation` (embedding model `BAAI/bge-m3` not cached; not downloaded, offline). New security tests (`test_route_auth`, `test_config_guards`, `test_tutor_ask_raw`) pass. Container removed |
| C4 migrations | `alembic upgrade head --sql` (offline) + §3 | 0 | `[TESTED]` all tables in `support`, history in `support.alembic_version` |
| Live Supabase | - | - | `[BLOCKED]` shared project `oepkg…` and old assessment project `hrqgld…`: domains do not resolve (public DNS); pooler answers `tenant/user … not found` (re-checked 21:50). Old lab project `xdltli…` resolves again (not connected to) |

No test above contacted a real database, Supabase project or AI provider: Python tests use
SQLite or a disposable local container; `assessment-service/tests/conftest.py` stops Settings
from reading `.env` (guarded by `tests/test_offline_settings.py`).

**After M0 (2026-11-27, S10 in `EXECUTION_STATE.md`):** C2 **54 passed / 7 skipped** (SQLite) and
**61 passed** with a disposable Postgres; C3 **377 passed / 20 skipped** and **397 passed** with a
disposable Postgres; shared-DB smoke **48/48**. After S11: C2 **68 passed** and C3 **404 passed**
with a disposable Postgres. After S12-S14: C3 **425 passed**, C4 **143 passed / 6 blocked**
(same 6), frontend **96/96** + build. Local only.

## 2. Defects found and fixed in M0

### 2.1 C1 contract "out-of-date schemas" were line endings only `[TESTED]`

`teaching-definition.v1.json`, `api-teaching-record.v1.json`, `api-teaching-save.v1.json`
failed `schema-export.test.ts`. Not stale and not incompatible: the `HEAD` blobs are
byte-identical to `renderSchema()` output; only the working-tree copies had CRLF (809/877/831
CR bytes), written at 2026-11-24 02:59 UTC by a checkout under Git for Windows' system-wide
`core.autocrlf=true` (`C:/Program Files/Git/etc/gitconfig`). The other 50 schemas (written by
`schemas:write`, LF) passed. **Fix:** `.gitattributes` `packages/contracts/schema/*.json text
eol=lf`, then each file rewritten from its `HEAD` blob (hash verified equal); `git status`
shows no content change. The lab stash's versions of these files differ for real (its
`teaching.ts` changes) and were left untouched.

### 2.2 C1 web flaky admin test `[TESTED]`

`admin.test.tsx` "distinguishes storage failures…" failed once under full parallel load and
passed alone. Its `findByText(storage_unavailable_title)` used the 1 s default while sibling
tests use `{ timeout: 5000 }`; the lab stash already contained exactly that one-line fix.
Applied identically (`git diff HEAD stash@{0} -- apps/web/src/test/admin.test.tsx | git apply`),
so applying the stash later will not conflict on it. Assertion unchanged.

### 2.3 Integrated frontend (INT-001/002/003) and attempt ownership (SEC-005) `[TESTED]`

See `IMPLEMENTATION_LOG.md`: one valid frontend; 7 unguarded `/attempts/{id}` routes now
owner-only (route-inventory test fails on the old code with 7 gaps).

### 2.4 Assessment tables without RLS (`0023`) `[TESTED]`

Assessment's convention is RLS with no policies on every table (0001, 0003, 0008, 0014,
0015, 0017); `0012` (`point_reviews`) and `0021` (`topic_edges`) skipped it, so on Supabase
they would be readable via the REST API with the public anon key wherever default grants
exist. New migration `0023_rls_missing_tables.py` enables RLS on both and on
`alembic_version`; shared smoke verifies upgrade, downgrade to `0022`, re-upgrade, and RLS on
**every** `public` table.

### 2.5 C2 test suite never committed `[VERIFIED IN CURRENT CODE]`

Commit `2f7f981` (assessment owner, 2026-10-06) added `tests/` to the root `.gitignore`. Every
reachable commit, the stash, `refs/agents/*` and the `all-features.zip` snapshot (1,279
entries, listed without extracting) contain only `assessment-service/tests/test_health.py`
and no assessment `conftest.py`. Not recoverable here - ask the assessment owner. Restored the
missing `client` fixture in a new `tests/conftest.py`.

## 3. Shared database verification (local only) `[TESTED]`

`scripts/db/shared_db_smoke.py`: disposable `pgvector/pgvector:pg16` container on
`127.0.0.1` (random port, random password), the lab's Supabase mock + `extensions` on the
search path (as on Supabase). 24/24 PASS at M0; 43/43 after the RLS role matrix (S1); **48/48** after the planner's 0010 checks (S10):

- lab `supabase/migrations` applied; lab tables intact in `public`
- assessment, planning, support `alembic upgrade head` succeed, and a second run is a no-op
- assessment `downgrade 0022` then `upgrade head` succeed; head = `0023`
- one head each in `public.alembic_version`, `planning.alembic_version`, `support.alembic_version`
- planning tables only in `planning`; support tables only in `support`; support's knowledge
  tables not in `public`; `users.supabase_user_id` present
- one `vector` extension; no enum name defined in two service schemas
- no foreign key crosses service schemas or links lab and assessment tables
- RLS enabled on every `public` table
- planning `downgrade 0009` then `upgrade head` (0010 ledger tables); `anon`/`authenticated` cannot read `planning.assessment_decisions`
- container removed

**Not verified locally:** service start-up against the migrated schema (needs each service's
full dependencies), Supabase-specific grants and PostgREST exposure, and anything on the real
project.

## 4. Security findings

### 4.1 Route inventories

| Service | Routes | Unauthenticated | Finding |
|---|---|---|---|
| C2 assessment | 91 | `/auth/register`, `/auth/login` (intended); `GET /papers/practice/topics`, `/papers/practice/rates`, `POST /papers/practice/plan` (deterministic, "no model is called"); `GET /papers/{id}`, `/papers/{id}/file` | **`/papers/{id}` and `/file` skip the owner check** the list applies (`app/services/papers.py:98-115`: list filters `created_by`, `get_paper` does not) - any student's practice paper is readable anonymously by id; past-paper PDFs are served to anyone (licensing). Admin 58 + review 7 routes role-gated; review is not scoped to a teacher's own students |
| C4 support | 20 | `/health`, `GET /questions`, `GET /questions/{code}`, **`POST /tutor/ask`, `POST /tutor/ask-raw`, `POST /voice/transcribe`, `POST /voice/synthesize`** | tutor/voice have no auth (IP rate limit only) → anonymous use of paid providers; `/tutor/ask-raw` is an ungrounded LLM endpoint; `POST /practice/flagged-questions` trusts `body.student_id` from any user token. The 7 `/students/{student_id}/…` routes and flagged-question explain/check/hint use `require_self` |
| C3 planning | - | demo routes | demo routes take `student_id` from the URL but require API key + `DEMO_MODE` + allowlist (`app/api/demo.py:30-45`); `.env` has `DEMO_MODE=true` (dev) |
| C1 lab API | - | - | `principal_provider` defaults to `development` (`apps/api/app/settings.py:86`); `supabase_jwt` is a fail-closed placeholder |

### 4.2 Official marks decided by AI `[VERIFIED IN CURRENT CODE]`

`marking.py:97` (`judge.judge`), `:346` (`drawing_judge.judge`), queued by `submit_attempt`;
admin `POST /admin/attempts/{id}/judge` re-runs it. `mastery.py:44` treats any
awarded/not-awarded point as decided regardless of `MarkingMethod.LLM`, so AI-decided points
reach mastery and the `/integration` feed. Practice papers are model-written including their
marking scheme (`POST /papers/practice`).

### 4.3 Credentials (names only, never values)

| Credential | System | Exposure | Action |
|---|---|---|---|
| `GROQ_API_KEY`, `OPENAI_API_KEY` (lab) | Groq, OpenAI | real-looking values in `.env.example` of local checkpoint commit `ad198e3` (2026-10-11), reachable only from local `refs/agents/*`; no branch contains it; `origin` has 0 agent refs | rotate; deleting `refs/agents/*` needs approval |
| shared Supabase DB password; `INGEST_API_KEY` (planning) | Supabase `oepkg…`, planning | pasted into a Claude chat 2026-11-24 | rotate |
| old assessment Supabase DB password, `JWT_SECRET`, `INTEGRATION_KEY_COMPONENT1/3/4`, `AI_API_KEY` (+2 old Groq keys), `GEMINI_API_KEY` (+5 old), `VISION_FALLBACK_2_API_KEY` (OpenRouter) | Supabase `hrqgld…`, assessment, Groq, Gemini, OpenRouter | pasted into a Claude chat 2026-11-24 | rotate (rotating `JWT_SECRET` signs everyone out) |
| support-service `DATABASE_URL` password (Supabase pooler) | C4 Supabase project | **committed** in `chemistry-tutor/support-service/.env.example` since `b8abed0` ("set up backend foundation"), so it is in the GitHub history of every branch that contains it; found 2026-11-27 | rotate now (removing it from the tip does not remove it from history); replaced by a `127.0.0.1` placeholder in the working tree |
| Integration, ingest, JWT, Supabase JWT/anon/secret keys, Gemini | - | **not found** anywhere in git history or tracked files (pattern scan, all refs) | - |

## 5. Cross-component integration blockers

See `INTEGRATION_CONTRACTS.md`: the planner's assessment pull uses an endpoint, header,
shape and topic ids that assessment does not serve, and no code path calls it; flagged-question
ingestion has no service identity; the lab has no shared sign-in yet.

## 6. M0 gate

**M0: `M0_LOCAL_VERIFIED` with documented exceptions; `M0_REMOTE_BLOCKED`** (2026-11-26 23:10). Every local suite has executed; remaining items:

| Item | Status |
|---|---|
| C3 planning full suite | `[TESTED]` 336/336 |
| C4 support full suite | `[TESTED]` 109/115; 6 `[BLOCKED]` (private PDF, uncached model) |
| C2 full available suite | `[TESTED]` 45/45; the original suite is missing (owner) |
| C1 API Python suite | `[TESTED]` 385/385 |
| Live database / Supabase Auth | BLOCKED (projects unreachable; anon key not supplied) |
| CI matrix (QA-004) | not started |

Technical debt recorded: frontend main bundle ~2 MB; 11 lint warnings (Fast Refresh) in
planning code; no repo-wide line-ending policy beyond generated schemas.
