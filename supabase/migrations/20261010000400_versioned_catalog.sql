-- D4 design migration: immutable practical/catalog history and development staging.
-- No application adapter or production activation endpoint uses these tables yet.

create table public.practical_versions (
  id uuid primary key default gen_random_uuid(),
  practical_key text not null,
  practical_version text not null check (practical_version ~ '^\d+\.\d+\.\d+$'),
  source_content_version text not null check (source_content_version ~ '^\d+\.\d+\.\d+$'),
  simulation_definition_version text not null check (simulation_definition_version ~ '^\d+\.\d+\.\d+$'),
  assessment_definition_version text not null check (assessment_definition_version ~ '^\d+\.\d+\.\d+$'),
  knowledge_version text references public.knowledge_versions(knowledge_version),
  experiment_number integer not null check (experiment_number > 0),
  title text not null,
  source_manifest jsonb not null,
  review_metadata jsonb not null,
  simulation_kind text,
  runnable boolean not null default false,
  definition jsonb not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (practical_key, practical_version)
);

create table public.catalog_versions (
  catalog_version text primary key check (catalog_version ~ '^\d+\.\d+\.\d+$'),
  source_manifest_sha256 text not null check (source_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table public.catalog_entries (
  catalog_version text not null references public.catalog_versions(catalog_version),
  practical_version_id uuid not null references public.practical_versions(id),
  primary key (catalog_version, practical_version_id)
);

create table public.active_catalog (
  singleton boolean primary key default true check (singleton),
  catalog_version text not null references public.catalog_versions(catalog_version),
  updated_at timestamptz not null default now()
);

create table public.catalog_audit_events (
  id uuid primary key default gen_random_uuid(),
  catalog_version text not null references public.catalog_versions(catalog_version),
  event_type text not null check (event_type in ('staged', 'activation_proposed', 'activated', 'rolled_back')),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  actor_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Historical practicals and catalog definitions are append-only.
create or replace function public.reject_catalog_history_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'catalog history is immutable (% not allowed)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger practical_versions_no_update before update on public.practical_versions
  for each row execute function public.reject_catalog_history_mutation();
create trigger practical_versions_no_delete before delete on public.practical_versions
  for each row execute function public.reject_catalog_history_mutation();
create trigger catalog_versions_no_update before update on public.catalog_versions
  for each row execute function public.reject_catalog_history_mutation();
create trigger catalog_versions_no_delete before delete on public.catalog_versions
  for each row execute function public.reject_catalog_history_mutation();
create trigger catalog_entries_no_update before update on public.catalog_entries
  for each row execute function public.reject_catalog_history_mutation();
create trigger catalog_entries_no_delete before delete on public.catalog_entries
  for each row execute function public.reject_catalog_history_mutation();
create trigger catalog_audit_events_no_update before update on public.catalog_audit_events
  for each row execute function public.reject_catalog_history_mutation();
create trigger catalog_audit_events_no_delete before delete on public.catalog_audit_events
  for each row execute function public.reject_catalog_history_mutation();

-- At most one active reference is structurally possible. The first activation must insert
-- the singleton row, and later activation must update it in one future transaction.
insert into public.active_catalog(singleton, catalog_version)
select true, catalog_version from public.catalog_versions
where false;

-- Catalog administration is server-only until authenticated, audited activation exists.
-- RLS is enabled without browser-facing policies; the future server adapter must use a
-- narrowly scoped service role or SECURITY DEFINER functions.
alter table public.practical_versions enable row level security;
alter table public.catalog_versions enable row level security;
alter table public.catalog_entries enable row level security;
alter table public.active_catalog enable row level security;
alter table public.catalog_audit_events enable row level security;

revoke all on table public.practical_versions from anon, authenticated;
revoke all on table public.catalog_versions from anon, authenticated;
revoke all on table public.catalog_entries from anon, authenticated;
revoke all on table public.active_catalog from anon, authenticated;
revoke all on table public.catalog_audit_events from anon, authenticated;
