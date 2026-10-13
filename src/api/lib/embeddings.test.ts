import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { create, openAiCtor, azureCtor } = vi.hoisted(() => ({
  create: vi.fn(),
  openAiCtor: vi.fn(),
  azureCtor: vi.fn(),
}));

vi.mock('openai', () => {
  class OpenAI {
    embeddings = { create };
    constructor(opts: unknown) {
      openAiCtor(opts);
    }
  }
  class AzureOpenAI {
    embeddings = { create };
    constructor(opts: unknown) {
      azureCtor(opts);
    }
  }
  return { default: OpenAI, AzureOpenAI };
});

import { EMBEDDING_DIM, generateEmbedding, l2Normalize } from './embeddings';

const vectorOf = (value: number, length = EMBEDDING_DIM) => Array.from({ length }, () => value);
const ENV_KEYS = ['GEMINI_API_KEY', 'GEMINI_EMBEDDING_MODEL', 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT'] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  create.mockReset();
  openAiCtor.mockReset();
  azureCtor.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('l2Normalize', () => {
  it('scales a vector to unit length', () => {
    const out = l2Normalize([3, 4]);
    expect(out[0]).toBeCloseTo(0.6);
    expect(out[1]).toBeCloseTo(0.8);
  });

  it('leaves the zero vector alone instead of dividing by zero', () => {
    expect(l2Normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('generateEmbedding', () => {
  it('returns null without calling the provider for blank input', async () => {
    expect(await generateEmbedding('   ')).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('uses Gemini at the column width when GEMINI_API_KEY is set', async () => {
    process.env.GEMINI_API_KEY = 'gem-key-1';
    create.mockResolvedValue({ data: [{ embedding: vectorOf(2) }] });

    const out = await generateEmbedding('payment terms');

    expect(openAiCtor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'gem-key-1', baseURL: expect.stringContaining('generativelanguage') })
    );
    expect(azureCtor).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-embedding-001',
        input: 'payment terms',
        dimensions: EMBEDDING_DIM,
      })
    );
    // Returned vector is unit length.
    expect(out).not.toBeNull();
    const norm = Math.sqrt(out!.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1);
  });

  it('honours GEMINI_EMBEDDING_MODEL', async () => {
    process.env.GEMINI_API_KEY = 'gem-key-2';
    process.env.GEMINI_EMBEDDING_MODEL = 'gemini-embedding-custom';
    create.mockResolvedValue({ data: [{ embedding: vectorOf(1) }] });

    await generateEmbedding('hello');

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-embedding-custom' }));
  });

  it('falls back to the Azure deployment (no dimensions param) without a Gemini key', async () => {
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT = 'my-ada';
    create.mockResolvedValue({ data: [{ embedding: vectorOf(1) }] });

    await generateEmbedding('hello');

    expect(azureCtor).toHaveBeenCalled();
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('my-ada');
    expect(params).not.toHaveProperty('dimensions');
  });

  it('rejects a vector whose width does not match the pgvector column', async () => {
    process.env.GEMINI_API_KEY = 'gem-key-3';
    create.mockResolvedValue({ data: [{ embedding: vectorOf(1, 768) }] });

    expect(await generateEmbedding('hello')).toBeNull();
  });

  it('truncates very long input before sending it', async () => {
    process.env.GEMINI_API_KEY = 'gem-key-4';
    create.mockResolvedValue({ data: [{ embedding: vectorOf(1) }] });

    await generateEmbedding('x'.repeat(20_000));

    expect(create.mock.calls[0][0].input).toHaveLength(8000);
  });

  it('returns null instead of throwing when the provider fails', async () => {
    process.env.GEMINI_API_KEY = 'gem-key-5';
    create.mockRejectedValue(new Error('429 quota'));

    await expect(generateEmbedding('hello')).resolves.toBeNull();
  });
});
