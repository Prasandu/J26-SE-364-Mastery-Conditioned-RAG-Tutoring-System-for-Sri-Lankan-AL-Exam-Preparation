"""Read-only verification of a live (Supabase) database for the integrated system.

    VERIFY_DATABASE_URL=... python scripts/db/verify_live_database.py
    python scripts/db/verify_live_database.py --env-var MY_DB_URL

Connects with a READ ONLY session (every statement is a SELECT; the server rejects any
write) and checks, against what this repository's migrations say:

- each service's Alembic head (assessment in public, planning, support);
- row-level security on every table in `public` (Supabase exposes it to anon/authenticated);
- that anon/authenticated cannot use the planning or support schemas;
- the pgvector extension;
- class-roster and legacy AI-mark readiness, as counts only.

Never prints the connection string, credentials, or any student data - only check names,
PASS/FAIL and counts. Exit code 1 when a required check fails. It does not migrate,
back up or change anything; see docs/engineering/SUPABASE_GO_LIVE.md for the steps that do.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = {
    "assessment": (ROOT / "assessment-service" / "migrations" / "versions", "public"),
    "planning": (ROOT / "planning-service" / "migrations" / "versions", "planning"),
    "support": (
        ROOT / "chemistry-tutor" / "support-service" / "migrations" / "versions",
        "support",
    ),
}
REVISION = re.compile(r"^revision(?:\s*:\s*[^=]+)?\s*=\s*['\"]([^'\"]+)['\"]", re.MULTILINE)
DOWN = re.compile(r"^down_revision(?:\s*:\s*[^=]+)?\s*=\s*['\"]([^'\"]+)['\"]", re.MULTILINE)


def repo_head(folder: Path) -> str:
    """The one revision no other migration builds on."""
    revisions, parents = set(), set()
    for path in folder.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        if match := REVISION.search(text):
            revisions.add(match.group(1))
        if match := DOWN.search(text):
            parents.add(match.group(1))
    heads = sorted(revisions - parents)
    if len(heads) != 1:
        raise SystemExit(f"{folder}: expected one head, found {heads}")
    return heads[0]


def run(url: str) -> list[dict[str, object]]:
    import psycopg

    url = re.sub(r"^postgresql\+psycopg://", "postgresql://", url)
    checks: list[dict[str, object]] = []

    def check(
        name: str, ok: bool, detail: object = None, required: bool = True
    ) -> None:
        checks.append(
            {"check": name, "ok": bool(ok), "required": required, "detail": detail}
        )

    with psycopg.connect(
        url, connect_timeout=10, options="-c default_transaction_read_only=on"
    ) as conn:
        cur = conn.cursor()

        def rows(sql: str, params: tuple = ()) -> list[tuple]:
            cur.execute(sql, params)
            return cur.fetchall()

        check("session is read-only", rows("SHOW transaction_read_only") == [("on",)])
        for service, (folder, schema) in MIGRATIONS.items():
            expected = repo_head(folder)
            present = rows(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = %s AND table_name = 'alembic_version'",
                (schema,),
            )
            current = (
                rows(f'SELECT version_num FROM "{schema}".alembic_version')
                if present
                else []
            )
            found = [row[0] for row in current]
            check(
                f"{service}: migrated to the repository head",
                found == [expected],
                {"expected": expected, "found": found},
            )

        no_rls = [
            r[0]
            for r in rows(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity"
            )
        ]
        check(
            "every public table has row-level security",
            not no_rls,
            {"without_rls": no_rls},
        )

        roles = {
            r[0]
            for r in rows(
                "SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')"
            )
        }
        for role in sorted(roles):
            for schema in ("planning", "support"):
                exists = rows(
                    "SELECT 1 FROM pg_namespace WHERE nspname = %s", (schema,)
                )
                usable = (
                    rows("SELECT has_schema_privilege(%s, %s, 'USAGE')", (role, schema))
                    if exists
                    else [(False,)]
                )
                check(f"{role} cannot use schema {schema}", not usable[0][0])
        check(
            "Supabase roles present",
            roles == {"anon", "authenticated"},
            sorted(roles),
            required=False,
        )
        check(
            "pgvector extension installed",
            rows("SELECT count(*) FROM pg_extension WHERE extname = 'vector'")
            == [(1,)],
        )

        if rows(
            "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='classes'"
        ):
            classes = rows(
                "SELECT count(*) FROM public.classes WHERE archived_at IS NULL"
            )[0][0]
            teachers_without = rows(
                "SELECT count(*) FROM public.users u WHERE u.role IN ('teacher') AND NOT EXISTS "
                "(SELECT 1 FROM public.class_teachers t WHERE t.user_id = u.id)"
            )[0][0]
            check(
                "class rosters set up (teachers see no scripts until they are)",
                classes > 0,
                {
                    "active_classes": classes,
                    "teachers_without_a_class": teachers_without,
                },
                required=False,
            )
        if rows(
            "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='point_results'"
        ):
            pending = rows(
                "SELECT count(*) FROM public.point_results WHERE method = 'llm' AND status IN ('awarded','not_awarded')"
            )[0][0]
            check(
                "no AI-only decision still counted as a mark",
                pending == 0,
                {
                    "ai_only_decisions": pending,
                    "fix": "python -m app.reconcile_legacy_ai_marks (dry run first)",
                },
                required=False,
            )
    return checks


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--env-var",
        default="VERIFY_DATABASE_URL",
        help="Environment variable holding the URL",
    )
    args = parser.parse_args(argv)
    url = os.environ.get(args.env_var, "")
    if not url:
        print(json.dumps({"ok": False, "error": f"{args.env_var} is not set"}))
        return 2
    try:
        checks = run(url)
    except Exception as exc:  # noqa: BLE001 - report the type only: messages can echo the URL
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"could not complete the checks ({type(exc).__name__})",
                }
            )
        )
        return 2
    failed = [c for c in checks if c["required"] and not c["ok"]]
    print(json.dumps({"ok": not failed, "checks": checks}, indent=2, default=str))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
