import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import puppeteer from 'puppeteer';
import { requireAuth, isAdmin, canAccessCompany } from './middleware/auth';

const router = Router();

// Types for database rows
interface ProposalRow {
  id: string;
  title: string;
  content: string;
  status: string;
  metadata: Record<string, unknown>;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

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

// GET all proposals (admin: all; others: own company only)
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

    if (!isAdmin(req) && req.user?.companyId) {
      query = query.eq('company_id', req.user.companyId);
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
    console.error('Error fetching proposals:', error);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// GET single proposal (admin or same company only)
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

    const proposalCompanyId = (proposal as { company_id?: string }).company_id ?? null;
    if (!canAccessCompany(proposalCompanyId, req)) {
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
    console.error('Error fetching proposal:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

// POST create proposal (owned by current user's company)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { title, content, metadata } = req.body;
    const user = req.user!;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const insertPayload: Record<string, unknown> = {
      id: crypto.randomUUID(),
      title,
      content,
      status: 'PENDING',
      metadata: metadata || {},
      lockedSections: [],
      userId: user.id,
      updatedAt: new Date().toISOString(),
    };
    if (user.companyId) insertPayload.company_id = user.companyId;

    const { data: proposal, error } = await supabase
      .from('Proposal')
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;

    await supabase.from('AuditLog').insert({
      id: crypto.randomUUID(),
      actorId: user.id,
      proposalId: proposal.id,
      action: 'Created proposal',
      after: { title, status: 'PENDING' },
    });

    res.status(201).json({
      id: proposal.id,
      title: proposal.title,
      content: proposal.content,
      status: proposal.status,
      metadata: proposal.metadata,
      userId: proposal.userId,
      readinessScore: 0,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    });
  } catch (error) {
    console.error('Error creating proposal:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
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

    if (!['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'].includes(status)) {
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

    res.json({ id: proposal.id, status: proposal.status });
  } catch (error) {
    console.error('Error updating proposal:', error);
    res.status(500).json({ error: 'Failed to update proposal' });
  }
});

// DELETE proposal (admin or same company)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: proposal } = await supabase.from('Proposal').select('company_id').eq('id', id).single();
    if (proposal && !canAccessCompany((proposal as { company_id?: string }).company_id ?? null, req)) {
      return res.status(403).json({ error: 'You do not have access to this proposal' });
    }

    await supabase.from('RiskReport').delete().eq('proposalId', id);
    await supabase.from('AuditLog').delete().eq('proposalId', id);
    const { error } = await supabase.from('Proposal').delete().eq('id', id);
    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting proposal:', error);
    res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

// Export proposal to PDF (admin or same company)
router.get('/:id/export/pdf', requireAuth, async (req: Request, res: Response) => {
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

    const proposalCompanyId = (proposal as { company_id?: string }).company_id ?? null;
    if (!canAccessCompany(proposalCompanyId, req)) {
      return res.status(403).json({ error: 'You do not have access to this proposal' });
    }

    const filename = `proposal-${(proposal.title || id).replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;

    const meta = (proposal.metadata || {}) as Record<string, unknown>;
    const clientName = String(meta.clientName ?? '');
    const dealSize = meta.dealSize != null ? `$${Number(meta.dealSize).toLocaleString()}` : '';
    const discount = meta.discount != null ? `${meta.discount}%` : '';
    const region = String(meta.region ?? '');
    const industry = String(meta.industry ?? '');
    const title = proposal.title || 'Proposal';
    const date = proposal.createdAt;
    const content = proposal.content || '';

    const plainHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; padding: 24px; line-height: 1.5; }
            h1 { font-size: 20px; margin-bottom: 16px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
            .meta { margin-bottom: 16px; color: #444; font-size: 11px; }
            .meta div { margin: 4px 0; }
            .section { margin-top: 12px; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <div class="meta">
            ${clientName ? `<div><strong>Client:</strong> ${escapeHtml(clientName)}</div>` : ''}
            ${dealSize ? `<div><strong>Deal Size:</strong> ${escapeHtml(dealSize)}</div>` : ''}
            ${discount ? `<div><strong>Discount:</strong> ${escapeHtml(discount)}</div>` : ''}
            ${region ? `<div><strong>Region:</strong> ${escapeHtml(region)}</div>` : ''}
            ${industry ? `<div><strong>Industry:</strong> ${escapeHtml(industry)}</div>` : ''}
            <div><strong>Date:</strong> ${escapeHtml(new Date(date).toLocaleString())}</div>
          </div>
          <div class="section">${escapeHtml(content)}</div>
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(plainHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: false,
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:10px; font-family: Arial, Helvetica, sans-serif; padding:6px 12px; color:#666;">${escapeHtml(title)}</div>`,
      footerTemplate: '<div style="font-size:10px; font-family: Arial, Helvetica, sans-serif; width:100%; padding:6px 12px; color:#666; text-align:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

export default router;

// Simple HTML escape helper used for plain-text exports
function escapeHtml(str: any) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

