"""Disposable-PostgreSQL smoke test: all four components' migrations in ONE database.

The integrated system shares one Supabase project. This proves, without any real
Supabase credentials, that the four migration histories coexist:

- virtual lab:  supabase/migrations/*.sql             -> public  (Supabase CLI history)
- assessment:   assessment-service/migrations          -> public  + public.alembic_version
- planning:     planning-service/migrations            -> planning + planning.alembic_version
- support:      chemistry-tutor/support-service/migrations -> support + support.alembic_version

Starts a uniquely named pgvector/PostgreSQL 16 container (published on 127.0.0.1 only,
random host port, random password), installs the same Supabase mock the lab's
migration_smoke.py uses, applies the lab SQL, runs `alembic upgrade head` for each
Python service twice (the second run must be a no-op), checks schemas, tables and
history tables, then removes only that container. Never touches another database.

Usage (from the repository root; needs Docker and uv):
    python scripts/db/shared_db_smoke.py
"""

import os
import secrets
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from migration_smoke import MOCK_SUPABASE

IMAGE = "pgvector/pgvector:pg16"
NAME = f"j26-shared-db-smoke-{secrets.token_hex(4)}"
PASSWORD = secrets.token_urlsafe(16)
DB = "shared"

# Supabase puts its `extensions` schema (where the lab installs pgvector) on the
# default search path; a plain container does not, so mirror that here.
SUPABASE_SEARCH_PATH = f'alter database {DB} set search_path = "$user", public, extensions;'

# Only what each service's migrations/env.py imports (no torch, no AI SDKs).
ALEMBIC_DEPS = ["alembic", "sqlalchemy>=2", "psycopg[binary]", "pgvector", "pydantic-settings"]
SERVICES = {
    "assessment": (
        ROOT / "assessment-service",
        [*ALEMBIC_DEPS, "fastapi", "pyjwt[crypto]", "bcrypt", "email-validator", "pint", "sympy", "numpy"],
        "postgresql+psycopg",
        "public",
    ),
    "planning": (
        ROOT / "planning-service",
        [*ALEMBIC_DEPS, "fastapi", "pyjwt[crypto]", "httpx"],
        "postgresql+psycopg",
        "planning",
    ),
    "support": (
        ROOT / "chemistry-tutor" / "support-service",
        ALEMBIC_DEPS,
        "postgresql",  # support's env.py adds +psycopg itself
        "support",
    ),
}
LAB_TABLES = {
    "action_events",
    "active_catalog",
    "admin_audit_events",
    "admin_records",
    "catalog_audit_events",
    "catalog_entries",
    "catalog_versions",
    "experiments",
    "knowledge_chunks",
    "knowledge_versions",
    "notebooks",
    "practical_versions",
    "reports",
    "sessions",
}


def docker(*args: str, input_text: str | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["docker", *args], input=input_text, capture_output=True, text=True, check=check)


def psql(sql: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return docker(
        "exec",
        "-i",
        NAME,
        "psql",
        "-U",
        "postgres",
        "-d",
        DB,
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        input_text=sql,
        check=check,
    )


def alembic(service: str, port: str, *command: str) -> subprocess.CompletedProcess[str]:
    folder, deps, scheme, _ = SERVICES[service]
    env = {
        **os.environ,
        "DATABASE_URL": f"{scheme}://postgres:{PASSWORD}@127.0.0.1:{port}/{DB}",
        # planning's Settings requires these; never used by migrations.
        "INGEST_API_KEY": "smoke-only",
        "SUPABASE_URL": "",
        "UV_LOCK_TIMEOUT": "3600",
    }
    argv = ["uv", "run", "--no-project", "--python", "3.12"]
    for dep in deps:
        argv += ["--with", dep]
    argv += ["alembic", *(command or ("upgrade", "head"))]
    return subprocess.run(argv, check=False, cwd=folder, env=env, capture_output=True, text=True)


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, ok, detail))

    docker(
        "run",
        "-d",
        "--rm",
        "--name",
        NAME,
        "-p",
        "127.0.0.1::5432",
        "-e",
        f"POSTGRES_PASSWORD={PASSWORD}",
        "-e",
        f"POSTGRES_DB={DB}",
        IMAGE,
    )
    try:
        for _ in range(60):
            if docker("exec", NAME, "pg_isready", "-U", "postgres", "-d", DB, check=False).returncode == 0:
                break
            time.sleep(1)
        time.sleep(2)
        port = docker("port", NAME, "5432").stdout.strip().splitlines()[0].rsplit(":", 1)[1]

        psql(MOCK_SUPABASE)
        psql(SUPABASE_SEARCH_PATH)
        for migration in sorted((ROOT / "supabase" / "migrations").glob("*.sql")):
            psql(migration.read_text(encoding="utf-8"))
        check("lab: supabase/migrations applied", True)

        for service in SERVICES:
            for attempt in ("first", "second (no-op)"):
                run = alembic(service, port)
                tail = (run.stderr or run.stdout).strip().splitlines()[-3:]
                check(f"{service}: alembic upgrade head ({attempt})", run.returncode == 0, " | ".join(tail))
                if run.returncode != 0:
                    break

        # Rollback of the newest assessment migration (0023, RLS), then forward again.
        down = alembic("assessment", port, "downgrade", "0022")
        check("assessment: downgrade 0023 -> 0022", down.returncode == 0, (down.stderr or "")[-200:])
        up = alembic("assessment", port, "upgrade", "head")
        check("assessment: upgrade back to head", up.returncode == 0, (up.stderr or "")[-200:])
        # Same for the planner's newest migration (0010, DAT-010 finalized-mark ledger).
        down = alembic("planning", port, "downgrade", "0009_task_outcome_undo")
        check("planning: downgrade 0010 -> 0009", down.returncode == 0, (down.stderr or "")[-200:])
        up = alembic("planning", port, "upgrade", "head")
        check("planning: upgrade back to head", up.returncode == 0, (up.stderr or "")[-200:])

        def rows(sql: str) -> set[str]:
            return {line for line in psql(sql).stdout.splitlines() if line}

        public = rows("select tablename from pg_tables where schemaname='public';")
        check("lab tables intact in public", LAB_TABLES <= public, ",".join(sorted(LAB_TABLES - public)))
        for service, (_, _, _, schema) in SERVICES.items():
            version = rows(f"select version_num from {schema}.alembic_version;") if schema else set()
            check(
                f"{service}: one head recorded in {schema}.alembic_version",
                len(version) == 1,
                ",".join(version),
            )
        planning_tables = rows("select tablename from pg_tables where schemaname='planning';")
        support_tables = rows("select tablename from pg_tables where schemaname='support';")
        check("planning tables live in schema planning", len(planning_tables) > 1, str(len(planning_tables)))
        ledger = {"assessment_decisions", "integration_rejections", "integration_cursors"}
        missing = ",".join(sorted(ledger - planning_tables))
        check("planning DAT-010 tables present (0010)", ledger <= planning_tables, missing)
        check("support tables live in schema support", len(support_tables) > 1, str(len(support_tables)))
        check(
            "support knowledge tables not in public",
            "knowledge_documents" not in public
            and {"knowledge_chunks", "knowledge_documents"} <= support_tables,
        )
        check(
            "assessment users has supabase_user_id (0022)",
            rows(
                "select column_name from information_schema.columns where table_schema='public' "
                "and table_name='users' and column_name='supabase_user_id';"
            )
            == {"supabase_user_id"},
        )
        check(
            "one pgvector extension",
            rows("select count(*) from pg_extension where extname='vector';") == {"1"},
        )

        # Enum/composite types: one definition per (schema, name). Postgres would have
        # refused a duplicate in the same schema, so also report same-named types
        # across services' schemas, which would make unqualified references ambiguous.
        enums = rows(
            "select n.nspname || '.' || t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace "
            "where t.typtype = 'e' and n.nspname in ('public','planning','support');"
        )
        names = [e.split(".", 1)[1] for e in enums]
        check(
            "no enum name defined in two service schemas",
            len(names) == len(set(names)),
            ",".join(sorted(enums)),
        )

        # Foreign keys never cross from one service's tables into another's.
        cross = rows(
            "select c.conrelid::regclass || ' -> ' || c.confrelid::regclass from pg_constraint c "
            "join pg_class s on s.oid = c.conrelid join pg_namespace sn on sn.oid = s.relnamespace "
            "join pg_class t on t.oid = c.confrelid join pg_namespace tn on tn.oid = t.relnamespace "
            "where c.contype = 'f' and sn.nspname in ('public','planning','support') and sn.nspname <> tn.nspname "
            "and tn.nspname <> 'auth';"
        )
        check("no foreign key crosses service schemas", not cross, "; ".join(sorted(cross)))
        lab_fk = rows(
            "select c.conrelid::regclass || ' -> ' || c.confrelid::regclass from pg_constraint c "
            "where c.contype = 'f' and c.connamespace = 'public'::regnamespace;"
        )
        mixed = [
            fk for fk in lab_fk if (fk.split(" -> ")[0] in LAB_TABLES) != (fk.split(" -> ")[1] in LAB_TABLES)
        ]
        check("no foreign key between lab and assessment tables in public", not mixed, "; ".join(mixed))

        # Row-level security on every public table. Supabase exposes `public` through its
        # REST API to the anon/authenticated roles, so a public table without RLS is
        # readable with the (public) anon key wherever those roles hold grants.
        no_rls = sorted(
            rows("select tablename from pg_tables where schemaname='public' and not rowsecurity;")
        )
        check("every public table has RLS enabled (lab + assessment)", not no_rls, ",".join(no_rls))
        check("assessment head is 0023", rows("select version_num from public.alembic_version;") == {"0023"})

        # Role matrix for assessment's public tables, the way Supabase would expose them:
        # Supabase grants anon/authenticated broad privileges on `public` by default, so
        # grants are applied first and RLS (no policies) must be what denies access.
        # Local approximation only - the live project's grants are not verified here.
        psql(
            "grant select, insert, update, delete on all tables in schema public to anon, authenticated;\n"
            "insert into public.users (email, name, password_hash, role, is_active, created_at) "
            "values ('rls-owner@example.test', 'RLS', 'x', 'student', true, now());"
        )
        sensitive = (
            "users",
            "attempts",
            "answers",
            "answer_images",
            "point_results",
            "point_reviews",
            "topic_edges",
            "alembic_version",
        )
        user_a = "00000000-0000-4000-8000-00000000000a"
        for role in ("anon", "authenticated"):
            claim = f"set local request.jwt.claim.sub = '{user_a}';" if role == "authenticated" else ""
            for table in sensitive:
                seen = psql(
                    f"begin; {claim} set local role {role}; select count(*) from public.{table}; commit;"
                )
                counts = [line for line in seen.stdout.splitlines() if line.strip().isdigit()]
                check(f"{role}: reads 0 rows from {table}", counts == ["0"], seen.stdout.strip())
            write = psql(
                f"begin; {claim} set local role {role}; "
                "insert into public.alembic_version (version_num) values ('forged'); commit;",
                check=False,
            )
            check(
                f"{role}: insert refused by RLS",
                write.returncode != 0 and "row-level security" in write.stderr,
                write.stderr.strip()[:120],
            )
        # The planner schema is not exposed to the browser roles at all (no USAGE grant).
        for role in ("anon", "authenticated"):
            seen = psql(
                f"begin; set local role {role}; select count(*) from planning.assessment_decisions; commit;",
                check=False,
            )
            check(
                f"{role}: cannot read planning.assessment_decisions",
                seen.returncode != 0 and "permission denied" in seen.stderr,
                (seen.stderr or seen.stdout).strip()[:120],
            )
        owner = psql("select count(*) from public.users where email = 'rls-owner@example.test';")
        check("table owner (service connection) still reads its rows", owner.stdout.strip() == "1")
    except Exception as error:  # noqa: BLE001 - report, then still clean up
        check("smoke run", False, repr(error))
    finally:
        removed = docker("rm", "-f", NAME, check=False).returncode == 0
        check("container removed", removed)

    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'} {name}" + (f"  [{detail}]" if detail and not ok else ""))
    return 0 if all(ok for _, ok, _ in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
