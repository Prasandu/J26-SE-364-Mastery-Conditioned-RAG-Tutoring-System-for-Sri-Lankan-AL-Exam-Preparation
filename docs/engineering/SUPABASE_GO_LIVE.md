# Live Supabase verification and go-live runbook

_Status 2026-11-27: **prepared, not executed**. The shared project (`oepkg…`) is unreachable. Nothing here has run against any cloud database. Every write step needs the operator present, a verified backup, and explicit approval. Local rehearsal: `python scripts/db/shared_db_smoke.py` (59/59 locally; it runs in CI)._

## 0. Preconditions (operator)

1. **Rotate every credential** listed in `BASELINE_AUDIT.md` §4.3. Do this first for the support-service database password that was committed in `chemistry-tutor/support-service/.env.example`. Put new values only in the secret store or the git-ignored `.env` files.
2. **Restore the Supabase project** and confirm you can reach it from the machine that will run migrations.
3. **Confirm the plan's backup and point-in-time recovery**, and take a manual backup. Restoring it to a scratch project and opening it once is the only proof it works.
4. **Agree a maintenance window.** The migrations are additive (new tables and columns, RLS on), but the class-roster migration changes who sees what: teachers see no scripts until classes exist.

## 1. Read-only baseline (safe at any time)

```
VERIFY_DATABASE_URL=<direct or pooler URL from the secret store> \
  uv run --no-project --with "psycopg[binary]>=3.2,<4" python scripts/db/verify_live_database.py
```

- The script runs a read-only session. It prints only check names, PASS/FAIL and counts, never the URL or any student data.
- Before migrating, expect the "migrated to the repository head" checks to fail. Save the output as the baseline.

## 2. Review the SQL before applying (no writes)

For each Python service, from its folder, with `DATABASE_URL` pointing at the live project:

```
alembic upgrade head --sql > ../review-<service>.sql      # offline: prints SQL, runs nothing
```

Read each file. Check that nothing drops or rewrites existing data. The pending migrations are additive:

| Service | Migrations | Change |
|---|---|---|
| assessment | 0022–0026 | Supabase user link, RLS on remaining tables, legacy AI-marks audit + priority, class rosters |
| planning | 0010 | finalized-mark ledger, rejections, cursor (schema `planning`) |
| support | to `c4d8e2f1a7b3` | schema `support`, `flagged_questions` |

The lab SQL in `supabase/migrations/` goes through the Supabase CLI history. Apply only files not yet recorded.

## 3. Apply (operator approval required; backup taken in step 0)

Apply in this order, one service at a time. Re-run the step 1 verifier after each.

1. Lab: `supabase db push` (or `pnpm db:migrate`), per `docs/SETUP.md`.
2. Assessment: `alembic upgrade head`.
3. Planning: `alembic upgrade head`.
4. Support: `alembic upgrade head`.

**Rollback:** each Alembic step has a tested downgrade (the smoke test downgrades and re-upgrades the newest revisions). Prefer restoring the backup if data was written after the upgrade.

## 4. Verify (read-only)

Run the step 1 verifier again. Every required check must pass:

- heads match the repository;
- RLS is on for every `public` table;
- `anon` and `authenticated` cannot use the `planning` or `support` schemas;
- `pgvector` is installed.

It also reports two informational counts:

- active classes and teachers without a class;
- AI-only decisions still counted as marks.

## 5. Configure the apps

1. Frontend: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anon key is public by design; RLS is the guard.
2. Each service: set `SUPABASE_URL` / `SUPABASE_JWKS_URL` and the per-component integration keys. Names only are listed in each `.env.example`; the matrix is in `INTEGRATION_CONTRACTS.md` §SEC-008.

## 6. Class-roster onboarding (required before teachers can review)

1. Link existing staff accounts to their Supabase users: `python -m app.set_role --email <staff email> --role teacher --link` (assessment).
2. As an admin, go to **Admin → Classes**. Create each class, tick its teachers, tick its students, and save.
3. Check: a teacher's Review page lists only their students. The verifier's "teachers_without_a_class" count should be 0.

## 7. Legacy AI marks (approval required before `--apply`)

```
python -m app.reconcile_legacy_ai_marks            # dry run: counts only
```

- Review the counts with the operator. Only with explicit approval, run `--apply` and keep the printed `run_id`.
- Teachers then work the queue, high priority first. Until a run is applied, students already see such totals as provisional.

## 8. First end-to-end check

1. A student signs in.
2. They attempt a published paper, which is marked.
3. A teacher decides any review points.
4. The planner pull runs: `GET /api/v1/integration/assessment/status` shows a recent `last_success_at`.
5. Until topic aliases are approved, the marks appear under `GET …/quarantine`. They are not dropped and not guessed.

## Not allowed without separate approval

- Destructive SQL, `alembic downgrade` on live data, or deleting rows or schemas.
- Running `--apply` scripts on real student data.
- Changing billing or plan tiers.
- Making the project public.
