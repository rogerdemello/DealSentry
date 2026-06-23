/**
 * Azure OpenAI embedding generation for semantic search (Phase 4).
 *
 * Returns null on any failure so callers can degrade gracefully — semantic
 * search is an enhancement layered on top of the existing substring filter, and
 * proposal create/update must never fail just because embedding did.
 *
 * Requires AZURE_OPENAI_EMBEDDING_DEPLOYMENT and the pgvector column/migration
 * (see docs/SEMANTIC_SEARCH.md). text-embedding-ada-002 produces 1536-dim vectors.
 */

import { AzureOpenAI } from 'openai';
import { logger } from './logger';

export const EMBEDDING_DIM = 1536;
const MAX_CHARS = 8000;

const deployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-ada-002';

let client: AzureOpenAI | null = null;
function getClient(): AzureOpenAI {
  if (!client) {
    client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
    });
  }
  return client;
}

/** Embed a single string. Returns the vector, or null on failure. */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const input = (text || '').trim().slice(0, MAX_CHARS);
  if (!input) return null;
  try {
    const res = await getClient().embeddings.create({ model: deployment, input });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    logger.error('[embeddings] generation failed', err);
    return null;
  }
}
