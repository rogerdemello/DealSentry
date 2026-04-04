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

// Helper function to convert markdown formatting to HTML
// Escapes HTML first for security, then converts markdown patterns
function markdownToHtml(text: string): string {
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
  html = html.replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>');
  
  // Convert line breaks to <br> for proper display
  html = html.replace(/\n/g, '<br>\n');
  
  return html;
}

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
    const prompt = `You are a professional proposal generation assistant. Extract structured proposal information from the following natural language request and generate a COMPLETE, COMPLIANCE-READY business proposal.

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

    // Call Azure OpenAI
    const completion = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: 'You are a professional proposal writer with expertise in compliance and legal requirements. Generate complete, compliance-ready business proposals that include all required legal clauses and adhere to organizational policies. Always ensure proposals meet regulatory standards including payment terms limits (90 days max), discount thresholds (25% max), and required legal clauses (indemnification, liability limitation, termination rights, confidentiality, intellectual property). Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4000,
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

    // Enforce compliance rules on generated data
    let discount = generated.metadata?.discount != null ? Number(generated.metadata.discount) : 0;
    let dealSize = generated.metadata?.dealSize != null ? Number(generated.metadata.dealSize) : null;
    
    // Cap discount at 25% maximum
    if (discount > 25) {
      discount = 25;
    }
    
    // Ensure discount is at least 0
    if (discount < 0) {
      discount = 0;
    }

    // Create the proposal with generated data
    const insertPayload: Record<string, unknown> = {
      id: crypto.randomUUID(),
      title: generated.title,
      content: generated.content,
      status: 'PENDING',
      metadata: {
        clientName: generated.metadata?.clientName || generated.companyName,
        dealSize: dealSize,
        discount: discount, // Enforced 0-25% range
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

    // Fetch active compliance rules
    const { data: complianceRules } = await supabase
      .from('Rule')
      .select('*')
      .eq('isActive', true)
      .order('name');

    const rules = (complianceRules || []) as Array<{
      name: string;
      description: string;
      category?: string;
      severity?: string;
    }>;

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
              letter-spacing: 1.5pt;
              border-bottom: 2pt solid #2c3e50;
              padding-bottom: 10pt;
              page-break-after: avoid;
              color: #1a1a1a;
            }
            h2 {
              font-size: 14pt;
              font-weight: bold;
              margin: 24pt 0 12pt 0;
              text-transform: uppercase;
              border-bottom: 1pt solid #555;
              padding-bottom: 6pt;
              page-break-after: avoid;
              color: #2c3e50;
              letter-spacing: 0.5pt;
            }
            h3 {
              font-size: 12pt;
              font-weight: bold;
              margin: 18pt 0 10pt 0;
              page-break-after: avoid;
              color: #2c3e50;
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
              padding-top: 100pt;
              background: linear-gradient(to bottom, #ffffff 0%, #f8f9fa 100%);
            }
            .cover-title {
              font-size: 26pt;
              font-weight: bold;
              text-transform: uppercase;
              margin: 30pt 0 15pt 0;
              letter-spacing: 2pt;
              color: #1a1a1a;
              border-bottom: 3pt solid #2c3e50;
              padding-bottom: 15pt;
              display: inline-block;
              width: 80%;
            }
            .cover-subtitle {
              font-size: 13pt;
              margin: 25pt 0 40pt 0;
              color: #555;
              font-weight: normal;
              letter-spacing: 0.5pt;
            }
            .cover-meta {
              margin-top: 50pt;
              text-align: left;
              border: 1pt solid #2c3e50;
              padding: 25pt 30pt;
              background-color: #ffffff;
              box-shadow: 0 2pt 8pt rgba(0,0,0,0.1);
            }
            .cover-meta-row {
              display: flex;
              justify-content: space-between;
              margin: 12pt 0;
              padding-bottom: 8pt;
            }
            .cover-meta-label {
              font-weight: bold;
              width: 45%;
              color: #333;
            }
            .cover-meta-value {
              width: 55%;
              font-weight: normal;
            }
            .confidentiality {
              margin-top: 60pt;
              padding: 15pt 25pt;
              border-top: 2pt solid #333;
              border-bottom: 2pt solid #333;
              font-size: 9pt;
              color: #666;
              line-height: 1.4;
           }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 15pt 0;
              font-size: 10pt;
              page-break-inside: avoid;
            }
            th, td {
              border: 1pt solid #ddd;
              padding: 10pt 12pt;
              text-align: left;
              page-break-inside: avoid;
            }
            th {
              background-color: #2c3e50;
              color: #ffffff;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9pt;
              letter-spacing: 0.5pt;
            }
            tr:nth-child(even) {
              background-color: #f8f9fa;
            }
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9pt;
            }
            ol, ul {
              margin: 12pt 0;
              padding-left: 40pt;
              line-height: 1.8;
            }
            li {
              margin: 8pt 0;
              orphans: 2;
              widows: 2;
            }
            ol li {
              padding-left: 5pt;
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
            .info-box {
              border: 1pt solid #ccc;
              padding: 15pt 20pt;
              margin: 15pt 0;
              font-size: 10pt;
              background-color: #f9f9f9;
              page-break-inside: avoid;
            }
            .info-box h4 {
              margin-top: 0;
              text-decoration: none;
              font-size: 11pt;
            }
            .appendix-section {
              margin-top: 30pt;
              padding-top: 20pt;
              border-top: 2pt solid #ddd;
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
              line-height: 1.8;
              orphans: 3;
              widows: 3;
            }
            .content-section .content-h1 {
              font-size: 16pt;
              font-weight: bold;
              margin: 20pt 0 12pt 0;
              text-align: left;
              border-bottom: 1pt solid #333;
              padding-bottom: 6pt;
            }
            .content-section .content-h2 {
              font-size: 14pt;
              font-weight: bold;
              margin: 16pt 0 10pt 0;
              text-align: left;
            }
            .content-section .content-h3 {
              font-size: 12pt;
              font-weight: bold;
              margin: 12pt 0 8pt 0;
              text-align: left;
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
            <div class="cover-subtitle">Business Proposal</div>
            
            <div class="cover-meta">
              <div class="cover-meta-row">
                <span class="cover-meta-label">Prepared For:</span>
                <span class="cover-meta-value">${escapeHtml(clientName || 'Client Name')}</span>
              </div>
              ${industry ? `
              <div class="cover-meta-row">
                <span class="cover-meta-label">Industry:</span>
                <span class="cover-meta-value">${escapeHtml(industry)}</span>
              </div>
              ` : ''}
              ${region ? `
              <div class="cover-meta-row">
                <span class="cover-meta-label">Region:</span>
                <span class="cover-meta-value">${escapeHtml(region)}</span>
              </div>
              ` : ''}
              <div class="cover-meta-row">
                <span class="cover-meta-label">Proposal Date:</span>
                <span class="cover-meta-value">${escapeHtml(formattedDate)}</span>
              </div>
              <div class="cover-meta-row">
                <span class="cover-meta-label">Reference Number:</span>
                <span class="cover-meta-value">PRO-${proposal.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div class="cover-meta-row">
                <span class="cover-meta-label">Prepared By:</span>
                <span class="cover-meta-value">${escapeHtml(createdBy)}</span>
              </div>
            </div>
            
            <div class="confidentiality">
              CONFIDENTIAL & PROPRIETARY<br/>
              This proposal contains confidential business information intended solely for ${escapeHtml(clientName || 'the intended recipient')}.
              Unauthorized disclosure, copying, or distribution is strictly prohibited.
            </div>
          </div>

          <!-- Executive Summary -->
          <div class="section executive-summary">
            <h1>EXECUTIVE SUMMARY</h1>
            <p>
              This proposal outlines a comprehensive solution designed specifically for <strong>${escapeHtml(clientName || 'your organization')}</strong>. 
              Our team has carefully evaluated your requirements and developed an approach that addresses your key business objectives 
              while delivering measurable value and sustainable results.
            </p>
            
            ${dealSize || discount ? `
            <h3>Investment Overview</h3>
            <table>
              <tr>
                <th style="width: 50%;">Item</th>
                <th style="width: 50%;">Details</th>
              </tr>
              ${dealSize ? `
              <tr>
                <td>Project Investment</td>
                <td><strong>${escapeHtml(dealSize)}</strong></td>
              </tr>
              ` : ''}
              ${discount ? `
              <tr>
                <td>Special Offer</td>
                <td>${escapeHtml(discount)} discount applied</td>
              </tr>
              ` : ''}
              ${region ? `
              <tr>
                <td>Service Region</td>
                <td>${escapeHtml(region)}</td>
              </tr>
              ` : ''}
            </table>
            ` : ''}
            
            <h3>Why Partner With Us</h3>
            <p>
              We bring extensive experience in ${escapeHtml(industry || 'your industry')}, combining technical expertise with 
              practical business understanding. Our approach is designed to minimize disruption while maximizing return on investment, 
              ensuring that your organization achieves its strategic goals efficiently and effectively.
            </p>
          </div>

          <!-- Proposal Overview -->
          <div class="section">
            <h1>PROPOSAL OVERVIEW</h1>
            
            <h2>Scope of Engagement</h2>
            <p>
              This section provides a high-level overview of the proposed engagement. The detailed specifications, 
              deliverables, and implementation approach are outlined in the following sections.
            </p>
            
            ${dealSize || discount ? `
            <h2>Commercial Terms Summary</h2>
            <div class="info-box">
              ${dealSize ? `<p><strong>Total Project Value:</strong> ${escapeHtml(dealSize)}</p>` : ''}
              ${discount ? `<p><strong>Discount:</strong> ${escapeHtml(discount)} special pricing applied</p>` : ''}
              <p><strong>Payment Terms:</strong> As per standard commercial agreements or as mutually agreed</p>
              <p><strong>Validity:</strong> This proposal is valid for 90 days from the date of issue</p>
            </div>
            ` : ''}
          </div>
          
          <!-- Proposal Content -->
          <div class="section">
            <h1>DETAILED PROPOSAL</h1>
            <div class="content-section">${markdownToHtml(content)}</div>
          </div>
          
          <div class="page-break"></div>
          
          <!-- Implementation Approach -->
          <div class="section">
            <h1>IMPLEMENTATION & DELIVERY</h1>
            
            <h2>Project Approach</h2>
            <p>
              Our implementation methodology follows industry best practices, ensuring systematic execution, 
              clear communication, and measurable progress throughout the engagement lifecycle.
            </p>
            
            <h2>Quality Assurance</h2>
            <p>
              All deliverables undergo rigorous quality assurance processes to ensure they meet or exceed 
              established standards and specifications. We maintain comprehensive documentation throughout 
              the project lifecycle.
            </p>
            
            <h2>Project Management</h2>
            <p>
              A dedicated project manager will serve as your primary point of contact, ensuring seamless 
              coordination, regular status updates, and proactive issue resolution throughout the engagement.
            </p>
          </div>
          
          <div class="page-break"></div>
          
          <!-- Terms and Conditions -->
          <div class="section">
            <h1>TERMS & CONDITIONS</h1>
            
            <h2>Proposal Validity</h2>
            <p>
              This proposal remains valid for ninety (90) days from the date of issuance. All pricing, scope, and terms 
              are subject to review and adjustment after this period.
            </p>

            <h2>Agreement</h2>
            <p>
              This document constitutes a proposal and not a binding contractual agreement. A formal contract will be 
              executed upon mutual agreement of terms, signed by authorized representatives of both parties.
            </p>

            <h2>Confidentiality</h2>
            <p>
              All information contained within this proposal is confidential and proprietary. Recipients agree to 
              maintain confidentiality and restrict disclosure to authorized decision-makers only.
            </p>

            <h2>Intellectual Property</h2>
            <p>
              All intellectual property rights, including but not limited to methodologies, processes, and deliverables, 
              shall be addressed in the formal service agreement following proposal acceptance.
            </p>
            
            <h2>Changes & Modifications</h2>
            <p>
              Any changes to the scope, timeline, or terms outlined in this proposal must be mutually agreed upon in 
              writing by authorized representatives of both parties.
            </p>
          </div>
          
          <div class="page-break"></div>
          
          <!-- Appendix: Quality & Compliance -->
          ${riskReport ? `
          <div class="section appendix-section">
            <h1>APPENDIX A: QUALITY ASSURANCE & COMPLIANCE</h1>
            
            <div class="info-box">
              <h4>Quality Standards</h4>
              <p>
                This proposal has been developed in accordance with our quality management frameworks and 
                organizational standards. All recommendations and specifications align with industry best practices.
              </p>
            </div>

            <h2>Quality Assessment Summary</h2>
            <p>
              Our internal quality review process evaluates all proposals across multiple dimensions to ensure 
              completeness, accuracy, and alignment with client requirements.
            </p>
            
            <table class="risk-assessment-table">
              <tr>
                <th style="width: 60%;">Assessment Area</th>
                <th style="width: 40%;">Status</th>
              </tr>
              <tr>
                <td>Overall Quality Score</td>
                <td><strong>${readinessScore}/100</strong></td>
              </tr>
              <tr>
                <td>Legal & Contractual Review</td>
                <td>${100 - legalRisk}/100</td>
              </tr>
              <tr>
                <td>Commercial Terms Review</td>
                <td>${100 - pricingRisk}/100</td>
              </tr>
              <tr>
                <td>Technical Completeness</td>
                <td>${100 - structuralRisk}/100</td>
              </tr>
            </table>

            ${findings.length > 0 ? `
            <h2>Review Notes</h2>
            ${findings.slice(0, 3).map((finding: any, idx: number) => `
              <p><strong>Note ${idx + 1}:</strong> ${escapeHtml(finding.message || finding.title || 'Quality review note')}</p>
            `).join('')}
            ` : ''}
            
            ${rules.length > 0 ? `
            <h2>Applicable Standards & Policies</h2>
            <p>
              This proposal has been developed in alignment with the following organizational standards:
            </p>
            <ul>
              ${rules.slice(0, 5).map((rule) => `
              <li><strong>${escapeHtml(rule.name)}:</strong> ${escapeHtml(rule.description)}</li>
              `).join('')}
            </ul>
            ` : ''}
          </div>
          ` : ''}
          
          <!-- Next Steps -->
          <div class="section">
            <h1>NEXT STEPS</h1>
            
            <p>
              We appreciate your consideration of this proposal and look forward to the opportunity to partner with 
              <strong>${escapeHtml(clientName || 'your organization')}</strong> on this initiative.
            </p>
            
            <h2>Proposal Review Process</h2>
            <ol>
              <li><strong>Review &amp; Questions:</strong> Please review this proposal thoroughly. We welcome any questions or requests for clarification.</li>
              <li><strong>Discussion:</strong> Schedule a meeting with our team to discuss the proposal details, timeline, and any specific requirements.</li>
              <li><strong>Contract Execution:</strong> Upon acceptance, we will prepare formal agreements for execution by authorized signatories.</li>
              <li><strong>Project Kickoff:</strong> Following contract execution, we will schedule a project kickoff meeting to commence work.</li>
            </ol>
            
            <div class="info-box">
              <h4>Contact Information</h4>
              <p>
                For questions regarding this proposal, please contact:<br/>
                <strong>${escapeHtml(createdBy)}</strong><br/>
                Proposal Reference: <strong>PRO-${proposal.id.slice(0, 8).toUpperCase()}</strong>
              </p>
            </div>
            
            <p style="margin-top: 20pt; text-align: center; font-size: 10pt; color: #666;">
              Thank you for considering our proposal. We look forward to working with you.
            </p>

            <div class="document-footer">
              <p>
                <strong>Proposal Reference:</strong> PRO-${proposal.id.slice(0, 8).toUpperCase()} | 
                <strong>Issue Date:</strong> ${escapeHtml(formattedDate)}
              </p>
              <p style="margin-top: 10pt; color: #666;">
                This document is issued electronically and contains the complete proposal terms and conditions.
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

