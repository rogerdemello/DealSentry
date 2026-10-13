# Semantic Search (Phase 4)

Meaning-based search over proposal content using AI embeddings + pgvector.
Until the setup below is done, the Proposals search box transparently falls
back to title/client substring matching — nothing breaks.

## How it works

- On proposal **create** and **AI generate**, the API computes an embedding of
  `title + content` and stores it in `Proposal.embedding` (best-effort).
- `GET /api/proposals/search?q=...` embeds the query and ranks proposals by
  cosine similarity via the `match_proposals` Postgres function, scoped to the
  caller's company (admins see all; in login mode a user with no company sees
  only their own proposals).
- The frontend (`src/pages/Proposals.tsx`) calls this when the query is ≥3 chars
  and ranks by similarity; if the endpoint reports `available:false`, it uses the
  substring filter instead.

Code: `src/api/lib/embeddings.ts`, search route in `src/api/proposals.ts`,
`proposalsApi.search` in `src/lib/api-client.ts`.

## Embedding provider

`src/api/lib/embeddings.ts` picks the provider from the environment, exactly
like chat completions do:

| Set | Embeddings come from |
| --- | --- |
| `GEMINI_API_KEY` | Google `gemini-embedding-001`, requested at 1536 dimensions (override with `GEMINI_EMBEDDING_MODEL`) |
| otherwise Azure OpenAI vars | the `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` deployment (default `text-embedding-ada-002`, 1536 dimensions) |

Vectors are normalised to unit length. A response that is not exactly 1536
numbers is rejected (and search degrades) rather than stored.

> **Every instance that shares a database must use the same embedding model.**
> Vectors from different models are not comparable, so a table that mixes them
> ranks nonsensically. After switching provider or model, re-embed everything
> with `npm run backfill:embeddings -- --all`.

## One-time setup

1. **Configure a provider** in `.env` (`GEMINI_API_KEY=...`, or the Azure variables
   including `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`).

2. **Run the SQL migration** against your Supabase Postgres — Supabase Studio →
   SQL editor, or psql. This enables pgvector, adds the `embedding` column, an
   HNSW index, and the `match_proposals` function:
   ```bash
   npx prisma db execute --file prisma/manual/semantic_search.sql
   ```
   Re-running it is safe, and it replaces an older `ivfflat` index with HNSW
   (the ivfflat default probes one list, so on a small table it can return few
   or no matches).

3. **Backfill embeddings** for existing proposals:
   ```bash
   npm run backfill:embeddings            # only proposals that have none yet
   npm run backfill:embeddings -- --all   # re-embed everything (after a provider change)
   ```

4. Restart the API. New proposals embed automatically; search now ranks by
   meaning.

## Notes

- 1536 dimensions is fixed by the `vector(1536)` column and `EMBEDDING_DIM` in
  `src/api/lib/embeddings.ts`. If you switch to a model with a different width,
  change both together (and re-run the SQL and a full backfill).
- HNSW needs pgvector ≥ 0.5 (Supabase ships 0.8).
- `Proposal.embedding` is declared in `schema.prisma` as
  `Unsupported("vector(1536)")` for documentation; the column is actually created
  by the manual SQL migration (the runtime uses the Supabase REST client, not the
  Prisma client, for data access).
- Free-tier Gemini keys are rate limited; the backfill pauses 250 ms between calls.
