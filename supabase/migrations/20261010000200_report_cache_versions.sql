-- Report cache keyed by every version that can change a report (zero-solute amendment, D20).
-- A report is reused only for the same session head AND the same engine, definition and
-- assessment versions; a version bump therefore regenerates instead of serving a stale report.

alter table public.reports add column engine_version text not null default 'unknown';
alter table public.reports add column definition_version text not null default 'unknown';
alter table public.reports alter column engine_version drop default;
alter table public.reports alter column definition_version drop default;

alter table public.reports drop constraint reports_head_unique;
alter table public.reports add constraint reports_version_head_unique
  unique (session_id, engine_version, definition_version, assessment_version, head_fingerprint);
