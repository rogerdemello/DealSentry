import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { openAiCtor, azureCtor } = vi.hoisted(() => ({ openAiCtor: vi.fn(), azureCtor: vi.fn() }));

vi.mock('openai', () => {
  class OpenAI {
    kind = 'gemini-client';
    constructor(opts: unknown) {
      openAiCtor(opts);
    }
  }
  class AzureOpenAI {
    kind = 'azure-client';
    constructor(opts: unknown) {
      azureCtor(opts);
    }
  }
  return { default: OpenAI, AzureOpenAI };
});

import { getLlm, isLlmConfigured } from './llm';

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'AZURE_OPENAI_ENDPOINT',
  'OPENAI_API_KEY',
  'AZURE_OPENAI_DEPLOYMENT',
  'AZURE_OPENAI_API_VERSION',
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  openAiCtor.mockClear();
  azureCtor.mockClear();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('getLlm', () => {
  it('is null — not a crash — when nothing is configured', () => {
    expect(getLlm()).toBeNull();
    expect(isLlmConfigured()).toBe(false);
    expect(openAiCtor).not.toHaveBeenCalled();
    expect(azureCtor).not.toHaveBeenCalled();
  });

  it('uses Gemini through its OpenAI-compatible endpoint, with thinking off', () => {
    process.env.GEMINI_API_KEY = 'gem-1';

    const llm = getLlm();

    expect(llm).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      extraParams: { reasoning_effort: 'none' },
    });
    expect(openAiCtor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'gem-1', baseURL: expect.stringContaining('generativelanguage.googleapis.com') })
    );
    expect(isLlmConfigured()).toBe(true);
  });

  it('honours GEMINI_MODEL', () => {
    process.env.GEMINI_API_KEY = 'gem-2';
    process.env.GEMINI_MODEL = 'gemini-custom';
    expect(getLlm()?.model).toBe('gemini-custom');
  });

  it('falls back to Azure OpenAI when only its endpoint and key are set', () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://res.openai.azure.com/';
    process.env.OPENAI_API_KEY = 'az-key';

    const llm = getLlm();

    expect(llm).toMatchObject({ provider: 'azure', model: 'gpt-4o', extraParams: {} });
    expect(azureCtor).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://res.openai.azure.com/', apiKey: 'az-key', apiVersion: '2024-12-01-preview' })
    );
  });

  it('honours the Azure deployment and API version', () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://res2.openai.azure.com/';
    process.env.OPENAI_API_KEY = 'az-key-2';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'my-deployment';
    process.env.AZURE_OPENAI_API_VERSION = '2025-01-01';

    expect(getLlm()?.model).toBe('my-deployment');
    expect(azureCtor).toHaveBeenCalledWith(expect.objectContaining({ apiVersion: '2025-01-01' }));
  });

  it('needs both Azure settings: either one alone is "not configured"', () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://only-endpoint.openai.azure.com/';
    expect(getLlm()).toBeNull();

    delete process.env.AZURE_OPENAI_ENDPOINT;
    process.env.OPENAI_API_KEY = 'only-key';
    expect(getLlm()).toBeNull();
  });

  it('prefers Gemini when both providers are configured', () => {
    process.env.GEMINI_API_KEY = 'gem-3';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://res3.openai.azure.com/';
    process.env.OPENAI_API_KEY = 'az-key-3';

    expect(getLlm()?.provider).toBe('gemini');
    expect(azureCtor).not.toHaveBeenCalled();
  });

  it('reuses the client while the environment is unchanged, and rebuilds when it changes', () => {
    process.env.GEMINI_API_KEY = 'gem-4';
    const first = getLlm();
    const again = getLlm();
    expect(again).toBe(first);
    expect(openAiCtor).toHaveBeenCalledTimes(1);

    process.env.GEMINI_API_KEY = 'gem-5';
    const rebuilt = getLlm();
    expect(rebuilt).not.toBe(first);
    expect(openAiCtor).toHaveBeenCalledTimes(2);
  });
});
