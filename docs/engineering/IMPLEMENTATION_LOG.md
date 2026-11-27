# Implementation log

One entry per verified slice. Read this, `NEXT_STEPS.md` and `git status` before starting work.

## 2026-11-26 - M0 slice 1: repository recovery and integrated frontend (INT-001/002/003)

- **Before:** `.git` metadata and every top-level file deleted; committed `frontend/package.json`
  is invalid JSON (two manifests concatenated), `App.tsx`/`main.tsx` contain two apps.
- **After:** repository repaired (see `BASELINE_AUDIT.md` §0); one frontend manifest, entry point
  and router with all assessment routes, planning (`/planning`), tutor (`/tutor`) and lab (`/lab`).
- **Tests:** `cd frontend; npx tsc -b` (0) · `npx eslint .` (0 errors) · `npx vitest run` (86/86)
  · `npx vite build` (OK).
- **Rollback:** the frontend changes are uncommitted; `git checkout HEAD -- frontend` restores the
  broken merge (not recommended).

## 2026-11-26 - M1 slice 2: owner-only assessment attempts (SEC-005)

- **Before:** `GET /attempts/{id}`, `PUT/DELETE /attempts/{id}/answers/{q}`,
  `POST /attempts/{id}/answers/{q}/images`, `POST /attempts/{id}/answer-sheet`,
  `PUT /attempts/{id}/answers` and `POST /attempts/{id}/submit` required no sign-in: anyone with an
  attempt id could read results, change answers, upload images or submit.
- **After:** `app/security.py` `require_owned_attempt` (signed-in user must be the attempt's owner;
  otherwise 404 so ids cannot be probed) on all seven routes via `dependencies=OWNER_ONLY` in
  `app/api/attempts.py`. Teachers keep their access through `/review`. Frontend unaffected (these
  routes are only called from student pages, which already send the token).
- **Tests:** `tests/test_attempt_ownership.py` - guard unit tests (owner ok; other student,
  teacher, admin, missing id → 404) and a source-level route inventory that fails if any
  `/{attempt_id}` route lacks the guard. The same inventory run on `HEAD` reports 7 unguarded
  routes. `pytest tests/test_attempt_ownership.py tests/test_supabase_auth.py`: 18 passed.
  `ruff check` / `ruff format --check`: clean.
- **Rollback:** remove `dependencies=OWNER_ONLY` from the seven decorators.
