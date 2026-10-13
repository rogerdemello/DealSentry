/**
 * Embedding generation for semantic search (Phase 4).
 *
 * Provider: Google Gemini (`gemini-embedding-001`, through its OpenAI-compatible
 * endpoint) when GEMINI_API_KEY is set, otherwise Azure OpenAI. Either way the
 * vector is EMBEDDING_DIM wide to match the pgvector column.
 *
 * Returns null on any failure so callers can degrade gracefully — semantic
 * search is an enhancement layered on top of the existing substring filter, and
 * proposal create/update must never fail just because embedding did.
 *
 * Every instance that shares a database must use the same embedding model:
 * vectors from different models are not comparable. After switching provider,
 * re-embed everything with `npm run backfill:embeddings -- --all`.
 * See docs/SEMANTIC_SEARCH.md.
 */

import OpenAI, { AzureOpenAI } from 'openai';
import { GEMINI_BASE_URL } from './gemini';
import { logger } from './logger';

export const EMBEDDING_DIM = 1536;
const MAX_CHARS = 8000;

interface EmbeddingProvider {
  client: OpenAI;
  model: string;
  /** Gemini models can emit several widths; ask for the column's width. */
  dimensions?: number;
}

let provider: EmbeddingProvider | null = null;
let providerKey = '';

/** Resolve (and cache) the embedding client for the current environment. */
function getProvider(): EmbeddingProvider {
  const geminiKey = process.env.GEMINI_API_KEY;
  const key = geminiKey ? `gemini:${geminiKey}` : 'azure';
  if (provider && providerKey === key) return provider;

  provider = geminiKey
    ? {
        client: new OpenAI({ apiKey: geminiKey, baseURL: GEMINI_BASE_URL }),
        model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
        dimensions: EMBEDDING_DIM,
      }
    : {
        client: new AzureOpenAI({
          endpoint: process.env.AZURE_OPENAI_ENDPOINT,
          apiKey: process.env.OPENAI_API_KEY,
          apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
        }),
        model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-ada-002',
      };
  providerKey = key;
  return provider;
}

/**
 * Scale a vector to unit length. Gemini returns un-normalised vectors when asked
 * for fewer than its native 3072 dimensions; cosine distance ignores magnitude,
 * but unit vectors keep similarity scores comparable and the index well-behaved.
 */
export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  if (!norm) return vector;
  return vector.map((x) => x / norm);
}

/** Embed a single string. Returns the vector, or null on failure. */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const input = (text || '').trim().slice(0, MAX_CHARS);
  if (!input) return null;
  try {
    const { client, model, dimensions } = getProvider();
    const res = await client.embeddings.create({
      model,
      input,
      ...(dimensions ? { dimensions } : {}),
    });
    const embedding = res.data[0]?.embedding;
    if (!embedding) return null;
    if (embedding.length !== EMBEDDING_DIM) {
      logger.error(
        `[embeddings] expected ${EMBEDDING_DIM} dimensions, got ${embedding.length}; ` +
          'the pgvector column width and the embedding model must match'
      );
      return null;
    }
    return l2Normalize(embedding);
  } catch (err) {
    logger.error('[embeddings] generation failed', err);
    return null;
  }
}
