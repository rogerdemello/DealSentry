/**
 * Backfill content embeddings for existing proposals (Phase 4 semantic search).
 *
 * Prerequisite: run prisma/manual/semantic_search.sql first (adds the pgvector
 * column + index + RPC). Then:  npm run backfill:embeddings
 *
 * Idempotent: proposals that already have an embedding are skipped.
 */

import { config } from 'dotenv';
config();

import { supabase } from '../src/lib/supabase';
import { generateEmbedding } from '../src/api/lib/embeddings';

async function main() {
  const { data: rows, error } = await supabase
    .from('Proposal')
    .select('id, title, content, embedding');

  if (error) {
    console.error('Failed to load proposals (did you run the SQL migration?):', error.message);
    process.exit(1);
  }

  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of rows || []) {
    if (p.embedding) {
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
  }

  console.log(`\nDone. embedded=${embedded} skipped=${skipped} failed=${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
