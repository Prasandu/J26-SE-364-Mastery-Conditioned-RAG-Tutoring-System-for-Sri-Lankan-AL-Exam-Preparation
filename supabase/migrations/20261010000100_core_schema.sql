-- M1 core schema: experiments, sessions, append-only action events with idempotency,
-- notebooks and a report cache keyed by the event-chain head fingerprint.
-- Ownership columns map to auth.uid(). Row Level Security is enabled on every table.
-- No vector/embedding objects here: the embedding dimension is verified in Slice 5.
-- Source PDFs are never stored in the database or storage.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'action_events is append-only (% not allowed)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

-- ---------------------------------------------------------------- experiments
create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  experiment_key text not null,
  experiment_number integer not null check (experiment_number > 0),
  definition_version text not null check (definition_version ~ '^\d+\.\d+\.\d+$'),
  assessment_version text not null check (assessment_version ~ '^\d+\.\d+\.\d+$'),
  active boolean not null default true,
  definition jsonb not null,
  assessment jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experiment_key, definition_version, assessment_version)
);
create trigger experiments_updated_at before update on public.experiments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- sessions
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  experiment_id uuid not null references public.experiments (id),
  definition_version text not null,
  assessment_version text not null,
  mode text not null check (mode in ('automatic', 'guided', 'manual')),
  guidance_level text check (guidance_level in ('beginner', 'intermediate', 'advanced')),
  locale text not null check (locale in ('en', 'si')),
  seed bigint not null check (seed between 0 and 4294967295),
  started_on date not null,
  prelab jsonb,
  status text not null default 'active' check (status in ('active', 'submitted')),
  next_sequence integer not null default 0 check (next_sequence >= 0),
  head_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((mode = 'guided') = (guidance_level is not null))
);
create index sessions_owner_idx on public.sessions (owner_id, created_at desc);
create trigger sessions_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- action events (append-only)
create table public.action_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete restrict,
  owner_id uuid not null default auth.uid(),
  sequence_number integer not null check (sequence_number >= 0),
  client_action_id uuid not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  accepted boolean not null,
  fingerprint_before text not null,
  fingerprint_after text not null,
  event jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  constraint action_events_sequence_unique unique (session_id, sequence_number),
  constraint action_events_idempotency_unique unique (session_id, client_action_id)
);
create index action_events_owner_idx on public.action_events (owner_id);
create trigger action_events_no_update before update on public.action_events
  for each row execute function public.reject_mutation();
create trigger action_events_no_delete before delete on public.action_events
  for each row execute function public.reject_mutation();
create trigger action_events_no_truncate before truncate on public.action_events
  for each statement execute function public.reject_mutation();

-- ---------------------------------------------------------------- notebooks
create table public.notebooks (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  version integer not null check (version > 0),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger notebooks_updated_at before update on public.notebooks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- reports (cache)
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  head_fingerprint text not null,
  assessment_version text not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  constraint reports_head_unique unique (session_id, head_fingerprint)
);

-- ---------------------------------------------------------------- row level security
alter table public.experiments enable row level security;
alter table public.sessions enable row level security;
alter table public.action_events enable row level security;
alter table public.notebooks enable row level security;
alter table public.reports enable row level security;

create policy experiments_read on public.experiments
  for select to authenticated using (active);

create policy sessions_owner_select on public.sessions
  for select to authenticated using (owner_id = auth.uid());
create policy sessions_owner_insert on public.sessions
  for insert to authenticated with check (owner_id = auth.uid());
create policy sessions_owner_update on public.sessions
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Events: owners may read and append; no UPDATE/DELETE policies exist (and triggers forbid them).
create policy action_events_owner_select on public.action_events
  for select to authenticated using (owner_id = auth.uid());
create policy action_events_owner_insert on public.action_events
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid())
  );

create policy notebooks_owner_select on public.notebooks
  for select to authenticated using (owner_id = auth.uid());
create policy notebooks_owner_insert on public.notebooks
  for insert to authenticated with check (owner_id = auth.uid());
create policy notebooks_owner_update on public.notebooks
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy reports_owner_select on public.reports
  for select to authenticated using (owner_id = auth.uid());
create policy reports_owner_insert on public.reports
  for insert to authenticated with check (owner_id = auth.uid());
