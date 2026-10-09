/**
 * Chat-completion client shared by the analysis and generation routes.
 *
 * Uses Google Gemini (via its OpenAI-compatible endpoint) when GEMINI_API_KEY
 * is set, otherwise Azure OpenAI. Both speak the same chat.completions API.
 */
import OpenAI, { AzureOpenAI } from 'openai';

const geminiKey = process.env.GEMINI_API_KEY;

export const llmClient: OpenAI = geminiKey
  ? new OpenAI({
      apiKey: geminiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    })
  : new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
    });

/**
 * Extra completion params. Gemini 2.5 "thinks" by default and those tokens count
 * against max_tokens, truncating the JSON answer; turn thinking off.
 */
export const llmExtraParams = geminiKey ? ({ reasoning_effort: 'none' } as Record<string, unknown>) : {};

export const llmModel: string = geminiKey
  ? process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  : process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
