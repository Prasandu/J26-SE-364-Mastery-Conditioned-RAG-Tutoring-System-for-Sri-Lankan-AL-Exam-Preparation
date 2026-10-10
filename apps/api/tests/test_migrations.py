"""Static checks of the Supabase migrations.

Execution against PostgreSQL is verified separately by scripts/db/migration_smoke.py.
"""

import re

from app.settings import REPO_ROOT

MIGRATIONS = sorted((REPO_ROOT / "supabase" / "migrations").glob("*.sql"))
SQL = "\n".join(p.read_text(encoding="utf-8") for p in MIGRATIONS).lower()
CODE = "\n".join(line for line in SQL.splitlines() if not line.strip().startswith("--"))
TABLES = ("experiments", "sessions", "action_events", "notebooks", "reports")
KNOWLEDGE_TABLES = ("knowledge_versions", "knowledge_chunks")


def test_migrations_are_versioned() -> None:
    assert MIGRATIONS
    for path in MIGRATIONS:
        assert re.match(r"^\d{14}_[a-z0-9_]+\.sql$", path.name), path.name


def test_expected_tables_exist() -> None:
    for table in TABLES + KNOWLEDGE_TABLES:
        assert f"create table public.{table} (" in CODE


def test_row_level_security_enabled_everywhere() -> None:
    for table in TABLES + KNOWLEDGE_TABLES:
        assert f"alter table public.{table} enable row level security;" in CODE


def test_owner_scoped_policies_use_auth_uid() -> None:
    for table in ("sessions", "action_events", "notebooks", "reports"):
        pattern = (
            rf"create policy \w+ on public\.{table}\s+for select to authenticated"
            r" using \(owner_id = auth\.uid\(\)\)"
        )
        assert re.search(pattern, CODE), table


def test_uniqueness_and_idempotency_constraints() -> None:
    assert "unique (session_id, sequence_number)" in CODE
    assert "unique (session_id, client_action_id)" in CODE
    versions = "engine_version, definition_version, assessment_version, head_fingerprint"
    assert f"unique (session_id, {versions})" in CODE
    assert "drop constraint reports_head_unique" in CODE


def test_action_events_are_append_only() -> None:
    assert "before update on public.action_events" in CODE
    assert "before delete on public.action_events" in CODE
    assert not re.search(r"create policy \w+ on public\.action_events\s+for (update|delete)", CODE)


def test_knowledge_tables_are_private_and_exact_search_only() -> None:
    assert "embedding extensions.vector(384) not null" in CODE
    assert "unique (chunk_id, knowledge_version, embedding_model)" in CODE
    for table in KNOWLEDGE_TABLES:
        assert not re.search(rf"create policy \w+ on public\.{table}\b", CODE), table
        assert f"revoke all on table public.{table} from anon, authenticated;" in CODE
    # B-tree only: no approximate vector index of any kind.
    assert not re.search(r"\b(hnsw|ivfflat)\b", CODE)
    assert not re.search(r"using\s+(gin|gist|hnsw|ivfflat)", CODE)
    # Vectors appear only in the knowledge migration.
    for path in MIGRATIONS:
        if "knowledge" not in path.name:
            lines = path.read_text(encoding="utf-8").lower().splitlines()
            code = [line for line in lines if not line.strip().startswith("--")]
            assert not any("vector" in line for line in code), path.name


def test_no_source_documents() -> None:
    assert ".pdf" not in CODE
    assert "storage." not in CODE
