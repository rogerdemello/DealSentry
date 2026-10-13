/**
 * Deterministic compliance analysis: the same questions the AI prompt asks
 * (discount cap, minimum deal size, payment terms, required legal clauses,
 * document structure), answered with plain text extraction and arithmetic.
 *
 * Used when the AI provider is unconfigured, unreachable, or returns an
 * unusable answer (see analysisService), and when ANALYSIS_MODE=rules. It is
 * deliberately conservative and explainable: every finding names the number it
 * found and the limit it was checked against.
 */

import { MAX_DISCOUNT_PERCENT, MIN_DEAL_SIZE, type NormalizedAnalysis } from './compliance';

/** Longest payment term (days) allowed before a proposal is a violation. */
export const MAX_PAYMENT_DAYS = 90;

export type FindingLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Finding {
  type: string;
  level: FindingLevel;
  message: string;
  location: string;
}

export interface Recommendation {
  paragraphId: string;
  suggestion: string;
  reason: string;
}

export interface RuleThresholds {
  maxDiscount: number;
  minDealSize: number;
  maxPaymentDays: number;
  /** Canonical clause keys (see CLAUSES) or free-text terms from custom rules. */
  requiredTerms: string[];
}

export interface RuleAnalysisInput {
  title?: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  /** Active rows from the Rule table; only their `logic` JSON is read. */
  rules?: Array<{ logic?: unknown }>;
}

export interface RuleAnalysisResult extends NormalizedAnalysis {
  findings: Finding[];
  recommendations: Recommendation[];
  /** What the checker extracted, for display and tests. */
  extracted: {
    discountPercent: number | null;
    dealSize: number | null;
    paymentDays: number | null;
    missingClauses: string[];
    missingSections: string[];
  };
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Clauses checked when no rule says otherwise (matches the AI prompt). */
const DEFAULT_REQUIRED = ['indemnification', 'limitation_of_liability', 'termination'];

interface ClauseSpec {
  label: string;
  /** Substrings of a rule's free-text term that map it to this clause. */
  aliases: string[];
  test: RegExp;
}

const CLAUSES: Record<string, ClauseSpec> = {
  indemnification: {
    label: 'Indemnification',
    aliases: ['indemn'],
    test: /indemnif/i,
  },
  limitation_of_liability: {
    label: 'Limitation of liability',
    aliases: ['liabil'],
    test: /limitation of liability|limit(?:s|ed|ation)?\s+(?:of\s+|on\s+)?(?:its\s+|their\s+|total\s+|our\s+)?liabilit|liability\s+(?:cap|limit)|shall not be liable|not be liable for any (?:indirect|consequential)/i,
  },
  termination: {
    label: 'Termination rights',
    aliases: ['terminat'],
    test: /terminat(?:e|es|ed|ion|ing)\b/i,
  },
  confidentiality: {
    label: 'Confidentiality',
    aliases: ['confiden', 'non-disclosure', 'nondisclosure', 'nda'],
    test: /confidential|non-?disclosure|\bNDA\b/i,
  },
  intellectual_property: {
    label: 'Intellectual property',
    aliases: ['intellectual', 'ip rights', 'work product'],
    test: /intellectual property|\bIP\b rights|ownership of (?:all )?(?:deliverables|work product)|work product/i,
  },
};

/** Map a rule's free-text term ("limitation of liability") to a canonical clause key. */
function canonicalTerm(term: string): string {
  const normalized = term.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const [key, spec] of Object.entries(CLAUSES)) {
    if (spec.aliases.some((alias) => normalized.includes(alias))) return key;
  }
  return normalized; // custom term: matched as a plain substring
}

function asLogic(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

const finiteNumber = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/**
 * Combine the active rules into one set of limits: the strictest discount cap
 * and payment term, the largest minimum deal size, and the union of required
 * clauses. Anything no rule specifies falls back to the built-in defaults.
 */
export function thresholdsFromRules(rules: Array<{ logic?: unknown }> = []): RuleThresholds {
  let maxDiscount = MAX_DISCOUNT_PERCENT;
  let minDealSize = MIN_DEAL_SIZE;
  let maxPaymentDays = MAX_PAYMENT_DAYS;
  const required = new Set<string>(DEFAULT_REQUIRED);

  for (const rule of rules) {
    const logic = asLogic(rule.logic);
    const discount = finiteNumber(logic.maxDiscount);
    if (discount !== null) maxDiscount = Math.min(maxDiscount, discount);
    const minSize = finiteNumber(logic.minDealSize);
    if (minSize !== null) minDealSize = Math.max(minDealSize, minSize);
    const days = finiteNumber(logic.maxPaymentDays);
    if (days !== null) maxPaymentDays = Math.min(maxPaymentDays, days);
    if (Array.isArray(logic.requiredTerms)) {
      for (const term of logic.requiredTerms) {
        if (typeof term === 'string' && term.trim()) required.add(canonicalTerm(term));
      }
    }
  }

  return { maxDiscount, minDealSize, maxPaymentDays, requiredTerms: [...required] };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Largest discount percentage the document states, or null if it states none. */
export function extractDiscountPercent(text: string): number | null {
  const patterns = [
    /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:[a-z-]+\s+)?(?:discount|off|reduction|rebate)/gi,
    /(?:discount|rebate)[^\d\n%]{0,40}?(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)/gi,
  ];
  const found: number[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 0 && value <= 100) found.push(value);
    }
  }
  return found.length ? Math.max(...found) : null;
}

/** Parse "$8,500", "$1.2M", "$50k" into a number of dollars. */
function parseAmount(whole: string, suffix?: string): number {
  const base = Number(whole.replace(/,/g, ''));
  switch ((suffix || '').toLowerCase()) {
    case 'k':
    case 'thousand':
      return base * 1_000;
    case 'm':
    case 'million':
      return base * 1_000_000;
    default:
      return base;
  }
}

const AMOUNT_RE = /\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|million|thousand)?\b/gi;

/**
 * The document's deal value: the largest "final / net / after discount" amount
 * if one is labelled, otherwise the largest "total / investment / price" amount.
 * Returns null when no amount is labelled — a stray "$100/hour" is not a deal.
 */
export function extractDealSize(text: string): number | null {
  const finals: number[] = [];
  const totals: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const amounts = [...line.matchAll(AMOUNT_RE)].map((m) => parseAmount(m[1], m[2]));
    if (amounts.length === 0) continue;
    if (/\b(final|net|grand total|after discount|discounted)\b/i.test(line)) {
      finals.push(...amounts);
    } else if (/\b(total|investment|contract value|deal size|project cost|price|pricing|fees?)\b/i.test(line)) {
      totals.push(...amounts);
    }
  }
  const pool = finals.length ? finals : totals;
  return pool.length ? Math.max(...pool) : null;
}

/** Longest payment term (in days) the document states, or null. */
export function extractPaymentDays(text: string): number | null {
  const patterns = [
    /\bnet\s*-?\s*(\d{1,3})\b/gi,
    /payment[^.\n]{0,80}?(\d{1,3})\s*(?:calendar\s+|business\s+|working\s+)?days/gi,
    /(\d{1,3})\s*(?:calendar\s+|business\s+|working\s+)?days\s+(?:of|from|after|following)\s+(?:the\s+)?(?:invoice|receipt|delivery)/gi,
    /due\s+within\s+(\d{1,3})\s*days/gi,
  ];
  const found: number[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) found.push(value);
    }
  }
  return found.length ? Math.max(...found) : null;
}

/** Labels of the required clauses the text does not contain. */
export function findMissingClauses(text: string, required: string[]): string[] {
  const missing: string[] = [];
  for (const term of required) {
    const spec = CLAUSES[term];
    const present = spec ? spec.test.test(text) : text.toLowerCase().includes(term.toLowerCase());
    if (!present) missing.push(spec ? spec.label : term);
  }
  return missing;
}

const SECTIONS: Array<{ label: string; test: RegExp }> = [
  { label: 'Overview / executive summary', test: /executive summary|overview|introduction|background/i },
  { label: 'Scope / solution', test: /scope|solution|services|deliverables|approach|what we will do/i },
  { label: 'Pricing', test: /pricing|investment|fees?\b|cost|price/i },
  { label: 'Timeline', test: /timeline|schedule|milestones|duration|\d+\s*(?:weeks?|months?)/i },
  { label: 'Terms & conditions', test: /terms\s*(?:&|and)?\s*conditions|terms of|conditions|payment terms/i },
];

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Pricing risk implied by a discount, mirroring the AI prompt's table. */
export function pricingRiskForDiscount(discount: number, maxDiscount = MAX_DISCOUNT_PERCENT): number {
  if (discount > maxDiscount) return 95;
  if (discount > 20) return 65;
  if (discount > 15) return 45;
  if (discount > 10) return 30;
  return 12;
}

export function analyzeByRules(input: RuleAnalysisInput): RuleAnalysisResult {
  const content = input.content || '';
  const metadata = input.metadata ?? {};
  const limits = thresholdsFromRules(input.rules);
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];

  // Document values win over form values, as in the AI prompt.
  const docDiscount = extractDiscountPercent(content);
  const metaDiscount = finiteNumber(metadata.discount);
  const discount = docDiscount ?? metaDiscount;

  const docDealSize = extractDealSize(content);
  const metaDealSize = finiteNumber(metadata.dealSize);
  const dealSize = docDealSize ?? (metaDealSize && metaDealSize > 0 ? metaDealSize : null);

  const paymentDays = extractPaymentDays(content);
  const missingClauses = findMissingClauses(content, limits.requiredTerms);
  const missingSections = SECTIONS.filter((s) => !s.test.test(content)).map((s) => s.label);

  // --- Pricing -----------------------------------------------------------
  let pricingRisk = 12;
  if (discount !== null) {
    pricingRisk = pricingRiskForDiscount(discount, limits.maxDiscount);
    if (discount > limits.maxDiscount) {
      findings.push({
        type: 'DISCOUNT VIOLATION',
        level: 'CRITICAL',
        message: `The proposed discount of ${discount}% exceeds the maximum allowed discount of ${limits.maxDiscount}%.`,
        location: 'Pricing',
      });
      recommendations.push({
        paragraphId: 'pricing',
        suggestion: `Reduce the discount to ${limits.maxDiscount}% or less, or obtain executive approval before sending.`,
        reason: `Discounts above ${limits.maxDiscount}% violate the pricing policy.`,
      });
    }
  }

  if (dealSize !== null && dealSize < limits.minDealSize) {
    pricingRisk = Math.max(pricingRisk, 70);
    findings.push({
      type: 'DEAL SIZE',
      level: 'CRITICAL',
      message: `The deal size of $${dealSize.toLocaleString('en-US')} is below the minimum required deal size of $${limits.minDealSize.toLocaleString('en-US')}.`,
      location: 'Pricing',
    });
    recommendations.push({
      paragraphId: 'pricing',
      suggestion: `Expand the scope to reach at least $${limits.minDealSize.toLocaleString('en-US')}, or get a small-deal exception approved.`,
      reason: 'Deals under the minimum size require explicit approval.',
    });
  } else if (dealSize === null) {
    findings.push({
      type: 'DEAL SIZE',
      level: 'LOW',
      message: 'No deal value could be identified in the document, so the minimum deal size was not checked.',
      location: 'Pricing',
    });
    recommendations.push({
      paragraphId: 'pricing',
      suggestion: 'State the total investment explicitly (for example "Total Investment: $25,000").',
      reason: 'A clearly stated deal value lets reviewers verify the minimum deal size.',
    });
  }

  if (paymentDays !== null && paymentDays > limits.maxPaymentDays) {
    pricingRisk = Math.max(pricingRisk, 60);
    findings.push({
      type: 'PAYMENT TERMS',
      level: 'CRITICAL',
      message: `Payment terms of ${paymentDays} days exceed the maximum allowed payment term of ${limits.maxPaymentDays} days.`,
      location: 'Payment Terms',
    });
    recommendations.push({
      paragraphId: 'payment-terms',
      suggestion: `Shorten payment terms to ${limits.maxPaymentDays} days or fewer (for example Net 30).`,
      reason: `Terms longer than ${limits.maxPaymentDays} days create unacceptable cash-flow risk.`,
    });
  }

  // --- Legal -------------------------------------------------------------
  let legalRisk = 10;
  if (missingClauses.length > 0) {
    legalRisk = clamp(10 + missingClauses.length * 25, 10, 95);
    for (const clause of missingClauses) {
      findings.push({
        type: 'MISSING CLAUSE',
        level: 'HIGH',
        message: `The proposal does not contain a ${clause.toLowerCase()} clause.`,
        location: 'Terms & Conditions',
      });
      recommendations.push({
        paragraphId: 'terms',
        suggestion: `Add a ${clause.toLowerCase()} clause to the Terms & Conditions.`,
        reason: `${clause} is a required legal protection.`,
      });
    }
  }

  // --- Structure ---------------------------------------------------------
  let structuralRisk = 15 + missingSections.length * 12;
  if (content.trim().length < 400) structuralRisk += 15;
  structuralRisk = clamp(structuralRisk, 10, 90);
  if (missingSections.length > 0) {
    findings.push({
      type: 'STRUCTURE',
      level: 'MEDIUM',
      message: `The document appears to be missing: ${missingSections.join(', ')}.`,
      location: 'Document',
    });
    recommendations.push({
      paragraphId: 'structure',
      suggestion: `Add the missing section${missingSections.length > 1 ? 's' : ''}: ${missingSections.join(', ')}.`,
      reason: 'A complete structure makes the proposal easier to review and approve.',
    });
  }

  findings.push({
    type: 'ANALYSIS MODE',
    level: 'LOW',
    message:
      'AI analysis was unavailable, so this report comes from the built-in rule checker ' +
      '(discount, deal size, payment terms, required clauses and document structure). Re-run the analysis for a full AI review.',
    location: 'Report',
  });

  // --- Scores ------------------------------------------------------------
  let readinessScore = Math.round(100 - (0.4 * legalRisk + 0.4 * pricingRisk + 0.2 * structuralRisk));
  readinessScore = clamp(readinessScore);
  if (findings.some((f) => f.level === 'CRITICAL')) readinessScore = Math.min(readinessScore, 55);

  return {
    readinessScore,
    legalRisk: Math.round(legalRisk),
    pricingRisk: Math.round(pricingRisk),
    structuralRisk: Math.round(structuralRisk),
    findings,
    recommendations,
    extracted: {
      discountPercent: discount,
      dealSize,
      paymentDays,
      missingClauses,
      missingSections,
    },
  };
}
