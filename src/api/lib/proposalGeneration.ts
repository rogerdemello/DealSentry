/**
 * Natural-language proposal generation: the prompt sent to the model and the
 * deterministic clean-up applied to whatever comes back.
 *
 * The model is asked to respect the compliance limits, but its answer is never
 * trusted: discount is clamped to the allowed range and numbers are validated
 * here, in code, before anything is stored.
 */

import { MAX_DISCOUNT_PERCENT } from './compliance';

export const GENERATION_SYSTEM_PROMPT =
  'You are a professional proposal writer with expertise in compliance and legal requirements. Generate complete, compliance-ready business proposals that include all required legal clauses and adhere to organizational policies. Always ensure proposals meet regulatory standards including payment terms limits (90 days max), discount thresholds (25% max), and required legal clauses (indemnification, liability limitation, termination rights, confidentiality, intellectual property). Respond only with valid JSON.';

/** The user prompt for a free-text request such as "proposal for Acme, $50k website redesign". */
export function buildGenerationPrompt(naturalLanguageQuery: string): string {
  return `You are a professional proposal generation assistant. Extract structured proposal information from the following natural language request and generate a COMPLETE, COMPLIANCE-READY business proposal.

User Request:
${naturalLanguageQuery}

## COMPLIANCE REQUIREMENTS (MUST FOLLOW):
1. **Payment Terms**: MAXIMUM 90 days allowed. If user specifies more, adjust to 90 days and note this in the proposal.
2. **Discount**: If no discount mentioned, set to 0%. MAXIMUM 25% discount allowed.
3. **Legal Clauses**: MUST include ALL of the following in Terms and Conditions:
   - Indemnification clause
   - Liability limitation clause
   - Termination rights clause
   - Confidentiality clause
   - Intellectual property clause
4. **Minimum Deal Size**: $10,000

## Extract and generate:
1. Company name (required)
2. Proposal title (required) - create a professional title if not explicitly stated
3. Client name (if different from company name)
4. Deal size (if mentioned, extract as number without currency symbols)
5. Discount percentage (if mentioned, extract as number without % symbol, otherwise 0)
6. Region (if mentioned, otherwise "North America")
7. Currency (if mentioned, otherwise "USD")
8. Industry (if mentioned, otherwise "General")

## Generate comprehensive proposal content with these sections:

### 1. Executive Summary
Professional overview of the proposal and key value proposition.

### 2. Proposed Solution
Detailed description of services, deliverables, and approach.

### 3. Investment & Pricing
- Total project value
- Payment terms (MAXIMUM 90 days - adjust if user specified more)
- Any applicable discounts (0-25% range only)
- Payment schedule if applicable

### 4. Timeline & Milestones
Project timeline with key milestones and deliverables.

### 5. Terms & Conditions (CRITICAL - MUST INCLUDE ALL):
**Indemnification**: "Each party agrees to indemnify and hold harmless the other party from any claims, damages, or losses arising from their own negligence or breach of this agreement."

**Liability Limitation**: "Neither party shall be liable for any indirect, incidental, special, or consequential damages. Total liability under this agreement shall not exceed the total contract value."

**Termination Rights**: "Either party may terminate this agreement with 30 days written notice. Upon termination, client shall pay for all work completed to date."

**Confidentiality**: "Both parties agree to maintain confidentiality of all proprietary information disclosed during this engagement."

**Intellectual Property**: "Upon full payment, all deliverables and work product shall become the property of the client, subject to any pre-existing intellectual property rights."

**Payment Terms**: "Payment is due within [X] days of invoice date, not exceeding 90 days."

### 6. Acceptance & Next Steps
Clear process for proposal acceptance and project kickoff.

Format the content with proper markdown headings (## and ###) for sections and subsections.

Respond in JSON format:
{
  "companyName": "string (required)",
  "title": "string (required)",
  "content": "string (required - full proposal text with ALL sections above including complete Terms & Conditions)",
  "metadata": {
    "clientName": "string",
    "dealSize": number or null,
    "discount": number (0-25 range, default 0),
    "region": "string",
    "currency": "string",
    "industry": "string"
  }
}`;
}

/** Fields a stored proposal needs, derived from the model's JSON answer. */
export interface GeneratedProposal {
  title: string;
  content: string;
  metadata: {
    clientName: string;
    dealSize: number | null;
    discount: number;
    region: string;
    currency: string;
    industry: string;
  };
}

/** Clamp a discount to 0..MAX_DISCOUNT_PERCENT; anything non-numeric becomes 0. */
export function clampDiscount(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_DISCOUNT_PERCENT, Math.max(0, n));
}

/** A finite, non-negative deal size, or null when the model gave none. */
function toDealSize(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

/**
 * Validate and normalise the model's JSON. Returns null when the required
 * fields (company name, title, content) are missing so the caller can ask the
 * user for more detail instead of storing an empty proposal.
 */
export function normalizeGenerated(raw: unknown): GeneratedProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const meta = (g.metadata && typeof g.metadata === 'object' ? g.metadata : {}) as Record<string, unknown>;

  const companyName = text(g.companyName, '');
  const title = text(g.title, '');
  const content = text(g.content, '');
  if (!companyName || !title || !content) return null;

  return {
    title,
    content,
    metadata: {
      clientName: text(meta.clientName, companyName),
      dealSize: toDealSize(meta.dealSize),
      discount: clampDiscount(meta.discount),
      region: text(meta.region, 'North America'),
      currency: text(meta.currency, 'USD'),
      industry: text(meta.industry, 'General'),
    },
  };
}
