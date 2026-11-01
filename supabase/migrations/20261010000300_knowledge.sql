-- Private knowledge base for the grounded assistant (M1, Experiment 4 approved pages only).
--
-- * Chunk text and embeddings are private derived research data: RLS is enabled with NO client
--   policies and all client privileges are revoked. Only the server (service connection) reads them.
-- * Exact cosine search only: B-tree indexes, no HNSW / IVFFlat (the corpus is tiny; D22).
-- * One explicitly active knowledge version; older versions are kept, never deleted automatically.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table public.knowledge_versions (
  knowledge_version text primary key,
  embedding_model text not null,
  model_revision text not null,
  dimension integer not null check (dimension = 384),
  chunk_count integer not null check (chunk_count >= 0),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- At most one active version (partial unique B-tree index).
create unique index knowledge_versions_one_active on public.knowledge_versions (is_active) where is_active;

create table public.knowledge_chunks (
  id bigint generated always as identity primary key,
  chunk_id text not null check (chunk_id ~ '^kc_[0-9a-f]{20}$'),
  knowledge_version text not null references public.knowledge_versions (knowledge_version),
  source_id text not null,
  document_title text not null,
  edition text not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_page integer not null check (pdf_page > 0),
  printed_page integer not null check (printed_page > 0),
  unit text not null,
  section text not null,
  heading text not null,
  headings text[] not null,
  language text not null check (language = 'en'),
  experiment_id text,
  in_scope boolean not null,
  ordinal integer not null check (ordinal >= 0),
  content text not null,
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  token_count integer not null check (token_count between 1 and 512),
  extractor_version text not null,
  embedding_model text not null,
  model_revision text not null,
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now(),
  constraint knowledge_chunks_version_model_unique unique (chunk_id, knowledge_version, embedding_model)
);

create index knowledge_chunks_version_scope_idx on public.knowledge_chunks (knowledge_version, in_scope);
create index knowledge_chunks_version_heading_idx on public.knowledge_chunks (knowledge_version, heading);

alter table public.knowledge_versions enable row level security;
alter table public.knowledge_chunks enable row level security;
-- No policies: browser clients (anon / authenticated) can never read chunk text or embeddings.
revoke all on table public.knowledge_versions from anon, authenticated;
revoke all on table public.knowledge_chunks from anon, authenticated;
