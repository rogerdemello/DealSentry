/**
 * Deterministic compliance & risk helpers shared by the analyze and proposal
 * (PDF export) routes. The heavy risk *judgement* is delegated to the LLM; the
 * helpers here are the deterministic glue around it — defaulting, classifying,
 * and rendering — and are unit-tested.
 */

/** Maximum discount percentage allowed before a proposal is a CRITICAL violation. */
export const MAX_DISCOUNT_PERCENT = 25;

/** Minimum deal size (USD) below which a proposal is a CRITICAL violation. */
export const MIN_DEAL_SIZE = 10_000;

/** Readiness score at/above which a proposal auto-advances to IN_REVIEW. */
export const AUTO_REVIEW_THRESHOLD = 80;

export interface RiskLevel {
  color: string;
  label: string;
  bg: string;
}

/**
 * Classify a 0-100 score into a color-coded risk band.
 * Higher score = healthier (Low Risk). Used by the PDF risk dashboard.
 */
export function classifyRiskLevel(score: number): RiskLevel {
  if (score >= 70) return { color: '#22c55e', label: 'Low Risk', bg: '#f0fdf4' };
  if (score >= 40) return { color: '#f59e0b', label: 'Medium Risk', bg: '#fef3c7' };
  return { color: '#ef4444', label: 'High Risk', bg: '#fee2e2' };
}

export interface RawAnalysis {
  readinessScore?: number;
  legalRisk?: number;
  pricingRisk?: number;
  structuralRisk?: number;
  findings?: unknown[];
  recommendations?: unknown[];
}

export interface NormalizedAnalysis {
  readinessScore: number;
  legalRisk: number;
  pricingRisk: number;
  structuralRisk: number;
  findings: unknown[];
  recommendations: unknown[];
}

/**
 * Apply safe defaults to a raw AI analysis object so a partial/garbled LLM
 * response never persists null/undefined scores. Mirrors the historical
 * `analysis.x || default` behaviour in one place.
 */
export function normalizeAnalysis(raw: RawAnalysis | null | undefined): NormalizedAnalysis {
  const a = raw ?? {};
  return {
    readinessScore: a.readinessScore || 50,
    legalRisk: a.legalRisk || 20,
    pricingRisk: a.pricingRisk || 20,
    structuralRisk: a.structuralRisk || 20,
    findings: a.findings || [],
    recommendations: a.recommendations || [],
  };
}

/** Whether a readiness score should auto-advance the proposal to IN_REVIEW. */
export function shouldAutoReview(readinessScore: number): boolean {
  return readinessScore >= AUTO_REVIEW_THRESHOLD;
}

/**
 * Convert a subset of markdown to HTML for rendering. Note: this does NOT
 * escape HTML — callers that embed untrusted content elsewhere must escape
 * separately. Preserved verbatim from the proposal PDF renderer.
 */
export function markdownToHtml(text: string): string {
  if (!text) return '';

  let html = text;

  // Convert headers (must be at start of line)
  html = html.replace(/^### (.+)$/gm, '<h3 class="content-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="content-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="content-h1">$1</h1>');

  // Convert **bold** to <strong>bold</strong> (greedy match within lines)
  html = html.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');

  // Convert *italic* to <em>italic</em> (single asterisk, not part of **)
  html = html.replace(/(?<!\*)\*([^\n*]+?)\*(?!\*)/g, '<em>$1</em>');

  // Convert __underline__ to <u>underline</u>
  html = html.replace(/__([^\n]+?)__/g, '<u>$1</u>');

  // Convert bullet points
  html = html.replace(/^[•\-*] (.+)$/gm, '<li>$1</li>');

  // Convert line breaks to <br> for proper display
  html = html.replace(/\n/g, '<br>\n');

  return html;
}
