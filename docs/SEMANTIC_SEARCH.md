# Semantic Search (Phase 4)

Meaning-based search over proposal content using Azure OpenAI embeddings +
pgvector. Until the setup below is done, the Proposals search box transparently
falls back to title/client substring matching — nothing breaks.

## How it works

- On proposal **create** and **AI generate**, the API computes an embedding of
  `title + content` and stores it in `Proposal.embedding` (best-effort).
- `GET /api/proposals/search?q=...` embeds the query and ranks proposals by
  cosine similarity via the `match_proposals` Postgres function, scoped to the
  caller's company (admins see all).
- The frontend (`src/pages/Proposals.tsx`) calls this when the query is ≥3 chars
  and ranks by similarity; if the endpoint reports `available:false`, it uses the
  substring filter instead.

Code: `src/api/lib/embeddings.ts`, search route in `src/api/proposals.ts`,
`proposalsApi.search` in `src/lib/api-client.ts`.

## One-time setup

1. **Configure the embedding deployment** in `.env`:
   ```
   AZURE_OPENAI_EMBEDDING_DEPLOYMENT="text-embedding-ada-002"
   ```
   (Endpoint + key are shared with the existing Azure OpenAI config.)

2. **Run the SQL migration** against your Supabase Postgres — Supabase Studio →
   SQL editor, or psql. This enables pgvector, adds the `embedding` column + an
   index, and creates the `match_proposals` function:
   ```
   prisma/manual/semantic_search.sql
   ```

3. **Backfill embeddings** for existing proposals:
   ```bash
   npm run backfill:embeddings
   ```

4. Restart the API. New proposals embed automatically; search now ranks by
   meaning.

## Notes

- `text-embedding-ada-002` → 1536-dim vectors. If you switch models, update the
  dimension in both the SQL (`vector(1536)`) and `EMBEDDING_DIM` in
  `src/api/lib/embeddings.ts`.
- The `ivfflat` index `lists` parameter (default 100) should grow roughly with
  `rows / 1000` for best recall/speed.
- `Proposal.embedding` is declared in `schema.prisma` as
  `Unsupported("vector(1536)")` for documentation; the column is actually created
  by the manual SQL migration (the runtime uses the Supabase REST client, not the
  Prisma client, for data access).
