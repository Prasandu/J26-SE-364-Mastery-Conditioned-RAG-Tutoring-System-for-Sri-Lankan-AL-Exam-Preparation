-- Admin records (development admin, D31/D34): imports, practical drafts, user directory and
-- knowledge builds as versioned JSONB records, plus an append-only, hash-chained audit log.
-- Server-side access only: RLS is enabled with no client policies. Uploaded PDFs are never
-- stored here (they stay content-addressed on the server's private disk).

create table public.admin_records (
  kind text not null check (kind in ('imports', 'drafts', 'users', 'knowledge')),
  id text not null check (id ~ '^[0-9a-f]{32}$'),
  version integer not null check (version > 0),
  record jsonb not null,
  integrity text not null check (integrity ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, id),
  constraint admin_records_id_matches check (record ->> 'id' = id),
  constraint admin_records_version_matches check ((record ->> 'version')::integer = version)
);

create index admin_records_kind_created_idx on public.admin_records (kind, created_at, id);

-- Duplicate guard: at most one content-approved draft per experiment number.
create unique index admin_drafts_one_approved_per_number
  on public.admin_records (((record -> 'content' ->> 'experimentNumber')::integer))
  where kind = 'drafts' and record ->> 'status' = 'content_approved';

-- Duplicate guard: one import per source document checksum.
create unique index admin_imports_one_per_document
  on public.admin_records ((record ->> 'sourceSha256'))
  where kind = 'imports';

create table public.admin_audit_events (
  seq bigint primary key check (seq > 0),
  entry jsonb not null,
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint admin_audit_seq_matches check ((entry ->> 'seq')::bigint = seq)
);

create or replace function public.reject_admin_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'admin audit log is append-only (% not allowed)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger admin_audit_no_update before update on public.admin_audit_events
  for each row execute function public.reject_admin_audit_mutation();
create trigger admin_audit_no_delete before delete on public.admin_audit_events
  for each row execute function public.reject_admin_audit_mutation();

alter table public.admin_records enable row level security;
alter table public.admin_audit_events enable row level security;
revoke all on public.admin_records, public.admin_audit_events from anon, authenticated;
