"""Disposable PostgreSQL smoke test for supabase/migrations (no real Supabase credentials).

Starts a uniquely named pgvector/PostgreSQL 16 container (port published on 127.0.0.1 only, random
host port), installs a minimal mock of the Supabase `auth` schema and `anon`/`authenticated` roles,
applies every migration, checks constraints, append-only protection, owner-scoped RLS, the private
knowledge tables (no client access, no approximate vector index) and runs the Postgres
KnowledgeRepository against synthetic chunks; then removes only that container.

Usage: uv run --project apps/api python scripts/db/migration_smoke.py
"""

import dataclasses
import secrets
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "api"))
IMAGE = "pgvector/pgvector:pg16"
NAME = f"vlab-migration-smoke-{secrets.token_hex(4)}"

MOCK_SUPABASE = """
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

USER_A = "00000000-0000-4000-8000-00000000000a"
USER_B = "00000000-0000-4000-8000-00000000000b"
FP = "a" * 14
SHA = "b" * 64

CHECKS = f"""
grant select, insert, update, delete on public.experiments, public.sessions, public.action_events,
  public.notebooks, public.reports to authenticated;
insert into public.experiments (id, experiment_key, experiment_number, definition_version, assessment_version, definition, assessment)
values ('10000000-0000-4000-8000-000000000001', 'exp04_standard_solution', 4, '1.0.0', '1.0.0', '{{}}', '{{}}');
insert into public.sessions (id, owner_id, experiment_id, definition_version, assessment_version, mode, guidance_level, locale, seed, started_on, head_fingerprint)
values ('20000000-0000-4000-8000-00000000000a', '{USER_A}', '10000000-0000-4000-8000-000000000001', '1.0.0', '1.0.0', 'manual', null, 'en', 42, '2026-10-10', '{FP}'),
       ('20000000-0000-4000-8000-00000000000b', '{USER_B}', '10000000-0000-4000-8000-000000000001', '1.0.0', '1.0.0', 'manual', null, 'si', 7, '2026-10-10', '{FP}');
insert into public.action_events (session_id, owner_id, sequence_number, client_action_id, payload_sha256, accepted, fingerprint_before, fingerprint_after, event, response)
values ('20000000-0000-4000-8000-00000000000a', '{USER_A}', 0, '30000000-0000-4000-8000-000000000001', '{SHA}', true, '{FP}', '{FP}', '{{}}', '{{}}');
"""

DUPLICATE_REPORT = f"""insert into public.reports (session_id, owner_id, head_fingerprint, engine_version, definition_version, assessment_version, report)
values ('20000000-0000-4000-8000-00000000000a', '{USER_A}', '{FP}', '0.2.0', '1.1.0', '1.0.0', '{{}}');"""

REPORT_VERSIONS = f"""
insert into public.reports (session_id, owner_id, head_fingerprint, engine_version, definition_version, assessment_version, report)
values ('20000000-0000-4000-8000-00000000000a', '{USER_A}', '{FP}', '0.1.0', '1.0.0', '1.0.0', '{{}}'),
       ('20000000-0000-4000-8000-00000000000a', '{USER_A}', '{FP}', '0.2.0', '1.1.0', '1.0.0', '{{}}');
"""

EXPECT_FAIL = {
    "duplicate sequence": f"""insert into public.action_events (session_id, owner_id, sequence_number, client_action_id, payload_sha256, accepted, fingerprint_before, fingerprint_after, event, response)
values ('20000000-0000-4000-8000-00000000000a', '{USER_A}', 0, '30000000-0000-4000-8000-000000000099', '{SHA}', true, '{FP}', '{FP}', '{{}}', '{{}}');""",
    "duplicate client action id": f"""insert into public.action_events (session_id, owner_id, sequence_number, client_action_id, payload_sha256, accepted, fingerprint_before, fingerprint_after, event, response)
values ('20000000-0000-4000-8000-00000000000a', '{USER_A}', 1, '30000000-0000-4000-8000-000000000001', '{SHA}', true, '{FP}', '{FP}', '{{}}', '{{}}');""",
    "event update": "update public.action_events set accepted = false;",
    "event delete": "delete from public.action_events;",
    "guided without level": f"""insert into public.sessions (owner_id, experiment_id, definition_version, assessment_version, mode, guidance_level, locale, seed, started_on, head_fingerprint)
values ('{USER_A}', '10000000-0000-4000-8000-000000000001', '1.0.0', '1.0.0', 'guided', null, 'en', 1, '2026-10-10', '{FP}');""",
    "wrong vector dimension": "select '[1,2,3]'::extensions.vector(384);",
}

RLS_AS_A = f"""
set role authenticated;
select set_config('request.jwt.claim.sub', '{USER_A}', false);
select count(*) from public.sessions;
"""

RLS_INSERT_FOR_B = f"""
set role authenticated;
select set_config('request.jwt.claim.sub', '{USER_A}', false);
insert into public.sessions (owner_id, experiment_id, definition_version, assessment_version, mode, guidance_level, locale, seed, started_on, head_fingerprint)
values ('{USER_B}', '10000000-0000-4000-8000-000000000001', '1.0.0', '1.0.0', 'manual', null, 'en', 1, '2026-10-10', '{FP}');
"""

KNOWLEDGE_AS = """
set role {role};
select count(*) from public.knowledge_chunks;
"""


def docker(
    *args: str, input_text: str | None = None, check: bool = True
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603 - fixed docker argv
        ["docker", *args], input=input_text, capture_output=True, text=True, check=check
    )


def psql(sql: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return docker(
        "exec",
        "-i",
        NAME,
        "psql",
        "-U",
        "postgres",
        "-d",
        "lab",
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        input_text=sql,
        check=check,
    )


def repository_checks(dsn: str) -> list[tuple[str, bool, str]]:
    """Postgres KnowledgeRepository against synthetic chunks (fake embeddings; never the PDFs)."""
    from app.knowledge.models import KnowledgeChunk
    from app.rag.embeddings import FakeEmbeddingProvider
    from app.rag.repository import (
        InMemoryKnowledgeRepository,
        KnowledgeUnavailable,
        KnowledgeVersion,
        PostgresKnowledgeRepository,
    )

    fake = FakeEmbeddingProvider()
    texts = [
        ("Procedure:", True, "Weigh 26.5 g of Na2CO3 on a watch glass."),
        ("Procedure:", True, "Transfer the solid to the volumetric flask using a funnel."),
        ("Use of volumetric flask", True, "Make up to the mark so the meniscus touches the mark."),
        ("Nuclear rules", False, "Balance mass numbers and atomic numbers."),
    ]
    chunks = []
    for i, (heading, in_scope, text) in enumerate(texts):
        [vector] = fake.embed_passages([text])
        chunks.append(
            KnowledgeChunk(
                chunk_id=f"kc_{i:020x}",
                knowledge_version="kb-smoke",
                source_id="synthetic",
                document_title="Synthetic",
                edition="test",
                document_sha256="d" * 64,
                pdf_page=1 + i,
                printed_page=1 + i,
                unit="U",
                section="S",
                heading=heading,
                headings=(heading,),
                language="en",
                experiment_id=None,
                in_scope=in_scope,
                ordinal=0,
                text=text,
                text_sha256=f"{i:064x}",
                token_count=20,
                extractor_version="x",
                embedding_model=fake.model_id,
                model_revision=fake.revision,
                embedding=vector,
            )
        )
    version = KnowledgeVersion("kb-smoke", fake.model_id, fake.revision, 384, len(chunks), "e" * 64)
    pg, mem = PostgresKnowledgeRepository(dsn), InMemoryKnowledgeRepository()
    out: list[tuple[str, bool, str]] = []
    first, second = pg.ingest(version, chunks), pg.ingest(version, chunks)
    mem.ingest(version, chunks)
    out.append(("repository: idempotent ingestion", (first, second) == (4, 0), f"{first},{second}"))
    out.append(("repository: no active version until set", pg.active() is None, ""))
    pg.set_active("kb-smoke")
    mem.set_active("kb-smoke")
    out.append(("repository: explicit active version", pg.active() == version, repr(pg.active())))
    try:
        pg.set_active("kb-missing")
        out.append(("repository: unknown version rejected", False, ""))
    except KnowledgeUnavailable:
        out.append(("repository: unknown version rejected", pg.active() == version, ""))
    [query] = fake.embed_queries(["How do I transfer the solid with a funnel?"])
    pg_hits = [(c.chunk_id, round(s, 5)) for c, s in pg.vector_search("kb-smoke", query, 8)]
    mem_hits = [(c.chunk_id, round(s, 5)) for c, s in mem.vector_search("kb-smoke", query, 8)]
    out.append(
        (
            "repository: exact cosine matches in-memory order",
            pg_hits == mem_hits,
            f"{pg_hits} vs {mem_hits}",
        )
    )
    out.append(("repository: out-of-scope chunks excluded", len(pg_hits) == 3, str(len(pg_hits))))
    stored, expected = pg.chunks("kb-smoke"), mem.chunks("kb-smoke")
    same_fields = [dataclasses.replace(c, embedding=None) for c in stored] == [
        dataclasses.replace(c, embedding=None) for c in expected
    ]
    # pgvector stores float32: compare vectors with a tolerance, everything else exactly.
    close = all(
        max(abs(a - b) for a, b in zip(x.embedding or (), y.embedding or (), strict=True)) < 1e-6
        for x, y in zip(stored, expected, strict=True)
    )
    out.append(("repository: chunk round trip", same_fields and close, ""))
    return out


def main() -> int:
    results: list[tuple[str, bool, str]] = []
    docker(
        "run",
        "-d",
        "--rm",
        "--name",
        NAME,
        "-p",
        "127.0.0.1::5432",
        "-e",
        "POSTGRES_PASSWORD=smoke",
        "-e",
        "POSTGRES_DB=lab",
        IMAGE,
    )
    try:
        for _ in range(60):
            if (
                docker(
                    "exec", NAME, "pg_isready", "-U", "postgres", "-d", "lab", check=False
                ).returncode
                == 0
            ):
                break
            time.sleep(1)
        time.sleep(2)
        psql(MOCK_SUPABASE)
        for migration in sorted((ROOT / "supabase" / "migrations").glob("*.sql")):
            psql(migration.read_text(encoding="utf-8"))
            results.append((f"apply {migration.name}", True, ""))

        tables = psql(
            "select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname='public';"
        )
        expected = "action_events,experiments,knowledge_chunks,knowledge_versions,notebooks,reports,sessions"
        results.append(("tables", tables.stdout.strip() == expected, tables.stdout.strip()))
        rls = psql(
            "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;"
        )
        results.append(("rls enabled on 7 tables", rls.stdout.strip() == "7", rls.stdout.strip()))
        idx = psql(
            "select count(*) from pg_indexes where schemaname='public' and indexname in ('action_events_sequence_unique','action_events_idempotency_unique','reports_version_head_unique','sessions_owner_idx','knowledge_chunks_version_model_unique','knowledge_versions_one_active');"
        )
        results.append(
            ("unique constraints and indexes", idx.stdout.strip() == "6", idx.stdout.strip())
        )
        dim = psql(
            "select format_type(atttypid, atttypmod) from pg_attribute where attrelid='public.knowledge_chunks'::regclass and attname='embedding';"
        )
        results.append(
            (
                "embedding is vector(384)",
                dim.stdout.strip().endswith("vector(384)"),
                dim.stdout.strip(),
            )
        )
        methods = psql(
            "select coalesce(string_agg(distinct am.amname, ','), '') from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_am am on am.oid=c.relam where n.nspname='public' and c.relkind='i';"
        )
        results.append(
            (
                "B-tree indexes only (no HNSW/IVFFlat)",
                methods.stdout.strip() == "btree",
                methods.stdout.strip(),
            )
        )
        policies = psql("select count(*) from pg_policies where tablename like 'knowledge_%';")
        results.append(
            (
                "knowledge tables have no client policies",
                policies.stdout.strip() == "0",
                policies.stdout.strip(),
            )
        )

        psql(CHECKS)
        results.append(("seed rows insert", True, ""))
        for label, sql in EXPECT_FAIL.items():
            outcome = psql(sql, check=False)
            results.append((f"rejects {label}", outcome.returncode != 0, ""))
        visible = psql(RLS_AS_A)
        results.append(
            (
                "RLS: owner A sees only own session",
                visible.stdout.strip().splitlines()[-1] == "1",
                visible.stdout.strip(),
            )
        )
        forged = psql(RLS_INSERT_FOR_B, check=False)
        results.append(
            ("RLS: cannot insert a session owned by another user", forged.returncode != 0, "")
        )
        for role in ("anon", "authenticated"):
            client = psql(KNOWLEDGE_AS.format(role=role), check=False)
            results.append(
                (
                    f"{role} cannot read knowledge chunks",
                    client.returncode != 0,
                    client.stdout.strip(),
                )
            )
        versions = psql(REPORT_VERSIONS, check=False)
        results.append(
            (
                "report cache: one row per version set",
                versions.returncode == 0,
                versions.stderr.strip(),
            )
        )
        duplicate = psql(DUPLICATE_REPORT, check=False)
        results.append(("rejects duplicate versioned report", duplicate.returncode != 0, ""))

        port = docker("port", NAME, "5432/tcp").stdout.strip().splitlines()[0].rsplit(":", 1)[1]
        results.extend(repository_checks(f"postgresql://postgres:smoke@127.0.0.1:{port}/lab"))
    finally:
        docker("rm", "-f", NAME, check=False)

    ok = all(passed for _, passed, _ in results)
    for label, passed, info in results:
        print(
            f"{'PASS' if passed else 'FAIL'} {label}{(' — ' + info) if info and not passed else ''}"
        )
    remaining = docker(
        "ps", "-a", "--filter", f"name={NAME}", "--format", "{{.Names}}", check=False
    ).stdout.strip()
    print(f"container removed: {remaining == ''}")
    return 0 if ok and remaining == "" else 1


if __name__ == "__main__":
    sys.exit(main())
