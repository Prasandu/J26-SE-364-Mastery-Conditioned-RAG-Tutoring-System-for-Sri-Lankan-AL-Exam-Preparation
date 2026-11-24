"""Apply supabase/migrations to a LOCAL PostgreSQL (development only).

* Reads LAB_DATABASE_URL (environment or the untracked .env). Refuses any host that is not this
  computer, so it can never touch a hosted or production database.
* Records applied migrations with their SHA-256 in public.schema_migrations; a migration whose
  file changed after it was applied stops the run instead of being re-applied.
* On plain PostgreSQL (no Supabase stack) it first installs the minimal `auth.uid()` function and
  the `anon` / `authenticated` roles the migrations reference. A Supabase stack already has them.

Usage: uv run --project apps/api python scripts/db/apply_migrations.py
"""

import hashlib
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "api"))

SUPABASE_STANDIN = """
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;
grant usage on schema public, auth to authenticated, anon;
"""


def main() -> int:
    import psycopg

    from app.settings import Settings

    settings = Settings()
    if settings.database_url is None or not settings.database_url.get_secret_value():
        print("LAB_DATABASE_URL is not set (put it in the untracked .env).")
        return 2
    dsn = settings.database_url.get_secret_value()
    host = urlsplit(dsn).hostname
    if host not in ("127.0.0.1", "localhost", "::1"):
        print("Refusing: this helper only migrates a database on this computer.")
        return 2
    migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    with psycopg.connect(dsn, autocommit=True) as conn:
        has_auth = conn.execute(
            "select exists (select 1 from pg_namespace where nspname = 'auth')"
        ).fetchone()
        if not (has_auth and has_auth[0]):
            conn.execute(SUPABASE_STANDIN)
            print("installed the local stand-in for Supabase auth (plain PostgreSQL)")
        conn.execute(
            "create table if not exists public.schema_migrations ("
            " name text primary key, sha256 text not null,"
            " applied_at timestamptz not null default now())"
        )
        applied = dict(conn.execute("select name, sha256 from public.schema_migrations").fetchall())
        for path in migrations:
            body = path.read_text(encoding="utf-8")
            sha = hashlib.sha256(body.encode("utf-8")).hexdigest()
            if path.name in applied:
                if applied[path.name] != sha:
                    print(f"STOP: {path.name} changed after it was applied; write a new migration.")
                    return 1
                print(f"skip   {path.name}")
                continue
            with conn.transaction():
                conn.execute(body)
                conn.execute(
                    "insert into public.schema_migrations (name, sha256) values (%s, %s)",
                    (path.name, sha),
                )
            print(f"apply  {path.name}")
    print("database is up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
