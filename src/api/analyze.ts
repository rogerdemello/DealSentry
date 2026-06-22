import { Router, Request, Response } from 'express';
import { AzureOpenAI } from 'openai';
import { supabase } from '../lib/supabase';
import { requireAuth, canAccessCompany } from './middleware/auth';
import { normalizeAnalysis, shouldAutoReview } from './lib/compliance';

const router = Router();

// Initialize Azure OpenAI client
const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.OPENAI_API_KEY,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
});

const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';

// Analyze a proposal (admin or same company only)
router.post('/:proposalId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { proposalId } = req.params;

    const { data: proposal, error: proposalError } = await supabase
      .from('Proposal')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (proposalError || !proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const proposalCompanyId = (proposal as { company_id?: string }).company_id ?? null;
    if (!canAccessCompany(proposalCompanyId, req)) {
      return res.status(403).json({ error: 'You do not have access to this proposal' });
    }

    // Get compliance rules
    const { data: rules } = await supabase
      .from('Rule')
      .select('*')
      .eq('isActive', true);

    const rulesText = (rules || []).map((r: { name: string; description: string }) => 
      `- ${r.name}: ${r.description}`
    ).join('\n');
    
    const metadata = proposal.metadata as Record<string, unknown>;

    // Build the prompt - metadata is optional; AI must extract/verify from document content
    const metadataDiscount = metadata?.discount != null ? Number(metadata.discount) : null;
    const metadataDealSize = metadata?.dealSize != null ? Number(metadata.dealSize) : null;
    const hasMetadataDiscount = metadataDiscount !== null && !Number.isNaN(metadataDiscount);
    const hasMetadataDealSize = metadataDealSize !== null && !Number.isNaN(metadataDealSize);

    const prompt = `You are a proposal review assistant. Analyze the following proposal against the compliance rules and provide a risk assessment.

## Proposal Details (from form – optional; verify against document)
Title: ${proposal.title}
Client: ${metadata?.clientName || 'Unknown'}
Deal Size (form): ${hasMetadataDealSize ? `$${metadataDealSize}` : 'Not provided – extract from document'}
Discount % (form): ${hasMetadataDiscount ? `${metadataDiscount}%` : 'Not provided – extract from document'}
Region: ${metadata?.region || 'Unknown'}
Industry: ${metadata?.industry || 'Unknown'}

## Proposal Content (source of truth for numbers)
${proposal.content.substring(0, 4000)}

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

    // Call Azure OpenAI
    const completion = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: 'You are a proposal compliance analyst. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response from AI');
    }

    const analysis = normalizeAnalysis(JSON.parse(responseContent));

    // Check if risk report already exists
    const { data: existingReport } = await supabase
      .from('RiskReport')
      .select('id')
      .eq('proposalId', proposalId)
      .single();

    let riskReport;
    
    if (existingReport) {
      // Update existing report
      const { data, error: updateError } = await supabase
        .from('RiskReport')
        .update({
          readinessScore: analysis.readinessScore,
          legalRisk: analysis.legalRisk,
          pricingRisk: analysis.pricingRisk,
          structuralRisk: analysis.structuralRisk,
          findings: analysis.findings,
          recommendations: analysis.recommendations,
        })
        .eq('id', existingReport.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      riskReport = data;
    } else {
      // Create new report
      const { data, error: insertError } = await supabase
        .from('RiskReport')
        .insert({
          id: crypto.randomUUID(),
          proposalId,
          readinessScore: analysis.readinessScore,
          legalRisk: analysis.legalRisk,
          pricingRisk: analysis.pricingRisk,
          structuralRisk: analysis.structuralRisk,
          findings: analysis.findings,
          recommendations: analysis.recommendations,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      riskReport = data;
    }

    // Update proposal with readiness score and status
    const updateData: { readinessScore: number; updatedAt: string; status?: string } = {
      readinessScore: analysis.readinessScore,
      updatedAt: new Date().toISOString(),
    };

    // Auto-advance to review once the proposal is healthy enough.
    if (shouldAutoReview(analysis.readinessScore)) {
      updateData.status = 'IN_REVIEW';
    }
    
    await supabase
      .from('Proposal')
      .update(updateData)
      .eq('id', proposalId);

    res.json({
      proposalId,
      riskReport: {
        id: riskReport.id,
        readinessScore: riskReport.readinessScore,
        legalRisk: riskReport.legalRisk,
        pricingRisk: riskReport.pricingRisk,
        structuralRisk: riskReport.structuralRisk,
        findings: riskReport.findings,
        recommendations: riskReport.recommendations,
      },
    });
  } catch (error) {
    console.error('Error analyzing proposal:', error);
    res.status(500).json({ error: 'Failed to analyze proposal' });
  }
});

export default router;
