/**
 * Chat-completion client shared by the analysis and generation routes.
 *
 * Uses Google Gemini (via its OpenAI-compatible endpoint) when GEMINI_API_KEY
 * is set, otherwise Azure OpenAI when its endpoint and key are set. Both speak
 * the same chat.completions API.
 *
 * Resolved lazily so the server still boots with no AI configured: callers get
 * `null` from getLlm() and degrade (analysis falls back to the rule checker,
 * generation reports 503) instead of the process crashing at import time.
 */
import OpenAI, { AzureOpenAI } from 'openai';
import { GEMINI_BASE_URL } from './gemini';

export interface Llm {
  provider: 'gemini' | 'azure';
  client: OpenAI;
  model: string;
  /**
   * Extra completion params. Gemini 2.5 "thinks" by default and those tokens
   * count against max_tokens, truncating the JSON answer; turn thinking off.
   */
  extraParams: Record<string, unknown>;
}

let cached: { key: string; llm: Llm | null } | null = null;

/** The configured LLM, or null when neither Gemini nor Azure OpenAI is set up. */
export function getLlm(): Llm | null {
  const geminiKey = process.env.GEMINI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureKey = process.env.OPENAI_API_KEY;

  const key = geminiKey
    ? `gemini:${geminiKey}:${process.env.GEMINI_MODEL ?? ''}`
    : `azure:${azureEndpoint ?? ''}:${azureKey ?? ''}:${process.env.AZURE_OPENAI_DEPLOYMENT ?? ''}`;
  if (cached && cached.key === key) return cached.llm;

  let llm: Llm | null = null;
  if (geminiKey) {
    llm = {
      provider: 'gemini',
      client: new OpenAI({ apiKey: geminiKey, baseURL: GEMINI_BASE_URL }),
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      extraParams: { reasoning_effort: 'none' },
    };
  } else if (azureEndpoint && azureKey) {
    llm = {
      provider: 'azure',
      client: new AzureOpenAI({
        endpoint: azureEndpoint,
        apiKey: azureKey,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
      }),
      model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
      extraParams: {},
    };
  }

  cached = { key, llm };
  return llm;
}

/** True when an LLM provider is configured (it may still be unreachable). */
export function isLlmConfigured(): boolean {
  return getLlm() !== null;
}
