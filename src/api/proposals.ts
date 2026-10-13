import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, isAdmin, canAccessResource, listScope } from './middleware/auth';
import { aiLimiter, exportLimiter } from './middleware/rateLimit';
import { sendEmail } from './lib/email';
import { buildStatusChangeEmail } from './lib/emailTemplates';
import { generateEmbedding } from './lib/embeddings';
import { getLlm } from './lib/llm';
import { logger } from './lib/logger';
import { buildProposalHtml, renderPdf } from './lib/proposalPdf';
import { GENERATION_SYSTEM_PROMPT, buildGenerationPrompt, normalizeGenerated } from './lib/proposalGeneration';
import { createProposalRecord, toCreatedResponse, type ProposalRow } from './lib/proposalStore';

const router = Router();

const STATUSES = ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'];

interface RiskReportRow {
  id: string;
  proposalId: string;
  readinessScore: number;
  legalRisk: number;
  pricingRisk: number;
  structuralRisk: number;
  findings: unknown[];
  recommendations: unknown[];
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
}

/** The ownership fields canAccessResource needs, read off a `select('*')` row. */
const ownership = (row: { company_id?: string | null; userId?: string | null }) => ({
  companyId: row.company_id ?? null,
  ownerId: row.userId ?? null,
});

// GET all proposals (admin: all; others: own company, or own proposals in login mode)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    let query = supabase
      .from('Proposal')
      .select(`
        *,
        User:userId (name, email),
        RiskReport (readinessScore, legalRisk, pricingRisk, structuralRisk, findings, recommendations)
      `)
      .order('createdAt', { ascending: false });

    const scope = listScope(req);
    if (scope) {
      query = query.eq(scope.column, scope.value);
    }

    const { data: proposals, error } = await query;

    if (error) throw error;

    const formatted = (proposals || []).map((p: ProposalRow & { User: UserRow; RiskReport: RiskReportRow[] }) => {
      const riskReport = p.RiskReport?.[0];

      return {
        id: p.id,
        title: p.title,
        content: p.content,
        status: p.status,
        metadata: p.metadata || {},
        userId: p.userId,
        readinessScore: riskReport?.readinessScore || 0,
        riskReport: riskReport
          ? {
              legalRisk: riskReport.legalRisk,
              pricingRisk: riskReport.pricingRisk,
              structuralRisk: riskReport.structuralRisk,
              findings: riskReport.findings,
              recommendations: riskReport.recommendations,
            }
          : undefined,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    res.json(formatted);
  } catch (error) {
    logger.error('Error fetching proposals:', error);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// GET semantic search over proposal content (Phase 4).
// Returns ranked proposal ids; `available:false` when pgvector/embeddings are
// not set up yet, so the client falls back to substring search.
// NOTE: must precede GET '/:id'.
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 3) {
      return res.json({ available: true, results: [] });
    }

    const queryEmbedding = await generateEmbedding(q);
    if (!queryEmbedding) {
      return res.json({ available: false, results: [] });
    }

    // Company scoping: admins search everything, others their company only.
    const scope = listScope(req);
    const filterCompany = scope?.column === 'company_id' ? scope.value : null;

    const { data, error } = await supabase.rpc('match_proposals', {
      query_embedding: queryEmbedding,
      match_count: 20,
      filter_company: filterCompany,
    });

    if (error) {
      // RPC/extension/column not present yet — signal graceful fallback.
      logger.warn('Semantic search unavailable (run the pgvector migration):', error.message);
      return res.json({ available: false, results: [] });
    }

    let results = (data || []).map((r: { id: string; similarity: number }) => ({
      id: r.id,
      similarity: r.similarity,
    }));

    // Users with no company (login mode) may only see what they own.
    if (scope?.column === 'userId') {
      const { data: owned } = await supabase.from('Proposal').select('id').eq('userId', scope.value);
      const ownedIds = new Set((owned || []).map((p: { id: string }) => p.id));
      results = results.filter((r: { id: string }) => ownedIds.has(r.id));
    }

    res.json({ available: true, results });
  } catch (error) {
    logger.error('Error in semantic search:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// POST create proposal (owned by current user's company)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { title, content, metadata } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const proposal = await createProposalRecord(
      req.user!,
      { title, content, metadata },
      { action: 'Created proposal', after: { title, status: 'PENDING' } }
    );

    res.status(201).json(toCreatedResponse(proposal));
  } catch (error) {
    logger.error('Error creating proposal:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// POST generate proposal from natural language using AI
router.post('/generate', aiLimiter, requireAuth, async (req: Request, res: Response) => {
  try {
    const { naturalLanguageQuery } = req.body;

    if (typeof naturalLanguageQuery !== 'string' || !naturalLanguageQuery.trim()) {
      return res.status(400).json({ error: 'Natural language query is required' });
    }

    const llm = getLlm();
    if (!llm) {
      return res.status(424).json({
        error: 'AI generation is not configured on this server. Set GEMINI_API_KEY (or the Azure OpenAI variables).',
        code: 'AI_UNAVAILABLE',
      });
    }

    let responseContent: string | null | undefined;
    try {
      const completion = await llm.client.chat.completions.create(
        {
          model: llm.model,
          messages: [
            { role: 'system', content: GENERATION_SYSTEM_PROMPT },
            { role: 'user', content: buildGenerationPrompt(naturalLanguageQuery) },
          ],
          temperature: 0.7,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
          ...llm.extraParams,
        },
        { timeout: 60_000, maxRetries: 1 }
      );
      responseContent = completion.choices[0]?.message?.content;
    } catch (aiError) {
      logger.error('AI provider call failed during generation:', aiError);
      return res.status(424).json({
        error: 'The AI provider could not be reached. Please try again shortly.',
        code: 'AI_UNAVAILABLE',
      });
    }

    if (!responseContent) {
      throw new Error('No response from AI');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(responseContent);
    } catch {
      return res.status(502).json({ error: 'The AI returned an unreadable response. Please try again.' });
    }

    // Never trust the model's numbers: validate and clamp them in code.
    const generated = normalizeGenerated(raw);
    if (!generated) {
      return res.status(400).json({
        error: 'AI could not extract required fields (company name, title, content) from the query. Please provide more details.',
      });
    }

    const proposal = await createProposalRecord(
      req.user!,
      { title: generated.title, content: generated.content, metadata: generated.metadata },
      {
        action: 'Created proposal from AI generation',
        after: { title: generated.title, status: 'PENDING', source: 'ai-generated' },
      }
    );

    res.status(201).json(toCreatedResponse(proposal));
  } catch (error) {
    logger.error('Error generating proposal from AI:', error);
    res.status(500).json({ error: 'Failed to generate proposal from natural language' });
  }
});

// PUT update proposal status (admin only)
router.put('/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Only administrators can approve, reject, or mark proposals in review' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data: proposal, error } = await supabase
      .from('Proposal')
      .update({ status, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from('AuditLog').insert({
      id: crypto.randomUUID(),
      actorId: req.user!.id,
      proposalId: id,
      action: `Changed status to ${status}`,
      after: { status },
    });

    // Notify the proposal owner of the status change (gated + best-effort).
    try {
      const { data: owner } = await supabase
        .from('User')
        .select('name, email')
        .eq('id', proposal.userId)
        .single();
      if (owner?.email) {
        await sendEmail(
          owner.email,
          buildStatusChangeEmail({
            proposalTitle: proposal.title,
            status,
            recipientName: owner.name,
          })
        );
      }
    } catch (mailErr) {
      logger.error('Status-change email failed (non-fatal):', mailErr);
    }

    res.json({ id: proposal.id, status: proposal.status });
  } catch (error) {
    logger.error('Error updating proposal:', error);
    res.status(500).json({ error: 'Failed to update proposal' });
  }
});

// DELETE proposal (admin or same company; the owner in login mode)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: proposal } = await supabase.from('Proposal').select('*').eq('id', id).single();
    if (proposal && !canAccessResource(ownership(proposal), req)) {
      return res.status(403).json({ error: 'You do not have access to this proposal' });
    }

    await supabase.from('RiskReport').delete().eq('proposalId', id);
    await supabase.from('AuditLog').delete().eq('proposalId', id);
    const { error } = await supabase.from('Proposal').delete().eq('id', id);
    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting proposal:', error);
    res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

// Export proposal to PDF (admin or same company)
router.get('/:id/export/pdf', exportLimiter, requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: proposal, error } = await supabase
      .from('Proposal')
      .select(`*, User:userId (name, email), RiskReport (*)`)
      .eq('id', id)
      .single();

    if (error || !proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (!canAccessResource(ownership(proposal), req)) {
      return res.status(403).json({ error: 'You do not have access to this proposal' });
    }

    const { data: complianceRules } = await supabase
      .from('Rule')
      .select('*')
      .eq('isActive', true)
      .order('name');

    const riskReport = (proposal.RiskReport as RiskReportRow[] | null)?.[0];
    const author = proposal.User as UserRow | null;

    const html = buildProposalHtml({
      id: proposal.id,
      title: proposal.title,
      content: proposal.content,
      createdAt: proposal.createdAt,
      metadata: (proposal.metadata || {}) as Record<string, unknown>,
      createdBy: author?.name || author?.email || 'System',
      riskReport: riskReport
        ? {
            readinessScore: riskReport.readinessScore,
            legalRisk: riskReport.legalRisk,
            pricingRisk: riskReport.pricingRisk,
            structuralRisk: riskReport.structuralRisk,
            findings: (riskReport.findings || []) as Array<{ message?: string; title?: string }>,
          }
        : null,
      rules: (complianceRules || []) as Array<{ name: string; description: string }>,
    });

    const pdfBuffer = await renderPdf(html);

    const filename = `proposal-${(proposal.title || id).replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    logger.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

// GET single proposal (admin or same company only) - MUST BE AFTER SPECIFIC ROUTES
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: proposal, error } = await supabase
      .from('Proposal')
      .select(`
        *,
        User:userId (name, email),
        RiskReport (*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (!canAccessResource(ownership(proposal), req)) {
      return res.status(403).json({ error: 'You do not have access to this proposal' });
    }

    const riskReport = proposal.RiskReport?.[0];

    res.json({
      id: proposal.id,
      title: proposal.title,
      content: proposal.content,
      status: proposal.status,
      metadata: proposal.metadata || {},
      userId: proposal.userId,
      readinessScore: riskReport?.readinessScore || 0,
      riskReport: riskReport ? {
        legalRisk: riskReport.legalRisk,
        pricingRisk: riskReport.pricingRisk,
        structuralRisk: riskReport.structuralRisk,
        findings: riskReport.findings,
        recommendations: riskReport.recommendations,
      } : null,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    });
  } catch (error) {
    logger.error('Error fetching proposal:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

export default router;
