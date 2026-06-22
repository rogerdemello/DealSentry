-- Semantic search setup (Phase 4). Run ONCE against your Supabase Postgres
-- (Supabase Studio → SQL editor, or psql). Idempotent / safe to re-run.
--
-- After running this, restart the API and run the backfill:
--   npm run backfill:embeddings
-- New/updated proposals embed automatically on create.

-- 1. pgvector extension
create extension if not exists vector;

-- 2. Embedding column on Proposal (text-embedding-ada-002 => 1536 dims)
alter table "Proposal" add column if not exists embedding vector(1536);

-- 3. Approximate-nearest-neighbour index (cosine distance).
--    Tune `lists` upward as the table grows (≈ rows/1000).
create index if not exists proposal_embedding_idx
  on "Proposal" using ivfflat (embedding vector_cosine_ops) with (lists = 100);

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
