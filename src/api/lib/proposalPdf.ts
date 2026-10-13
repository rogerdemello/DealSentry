/**
 * Proposal PDF export: the HTML document builder and the headless-Chrome renderer.
 *
 * Split out of the proposals router so the (large) template is easy to find and
 * the builder is a pure function that can be unit-tested without a browser.
 */

import puppeteer from 'puppeteer';
import { markdownToHtml } from './compliance';

/** HTML-escape a value for safe interpolation into the document. */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PdfFinding {
  message?: string;
  title?: string;
}

export interface ProposalPdfInput {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  /** Display name of the proposal's author. */
  createdBy: string;
  riskReport: {
    readinessScore: number;
    legalRisk: number;
    pricingRisk: number;
    structuralRisk: number;
    findings: PdfFinding[];
  } | null;
  /** Active compliance rules, listed in the appendix. */
  rules: Array<{ name: string; description: string }>;
}

/** Build the full HTML document that is rendered to PDF. */
export function buildProposalHtml(input: ProposalPdfInput): string {
  const proposal = { id: input.id };
  const meta = input.metadata || {};
  const clientName = String(meta.clientName ?? '');
  const dealSize = meta.dealSize != null ? `$${Number(meta.dealSize).toLocaleString()}` : '';
  const discount = meta.discount != null ? `${meta.discount}%` : '';
  const region = String(meta.region ?? '');
  const industry = String(meta.industry ?? '');
  const title = input.title || 'Proposal';
  const content = input.content || '';

  const riskReport = input.riskReport;
  const readinessScore = riskReport?.readinessScore || 0;
  const legalRisk = riskReport?.legalRisk || 0;
  const pricingRisk = riskReport?.pricingRisk || 0;
  const structuralRisk = riskReport?.structuralRisk || 0;
  const findings = riskReport?.findings ?? [];

  const createdBy = input.createdBy;
  const rules = input.rules;

  const formattedDate = new Date(input.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
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
          ${findings.slice(0, 3).map((finding, idx) => `
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
}

/**
 * Chromium flags that let headless Chrome fit constrained hosts (e.g. Render's
 * 512MB free tier). --single-process is the biggest saver.
 */
const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
];

async function renderPdfOnce(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: CHROME_ARGS,
    // 'new' headless runs the regular Chrome binary; `true` (old headless)
    // makes Puppeteer look for the separate chrome-headless-shell install,
    // which breaks local dev where only Chrome is downloaded.
    headless: 'new',
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
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
    return Buffer.from(pdf);
  } finally {
    // Always release Chrome: a leaked process per failed export would exhaust a small host.
    await browser.close();
  }
}

/** Exports run one at a time: two concurrent Chromes would not fit in 512MB. */
let renderQueue: Promise<unknown> = Promise.resolve();

/** Render an HTML document to a PDF buffer. */
export function renderPdf(html: string): Promise<Buffer> {
  const run = renderQueue.then(() => renderPdfOnce(html));
  renderQueue = run.catch(() => undefined);
  return run;
}
