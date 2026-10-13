import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, listScope } from './middleware/auth';
import { buildAnalyticsSummary, type AnalyticsProposal } from './lib/analytics';
import { logger } from './lib/logger';

const router = Router();

interface ProposalAnalyticsRow {
  status: string;
  createdAt: string;
  metadata: AnalyticsProposal['metadata'];
  RiskReport?: Array<{
    readinessScore?: number;
    legalRisk?: number;
    pricingRisk?: number;
    structuralRisk?: number;
  }>;
}

// GET /api/analytics/summary — chart-ready aggregates (admin: all; others: own company)
router.get('/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    let query = supabase
      .from('Proposal')
      .select(`
        status,
        createdAt,
        metadata,
        RiskReport (readinessScore, legalRisk, pricingRisk, structuralRisk)
      `);

    const scope = listScope(req);
    if (scope) {
      query = query.eq(scope.column, scope.value);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const proposals: AnalyticsProposal[] = (rows || []).map((r: ProposalAnalyticsRow) => {
      const risk = r.RiskReport?.[0];
      return {
        status: r.status,
        createdAt: r.createdAt,
        readinessScore: risk?.readinessScore ?? 0,
        riskReport: risk
          ? {
              legalRisk: risk.legalRisk,
              pricingRisk: risk.pricingRisk,
              structuralRisk: risk.structuralRisk,
            }
          : null,
        metadata: r.metadata,
      };
    });

    res.json(buildAnalyticsSummary(proposals));
  } catch (error) {
    logger.error('Error building analytics summary:', error);
    res.status(500).json({ error: 'Failed to build analytics summary' });
  }
});

export default router;
