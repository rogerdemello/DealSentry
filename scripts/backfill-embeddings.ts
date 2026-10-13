/**
 * Backfill content embeddings for existing proposals (Phase 4 semantic search).
 *
 * Prerequisite: run prisma/manual/semantic_search.sql first (adds the pgvector
 * column + index + RPC). Then:
 *
 *   npm run backfill:embeddings              # only proposals with no embedding yet
 *   npm run backfill:embeddings -- --all     # re-embed everything
 *
 * Use --all after switching embedding provider/model (e.g. Azure ada-002 ->
 * Gemini): vectors from different models are not comparable, so a mixed table
 * gives meaningless rankings.
 *
 * Idempotent: without --all, proposals that already have an embedding are skipped.
 */

import { config } from 'dotenv';
config();

import { supabase } from '../src/lib/supabase';
import { generateEmbedding } from '../src/api/lib/embeddings';

const reembedAll = process.argv.includes('--all');
/** Pause between provider calls to stay under free-tier rate limits. */
const THROTTLE_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { data: rows, error } = await supabase
    .from('Proposal')
    .select('id, title, content, embedding');

  if (error) {
    console.error('Failed to load proposals (did you run the SQL migration?):', error.message);
    process.exit(1);
  }

  console.log(`${rows?.length ?? 0} proposal(s); mode: ${reembedAll ? 're-embed all' : 'fill missing only'}`);

  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of rows || []) {
    if (p.embedding && !reembedAll) {
      skipped++;
      continue;
    }
    const vector = await generateEmbedding(`${p.title}\n\n${p.content}`);
    if (!vector) {
      console.warn(`No embedding produced for ${p.id}; skipping.`);
      failed++;
      continue;
    }
    const { error: upErr } = await supabase.from('Proposal').update({ embedding: vector }).eq('id', p.id);
    if (upErr) {
      console.error(`Update failed for ${p.id}:`, upErr.message);
      failed++;
      continue;
    }
    embedded++;
    console.log(`Embedded ${p.id} (${embedded})`);
    await sleep(THROTTLE_MS);
  }

  console.log(`\nDone. embedded=${embedded} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
