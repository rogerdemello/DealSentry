import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, canAccessResource } from './middleware/auth';
import { analyzeAndSave, type AnalysisOutcome, type ProposalForAnalysis } from './lib/analysisService';
import { getLlm } from './lib/llm';
import { logger } from './lib/logger';

const router = Router();

/** Most proposals one bulk request may analyze (each can be an AI call). */
export const MAX_BULK_ANALYSIS = 10;

type AnalyzeResult =
  | { ok: true; outcome: AnalysisOutcome }
  | { ok: false; status: number; error: string };

/** Load a proposal, check the caller may see it, then analyze and persist. */
async function analyzeForRequest(proposalId: string, req: Request): Promise<AnalyzeResult> {
  const { data: proposal, error: proposalError } = await supabase
    .from('Proposal')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (proposalError || !proposal) {
    return { ok: false, status: 404, error: 'Proposal not found' };
  }

  const row = proposal as { company_id?: string | null; userId?: string | null };
  if (!canAccessResource({ companyId: row.company_id ?? null, ownerId: row.userId ?? null }, req)) {
    return { ok: false, status: 403, error: 'You do not have access to this proposal' };
  }

  try {
    const outcome = await analyzeAndSave(proposal as ProposalForAnalysis);
    return { ok: true, outcome };
  } catch (error) {
    logger.error('Error analyzing proposal:', error);
    return { ok: false, status: 500, error: 'Failed to analyze proposal' };
  }
}

function formatOutcome(outcome: AnalysisOutcome) {
  const { riskReport } = outcome;
  return {
    proposalId: outcome.proposalId,
    analysisSource: outcome.analysisSource,
    statusAdvanced: outcome.statusAdvanced,
    riskReport: {
      id: riskReport.id,
      readinessScore: riskReport.readinessScore,
      legalRisk: riskReport.legalRisk,
      pricingRisk: riskReport.pricingRisk,
      structuralRisk: riskReport.structuralRisk,
      findings: riskReport.findings,
      recommendations: riskReport.recommendations,
    },
  };
}

// Which engine a new analysis will use: the configured AI, or the built-in rule
// checker (no AI configured, or ANALYSIS_MODE=rules).
router.get('/mode', requireAuth, (_req: Request, res: Response) => {
  const llm = process.env.ANALYSIS_MODE === 'rules' ? null : getLlm();
  res.json({ mode: llm ? 'ai' : 'rules', provider: llm?.provider ?? null, model: llm?.model ?? null });
});

// Analyze several proposals in one request (sequentially, to respect provider
// rate limits). Declared before '/:proposalId' so "bulk" is not read as an id.
router.post('/bulk', requireAuth, async (req: Request, res: Response) => {
  const raw: unknown = req.body?.ids;
  const ids = Array.isArray(raw)
    ? [...new Set(raw.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];

  if (ids.length === 0) {
    return res.status(400).json({ error: 'Provide a non-empty "ids" array of proposal ids' });
  }
  if (ids.length > MAX_BULK_ANALYSIS) {
    return res.status(400).json({ error: `At most ${MAX_BULK_ANALYSIS} proposals can be analyzed per request` });
  }

  const results = [];
  for (const id of ids) {
    const result = await analyzeForRequest(id, req);
    results.push(
      result.ok
        ? {
            proposalId: id,
            ok: true,
            analysisSource: result.outcome.analysisSource,
            readinessScore: result.outcome.riskReport.readinessScore,
            statusAdvanced: result.outcome.statusAdvanced,
          }
        : { proposalId: id, ok: false, error: result.error }
    );
  }

  const analyzed = results.filter((r) => r.ok).length;
  res.json({ results, summary: { requested: ids.length, analyzed, failed: ids.length - analyzed } });
});

// Analyze a proposal (admin or same company only)
router.post('/:proposalId', requireAuth, async (req: Request, res: Response) => {
  const result = await analyzeForRequest(String(req.params.proposalId), req);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  res.json(formatOutcome(result.outcome));
});

export default router;
