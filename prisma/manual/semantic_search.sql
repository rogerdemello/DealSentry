-- Semantic search setup (Phase 4). Run ONCE against your Supabase Postgres
-- (Supabase Studio → SQL editor, or psql). Idempotent / safe to re-run.
--
-- After running this, restart the API and run the backfill:
--   npm run backfill:embeddings
-- New/updated proposals embed automatically on create.

-- 1. pgvector extension
create extension if not exists vector;

-- 2. Embedding column on Proposal. 1536 dims = Azure text-embedding-ada-002, and
--    Gemini gemini-embedding-001 requested at 1536 dimensions (see
--    src/api/lib/embeddings.ts). Changing model width means changing this and
--    EMBEDDING_DIM together.
alter table "Proposal" add column if not exists embedding vector(1536);

-- 2b. Tenant column referenced by match_proposals below. The API writes it
--     conditionally (only for users with a companyId), so it must exist even
--     on databases that predate company scoping.
alter table "Proposal" add column if not exists company_id text;

-- 3. Approximate-nearest-neighbour index (cosine distance).
--    HNSW needs no training step and keeps good recall on small tables. The
--    previous ivfflat index (lists = 100) probes a single list by default, so on
--    a table with only a handful of rows it can return few or no matches.
--    Requires pgvector >= 0.5 (Supabase ships 0.8). Safe to re-run: this replaces
--    the old ivfflat index if present.
drop index if exists proposal_embedding_idx;
create index if not exists proposal_embedding_hnsw_idx
  on "Proposal" using hnsw (embedding vector_cosine_ops);

-- 4. Similarity search function used by GET /api/proposals/search.
--    filter_company NULL => no company filter (admins see all).
create or replace function match_proposals(
  query_embedding vector(1536),
  match_count int default 20,
  filter_company text default null
)
returns table (id text, similarity float)
language sql stable
as $$
  select p.id, 1 - (p.embedding <=> query_embedding) as similarity
  from "Proposal" p
  where p.embedding is not null
    and (filter_company is null or p.company_id::text = filter_company)
  order by p.embedding <=> query_embedding
  limit match_count;
$$;
