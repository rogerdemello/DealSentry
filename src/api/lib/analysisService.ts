/**
 * Proposal analysis: prompt construction, the AI call, the deterministic
 * fallback, and persisting the resulting RiskReport.
 *
 * The router (analyze.ts) owns HTTP concerns — auth, access checks, status codes.
 * Everything here is reusable by both the single and bulk endpoints.
 */

import { supabase } from '../../lib/supabase';
import { normalizeAnalysis, shouldAutoReview, type NormalizedAnalysis } from './compliance';
import { getLlm } from './llm';
import { logger } from './logger';
import { analyzeByRules } from './ruleAnalysis';

/** How much of the document is sent to the model. */
export const ANALYSIS_MAX_CONTENT_CHARS = 4000;

/** Give up on a slow provider and use the rule checker instead. */
const AI_TIMEOUT_MS = 45_000;

export type AnalysisSource = 'ai' | 'rules';

export interface ProposalForAnalysis {
  id: string;
  title: string;
  content: string;
  status?: string;
  metadata?: Record<string, unknown> | null;
}

export interface RuleRow {
  name: string;
  description: string;
  logic?: unknown;
}

export interface RiskReportRow {
  id: string;
  readinessScore: number;
  legalRisk: number;
  pricingRisk: number;
  structuralRisk: number;
  findings: unknown[];
  recommendations: unknown[];
}

export function buildAnalysisPrompt(proposal: ProposalForAnalysis, rules: RuleRow[]): string {
  const rulesText = rules.map((r) => `- ${r.name}: ${r.description}`).join('\n');
  const metadata = proposal.metadata ?? {};

  // Metadata is optional; the AI must extract/verify the numbers from the document.
  const metadataDiscount = metadata.discount != null ? Number(metadata.discount) : null;
  const metadataDealSize = metadata.dealSize != null ? Number(metadata.dealSize) : null;
  const hasMetadataDiscount = metadataDiscount !== null && !Number.isNaN(metadataDiscount);
  const hasMetadataDealSize = metadataDealSize !== null && !Number.isNaN(metadataDealSize);

  return `You are a proposal review assistant. Analyze the following proposal against the compliance rules and provide a risk assessment.

## Proposal Details (from form – optional; verify against document)
Title: ${proposal.title}
Client: ${metadata.clientName || 'Unknown'}
Deal Size (form): ${hasMetadataDealSize ? `$${metadataDealSize}` : 'Not provided – extract from document'}
Discount % (form): ${hasMetadataDiscount ? `${metadataDiscount}%` : 'Not provided – extract from document'}
Region: ${metadata.region || 'Unknown'}
Industry: ${metadata.industry || 'Unknown'}

## Proposal Content (source of truth for numbers)
${proposal.content.substring(0, ANALYSIS_MAX_CONTENT_CHARS)}

## Compliance Rules
${rulesText || 'No specific rules defined'}

## Critical Analysis Requirements

### Discount Analysis (IMPORTANT):
- FIRST: Extract the actual discount from the proposal content (look for percentages, "discount", "off", "reduction", etc.).
- If the document states a discount, use that value for compliance. If the form provided a value that differs from the document, prefer the document.
- If no discount is found in the document, you may use the form value if provided.
- Maximum allowed discount threshold: 25%
- If discount is ABOVE 25%, flag as CRITICAL with "DISCOUNT VIOLATION"
- If discount is 25% or BELOW, do NOT flag any discount issues

### Pricing Risk Calculation:
Calculate pricing risk based on the discount you determined (from document first):
- 0-10% discount = 10-15% pricing risk (LOW)
- 11-15% discount = 25-35% pricing risk (MEDIUM)
- 16-20% discount = 40-50% pricing risk (MEDIUM-HIGH)
- 21-25% discount = 60-70% pricing risk (HIGH - near limit)
- 26%+ discount = 90-100% pricing risk (CRITICAL - VIOLATION)

### Deal Size Analysis:
- FIRST: Extract deal size / contract value from the proposal content if present.
- If the document states an amount, use that for compliance. If the form value differs, prefer the document.
- Minimum deal size: $10,000
- If below minimum, flag as CRITICAL violation
- Assess if appropriate approvals are in place for this amount

### Content Analysis:
- Check for required legal clauses: indemnification, liability limitation, termination rights
- Verify payment terms don't exceed 90 days
- Check for proper contract structure

## Instructions
Analyze this proposal carefully using the ACTUAL values provided above and respond:
1. A readiness score (0-100) - higher if compliant
2. Legal risk percentage (0-100) - based on missing clauses
3. Pricing risk percentage (0-100) - based on discount vs threshold
4. Structural risk percentage (0-100) - based on content structure
5. List of findings (ONLY flag issues that actually exist based on the data)
6. List of recommendations (specific to the actual issues found)

IMPORTANT: Base your analysis on the discount and deal size you extract from the proposal content. If the form provided values that conflict with the document, use the document values for compliance and risk.

Respond in JSON format:
{
  "readinessScore": number,
  "legalRisk": number,
  "pricingRisk": number,
  "structuralRisk": number,
  "findings": [
    { "type": "string", "level": "CRITICAL|HIGH|MEDIUM|LOW", "message": "string", "location": "string" }
  ],
  "recommendations": [
    { "paragraphId": "string", "suggestion": "string", "reason": "string" }
  ]
}`;
}

/** Ask the configured model. Throws on any failure (network, quota, bad JSON). */
async function analyzeWithAi(proposal: ProposalForAnalysis, rules: RuleRow[]): Promise<NormalizedAnalysis> {
  const llm = getLlm();
  if (!llm) throw new Error('No AI provider configured');

  const completion = await llm.client.chat.completions.create(
    {
      model: llm.model,
      messages: [
        { role: 'system', content: 'You are a proposal compliance analyst. Respond only with valid JSON.' },
        { role: 'user', content: buildAnalysisPrompt(proposal, rules) },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      ...llm.extraParams,
    },
    { timeout: AI_TIMEOUT_MS, maxRetries: 1 }
  );

  const responseContent = completion.choices[0]?.message?.content;
  if (!responseContent) throw new Error('No response from AI');
  return normalizeAnalysis(JSON.parse(responseContent));
}

/**
 * Analyze a proposal. Uses the AI when it is configured and answers; otherwise
 * (or with ANALYSIS_MODE=rules) uses the deterministic rule checker so the
 * workflow never dead-ends on an AI outage.
 */
export async function analyzeProposal(
  proposal: ProposalForAnalysis,
  rules: RuleRow[]
): Promise<{ analysis: NormalizedAnalysis; source: AnalysisSource }> {
  if (process.env.ANALYSIS_MODE !== 'rules' && getLlm()) {
    try {
      return { analysis: await analyzeWithAi(proposal, rules), source: 'ai' };
    } catch (err) {
      logger.warn(
        `AI analysis failed for proposal ${proposal.id}; using the rule checker instead:`,
        (err as Error).message
      );
    }
  }

  const { extracted: _extracted, ...analysis } = analyzeByRules({
    title: proposal.title,
    content: proposal.content,
    metadata: proposal.metadata,
    rules,
  });
  return { analysis, source: 'rules' };
}

/** Active compliance rules, or an empty list if the lookup fails. */
export async function loadActiveRules(): Promise<RuleRow[]> {
  const { data, error } = await supabase.from('Rule').select('*').eq('isActive', true);
  if (error) {
    logger.warn('Could not load compliance rules:', error.message);
    return [];
  }
  return (data || []) as RuleRow[];
}

/** Insert or update the proposal's single RiskReport. */
export async function saveRiskReport(proposalId: string, analysis: NormalizedAnalysis): Promise<RiskReportRow> {
  const fields = {
    readinessScore: analysis.readinessScore,
    legalRisk: analysis.legalRisk,
    pricingRisk: analysis.pricingRisk,
    structuralRisk: analysis.structuralRisk,
    findings: analysis.findings,
    recommendations: analysis.recommendations,
  };

  // limit(1) rather than single(): single() errors when duplicate reports exist,
  // which would then insert yet another one.
  const { data: existing } = await supabase.from('RiskReport').select('id').eq('proposalId', proposalId).limit(1);
  const existingId = (existing as Array<{ id: string }> | null)?.[0]?.id;

  const query = existingId
    ? supabase.from('RiskReport').update(fields).eq('id', existingId)
    : supabase.from('RiskReport').insert({ id: crypto.randomUUID(), proposalId, ...fields });

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as RiskReportRow;
}

/**
 * Touch the proposal after analysis and advance PENDING -> IN_REVIEW when it is
 * healthy enough. Never moves an already-reviewed proposal (APPROVED/REJECTED/
 * IN_REVIEW) backwards. Returns whether the status advanced.
 */
export async function recordAnalysisOnProposal(
  proposal: Pick<ProposalForAnalysis, 'id' | 'status'>,
  readinessScore: number
): Promise<boolean> {
  const update: { updatedAt: string; status?: string } = { updatedAt: new Date().toISOString() };
  const advance = proposal.status === 'PENDING' && shouldAutoReview(readinessScore);
  if (advance) update.status = 'IN_REVIEW';

  const { error } = await supabase.from('Proposal').update(update).eq('id', proposal.id);
  if (error) {
    // The report itself is already saved; don't fail the request over bookkeeping.
    logger.warn(`Could not update proposal ${proposal.id} after analysis:`, error.message);
    return false;
  }
  return advance;
}

export interface AnalysisOutcome {
  proposalId: string;
  riskReport: RiskReportRow;
  analysisSource: AnalysisSource;
  statusAdvanced: boolean;
}

/** Analyze, persist, and update the proposal. The full single-proposal workflow. */
export async function analyzeAndSave(proposal: ProposalForAnalysis): Promise<AnalysisOutcome> {
  const rules = await loadActiveRules();
  const { analysis, source } = await analyzeProposal(proposal, rules);
  const riskReport = await saveRiskReport(proposal.id, analysis);
  const statusAdvanced = await recordAnalysisOnProposal(proposal, riskReport.readinessScore);
  return { proposalId: proposal.id, riskReport, analysisSource: source, statusAdvanced };
}
