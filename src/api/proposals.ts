import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import puppeteer from 'puppeteer';
import { requireAuth, isAdmin, canAccessCompany } from './middleware/auth';
import { AzureOpenAI } from 'openai';

const router = Router();

// Initialize Azure OpenAI client
const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.OPENAI_API_KEY,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
});

const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';

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

// POST generate proposal from natural language using AI
router.post('/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { naturalLanguageQuery } = req.body;
    const user = req.user!;

    if (!naturalLanguageQuery || !naturalLanguageQuery.trim()) {
      return res.status(400).json({ error: 'Natural language query is required' });
    }

    // Use AI to extract proposal details from natural language
    const prompt = `You are a proposal generation assistant. Extract structured proposal information from the following natural language request.

User Request:
${naturalLanguageQuery}

Extract and generate:
1. Company name (required)
2. Proposal title (required) - create a professional title if not explicitly stated
3. Proposal content (required) - expand the request into a detailed professional proposal with proper sections
4. Client name (if different from company name)
5. Deal size (if mentioned, extract as number without currency symbols)
6. Discount percentage (if mentioned, extract as number without % symbol)
7. Region (if mentioned, otherwise "North America")
8. Currency (if mentioned, otherwise "USD")
9. Industry (if mentioned, otherwise "General")

Generate a comprehensive proposal document with:
- Executive Summary
- Proposed Solution/Services
- Pricing (if mentioned in request)
- Timeline (if mentioned)
- Terms and Conditions
- Next Steps

Respond in JSON format:
{
  "companyName": "string (required)",
  "title": "string (required)",
  "content": "string (required - full proposal text with sections)",
  "metadata": {
    "clientName": "string",
    "dealSize": number or null,
    "discount": number or null,
    "region": "string",
    "currency": "string",
    "industry": "string"
  }
}`;

    // Call Azure OpenAI
    const completion = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: 'You are a professional proposal writer. Generate structured, detailed proposals from natural language. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response from AI');
    }

    const generated = JSON.parse(responseContent);

    if (!generated.companyName || !generated.title || !generated.content) {
      return res.status(400).json({ 
        error: 'AI could not extract required fields (company name, title, content) from the query. Please provide more details.' 
      });
    }

    // Create the proposal with generated data
    const insertPayload: Record<string, unknown> = {
      id: crypto.randomUUID(),
      title: generated.title,
      content: generated.content,
      status: 'PENDING',
      metadata: {
        clientName: generated.metadata?.clientName || generated.companyName,
        dealSize: generated.metadata?.dealSize || null,
        discount: generated.metadata?.discount || null,
        region: generated.metadata?.region || 'North America',
        currency: generated.metadata?.currency || 'USD',
        industry: generated.metadata?.industry || 'General',
      },
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
      action: 'Created proposal from AI generation',
      after: { title: generated.title, status: 'PENDING', source: 'ai-generated' },
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
    console.error('Error generating proposal from AI:', error);
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

    // Extract risk report data
    const riskReport = (proposal.RiskReport as RiskReportRow[])?.[0];
    const readinessScore = riskReport?.readinessScore || 0;
    const legalRisk = riskReport?.legalRisk || 0;
    const pricingRisk = riskReport?.pricingRisk || 0;
    const structuralRisk = riskReport?.structuralRisk || 0;
    const findings = (riskReport?.findings as any[]) || [];
    const recommendations = (riskReport?.recommendations as any[]) || [];

    // Helper function to get risk color and label
    const getRiskLevel = (score: number) => {
      if (score >= 70) return { color: '#22c55e', label: 'Low Risk', bg: '#f0fdf4' };
      if (score >= 40) return { color: '#f59e0b', label: 'Medium Risk', bg: '#fef3c7' };
      return { color: '#ef4444', label: 'High Risk', bg: '#fee2e2' };
    };

    const readinessLevel = getRiskLevel(readinessScore);
    const legalLevel = getRiskLevel(100 - legalRisk);
    const pricingLevel = getRiskLevel(100 - pricingRisk);
    const structuralLevel = getRiskLevel(100 - structuralRisk);

    // Get current user info
    const userInfo = proposal.User as UserRow;
    const createdBy = userInfo?.name || userInfo?.email || 'System';

    // Format date
    const formattedDate = new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const plainHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${escapeHtml(title)}</title>
          <style>
            @page { 
              margin: 25mm 20mm;
              size: A4;
            }
            body { 
              font-family: 'Times New Roman', Times, serif;
              font-size: 11pt;
              color: #000000;
              line-height: 1.6;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            strong, b {
              font-weight: bold;
            }
            h1 {
              font-size: 18pt;
              font-weight: bold;
              margin: 0 0 20pt 0;
              text-align: center;
              text-transform: uppercase;
              letter-spacing: 1pt;
              border-bottom: 2pt solid #000000;
              padding-bottom: 8pt;
              page-break-after: avoid;
            }
            h2 {
              font-size: 14pt;
              font-weight: bold;
              margin: 24pt 0 12pt 0;
              text-transform: uppercase;
              border-bottom: 1pt solid #000000;
              padding-bottom: 4pt;
              page-break-after: avoid;
            }
            h3 {
              font-size: 12pt;
              font-weight: bold;
              margin: 18pt 0 10pt 0;
              page-break-after: avoid;
            }
            h4 {
              font-size: 11pt;
              font-weight: bold;
              margin: 14pt 0 8pt 0;
              text-decoration: underline;
              page-break-after: avoid;
            }
            p {
              margin: 10pt 0;
              text-align: justify;
              text-indent: 0;
              orphans: 3;
              widows: 3;
            }
            .cover-page {
              page-break-after: always;
              text-align: center;
              padding-top: 80pt;
            }
            .cover-title {
              font-size: 24pt;
              font-weight: bold;
              text-transform: uppercase;
              margin: 40pt 0 20pt 0;
              letter-spacing: 2pt;
              border-bottom: 3pt solid #000000;
              padding-bottom: 15pt;
            }
            .cover-subtitle {
              font-size: 14pt;
              margin: 30pt 0;
            }
            .cover-meta {
              margin-top: 60pt;
              text-align: left;
              border: 2pt solid #000000;
              padding: 25pt;
            }
            .cover-meta-row {
              display: flex;
              justify-content: space-between;
              margin: 10pt 0;
              border-bottom: 1pt dotted #666666;
              padding-bottom: 10pt;
            }
            .cover-meta-label {
              font-weight: bold;
              width: 40%;
            }
            .cover-meta-value {
              width: 60%;
              font-weight: normal;
            }
            .confidentiality {
              margin-top: 50pt;
              padding: 20pt;
              border: 3pt double #000000;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9pt;
           }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 15pt 0;
              font-size: 10pt;
              page-break-inside: avoid;
            }
            th, td {
              border: 1pt solid #000000;
              padding: 10pt;
              text-align: left;
              page-break-inside: avoid;
            }
            th {
              background-color: #e8e8e8;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9pt;
            }
            ul, ol {
              margin: 10pt 0;
              padding-left: 35pt;
            }
            li {
              margin: 6pt 0;
              orphans: 2;
              widows: 2;
            }
            .section {
              margin: 0;
              padding-top: 30pt;
            }
            .section:first-child {
              padding-top: 0;
            }
            .executive-summary {
              page-break-after: always;
            }
            .executive-summary h3 {
              margin-top: 20pt;
            }
            .metrics-table-wrapper {
              page-break-inside: avoid;
            }
            .compliance-notice {
              border: 2pt double #000000;
              padding: 15pt 20pt;
              margin: 20pt 0;
              font-size: 10pt;
              background-color: #f5f5f5;
              page-break-inside: avoid;
            }
            .compliance-notice h4 {
              margin-top: 0;
              text-decoration: none;
            }
            .finding-item, .recommendation-item {
              margin: 15pt 0;
              padding: 15pt 20pt;
              border: 1pt solid #000000;
              page-break-inside: avoid;
              background-color: #fafafa;
            }
            .finding-number, .recommendation-number {
              font-weight: bold;
              margin-bottom: 10pt;
              font-size: 11pt;
              text-transform: uppercase;
              letter-spacing: 0.5pt;
            }
            .severity {
              font-weight: bold;
              text-transform: uppercase;
              float: right;
            }
            .severity-critical {
              text-decoration: underline;
              font-style: italic;
            }
            .severity-high {
              font-style: italic;
            }
           .content-section {
              margin: 20pt 0;
              padding: 0 10pt;
              text-align: justify;
              white-space: pre-wrap;
              line-height: 1.8;
              orphans: 3;
              widows: 3;
            }
            .page-break {
              page-break-after: always;
              height: 0;
              margin: 0;
              padding: 0;
            }
            .risk-assessment-table {
              margin: 20pt 0;
              page-break-inside: avoid;
            }
            .document-footer {
              margin-top: 40pt;
              padding-top: 15pt;
              border-top: 2pt solid #000000;
              font-size: 9pt;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <!-- Cover Page -->
          <div class="cover-page">
            <div class="cover-title">${escapeHtml(title)}</div>
            <div class="cover-subtitle">BUSINESS PROPOSAL DOCUMENT</div>
            
            <div class="cover-meta">
              <div class="cover-meta-row">
                <span class="cover-meta-label"><strong>PREPARED FOR:</strong></span>
                <span class="cover-meta-value">${escapeHtml(clientName || 'CLIENT NAME')}</span>
              </div>
              <div class="cover-meta-row">
                <span class="cover-meta-label"><strong>PREPARED BY:</strong></span>
                <span class="cover-meta-value">${escapeHtml(createdBy)}</span>
              </div>
              <div class="cover-meta-row">
                <span class="cover-meta-label"><strong>DATE:</strong></span>
                <span class="cover-meta-value">${escapeHtml(formattedDate)}</span>
              </div>
              <div class="cover-meta-row">
                <span class="cover-meta-label"><strong>DOCUMENT REF:</strong></span>
                <span class="cover-meta-value">PRO-${proposal.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div class="cover-meta-row">
                <span class="cover-meta-label"><strong>STATUS:</strong></span>
                <span class="cover-meta-value">${escapeHtml(proposal.status)}</span>
              </div>
            </div>
            
            <div class="confidentiality">
              <strong>CONFIDENTIAL</strong><br/>
              This document contains proprietary and confidential information.<br/>
              Unauthorized distribution is strictly prohibited.
            </div>
          </div>

          <!-- Executive Summary -->
          <div class="section executive-summary">
            <h1>EXECUTIVE SUMMARY</h1>
            <p>
              This business proposal has been prepared for <strong>${escapeHtml(clientName || 'the client')}</strong> 
              and contains a comprehensive overview of the proposed engagement, commercial terms, and risk assessment.
            </p>
            
            ${riskReport ? `
            <p>
              Following a thorough compliance and risk analysis, this proposal has achieved an overall readiness score of 
              <strong>${readinessScore}/100</strong>, classified as <strong>${readinessLevel.label}</strong>. 
              ${readinessScore >= 70 ? 'The proposal meets all compliance standards and is recommended for approval pending standard review procedures.' :
                readinessScore >= 40 ? 'The proposal demonstrates moderate compliance levels and requires specific improvements before final approval.' :
                'The proposal has identified significant compliance gaps that must be addressed prior to proceeding with the engagement.'}
            </p>
            ` : ''}

            <div class="metrics-table-wrapper">
              <h3>Key Proposal Metrics</h3>
              <table>
              <tr>
                <th>Parameter</th>
                <th>Value</th>
              </tr>
              ${clientName ? `
              <tr>
                <td>Client Name</td>
                <td>${escapeHtml(clientName)}</td>
              </tr>
              ` : ''}
              ${dealSize ? `
              <tr>
                <td>Deal Value</td>
                <td>${escapeHtml(dealSize)}</td>
              </tr>
              ` : ''}
              ${discount ? `
              <tr>
                <td>Discount Applied</td>
                <td>${escapeHtml(discount)}</td>
              </tr>
              ` : ''}
              ${region ? `
              <tr>
                <td>Geographic Region</td>
                <td>${escapeHtml(region)}</td>
              </tr>
              ` : ''}
              ${industry ? `
              <tr>
                <td>Industry Sector</td>
                <td>${escapeHtml(industry)}</td>
              </tr>
              ` : ''}
              <tr>
                <td>Document Status</td>
                <td>${escapeHtml(proposal.status)}</td>
              </tr>
              </table>
            </div>
          </div>

          ${riskReport ? `
          <!-- Compliance & Risk Assessment -->
          <div class="section">
            <h1>COMPLIANCE & RISK ASSESSMENT REPORT</h1>
            
            <div class="compliance-notice">
              <h4>COMPLIANCE CERTIFICATION</h4>
              <p>
                This proposal has undergone automated compliance verification against <strong>established organizational
                policies, legal requirements, and industry best practices</strong>. The assessment evaluates legal compliance,
                pricing integrity, and structural conformance.
              </p>
            </div>

            <h2>1. OVERALL READINESS ASSESSMENT</h2>
            <p>
              The proposal has been evaluated across multiple compliance dimensions, resulting in an aggregate 
              readiness score that reflects the document's preparedness for executive review and client presentation.
            </p>
            
            <table class="risk-assessment-table">
              <tr>
                <th style="width: 50%;">Assessment Category</th>
                <th style="width: 25%;">Score</th>
                <th style="width: 25%;">Classification</th>
              </tr>
              <tr>
                <td><strong>Overall Readiness Score</strong></td>
                <td><strong>${readinessScore}/100</strong></td>
                <td><strong>${readinessLevel.label}</strong></td>
              </tr>
              <tr>
                <td>Legal & Regulatory Compliance Risk</td>
                <td>${legalRisk}/100</td>
                <td>${legalLevel.label}</td>
              </tr>
              <tr>
                <td>Pricing & Commercial Terms Risk</td>
                <td>${pricingRisk}/100</td>
                <td>${pricingLevel.label}</td>
              </tr>
              <tr>
                <td>Structural & Format Compliance Risk</td>
                <td>${structuralRisk}/100</td>
                <td>${structuralLevel.label}</td>
              </tr>
            </table>

            <h3>Risk Score Interpretation</h3>
            <ul>
              <li><strong>0-39 (High Risk):</strong> Significant compliance issues identified requiring immediate attention and remediation.</li>
              <li><strong>40-69 (Medium Risk):</strong> Moderate compliance concerns present; specific improvements recommended before proceeding.</li>
              <li><strong>70-100 (Low Risk):</strong> Acceptable compliance levels met; proposal suitable for standard approval process.</li>
            </ul>

            ${findings.length > 0 ? `
          </div>
          
          <div class="page-break"></div>
          
          <div class="section">
            <h2>2. COMPLIANCE FINDINGS</h2>
            <p>
              The following compliance findings have been identified during the automated assessment process.
              Each finding includes a severity classification and detailed description for remediation purposes.
            </p>
            
            ${findings.map((finding: any, idx: number) => `
              <div class="finding-item">
                <div class="finding-number">
                  <strong>FINDING ${idx + 1}</strong>
                  ${(finding.severity || finding.level) ? `<span class="severity severity-${(finding.severity || finding.level || '').toLowerCase()}"><strong>[${escapeHtml((finding.severity || finding.level).toUpperCase())}]</strong></span>` : ''}
                </div>
                <p><strong>Issue:</strong> ${escapeHtml(finding.issue || finding.message || finding.title || 'Compliance issue identified')}</p>
                <p><strong>Description:</strong> ${escapeHtml(finding.description || finding.details || 'No additional details provided.')}</p>
                ${finding.location ? `<p><strong>Location:</strong> ${escapeHtml(finding.location)}</p>` : ''}
              </div>
            `).join('')}
            ` : ''}

            ${recommendations.length > 0 ? `
          </div>
          
          <div class="page-break"></div>
          
          <div class="section">
            <h2>3. RECOMMENDATIONS FOR COMPLIANCE</h2>
            <p>
              Based on the compliance assessment, the following recommendations are provided to enhance
              the proposal's adherence to organizational policies and regulatory requirements.
            </p>
            
            ${recommendations.map((rec: any, idx: number) => `
              <div class="recommendation-item">
                <div class="recommendation-number"><strong>RECOMMENDATION ${idx + 1}</strong></div>
                <p><strong>Action Required:</strong> ${escapeHtml(rec.action || rec.suggestion || rec.title || 'Recommendation')}</p>
                <p><strong>Rationale:</strong> ${escapeHtml(rec.rationale || rec.reason || rec.description || rec.details || 'Implementation of this recommendation will improve compliance posture.')}</p>
              </div>
            `).join('')}
            ` : ''}
          </div>
          ` : ''}
          
          <div class="page-break"></div>
          
          <!-- Proposal Content -->
          <div class="section">
            <h1>PROPOSAL DETAILS</h1>
            <div class="content-section">${escapeHtml(content)}</div>
          </div>
          
          <div class="page-break"></div>
          
          <!-- Legal Disclaimers -->
          <div class="section">
            <h2>LEGAL NOTICES & DISCLAIMERS</h2>
            
            <h3>Confidentiality</h3>
            <p>
              This document and all information contained herein are confidential and proprietary. This proposal
              is intended solely for the use of the individual or entity to whom it is addressed. If you are not
              the intended recipient, you are hereby notified that any dissemination, distribution, copying, or
              use of this document is strictly prohibited.
            </p>

            <h3>Validity Period</h3>
            <p>
              This proposal is valid for a period of ninety (90) days from the date of issuance. All pricing,
              terms, and conditions are subject to change after this period without prior notice.
            </p>

            <h3>Binding Agreement</h3>
            <p>
              This document constitutes a proposal only and does not represent a binding contractual agreement
              until such time as it is formally accepted in writing by both parties and executed according to
              standard contracting procedures.
            </p>

            <h3>Acceptance</h3>
            <p>
              Acceptance of this proposal shall constitute agreement to all terms and conditions set forth herein,
              as well as adherence to any additional policies and procedures referenced in this document or
              incorporated by reference.
            </p>

            <div class="document-footer">
              <p>
                <strong>Document Reference:</strong> PRO-${proposal.id.slice(0, 8).toUpperCase()} | 
                <strong>Generated:</strong> ${escapeHtml(formattedDate)} |
                <strong>Status:</strong> ${escapeHtml(proposal.status)}
              </p>
              <p style="margin-top: 10pt;">
                This document was generated electronically and is valid without signature.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({ 
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    });
    const page = await browser.newPage();
    await page.setContent(plainHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '25mm', bottom: '25mm', left: '20mm', right: '20mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-size:9pt; font-family: 'Times New Roman', Times, serif; 
                    width:100%; padding:0 20mm; text-align:center; color:#000000;">
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `,
      preferCSSPageSize: false,
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

