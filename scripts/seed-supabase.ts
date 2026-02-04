import { supabase } from '../src/lib/supabase';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';

config();

async function seed() {
  console.log('🌱 Seeding Supabase database...');

  try {
    // Create demo users
    const { data: existingAdmin } = await supabase
      .from('User')
      .select('id')
      .eq('email', 'admin@reviewer.ai')
      .single();

    let adminUser;
    if (!existingAdmin) {
      const { data, error } = await supabase
        .from('User')
        .insert({
          id: randomUUID(),
          email: 'admin@reviewer.ai',
          name: 'Admin User',
          role: 'ADMIN',
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      adminUser = data;
    } else {
      adminUser = existingAdmin;
    }

    const { data: existingDemo } = await supabase
      .from('User')
      .select('id')
      .eq('email', 'demo@reviewer.ai')
      .single();

    let demoUser;
    if (!existingDemo) {
      const { data, error } = await supabase
        .from('User')
        .insert({
          id: randomUUID(),
          email: 'demo@reviewer.ai',
          name: 'Demo Sales Rep',
          role: 'SALES_REP',
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      demoUser = data;
    } else {
      demoUser = existingDemo;
    }

    console.log('✅ Created users');

    // Create compliance rules
    const rules = [
      {
        name: 'Maximum Discount Threshold',
        type: 'PRICING',
        description: 'Enforce maximum discount limit of 25% on all proposals',
        logic: { maxDiscount: 25 },
        isActive: true,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'Required Legal Clauses',
        type: 'LEGAL',
        description: 'Ensure all proposals include indemnification, limitation of liability, and confidentiality clauses',
        logic: { requiredTerms: ['indemnification', 'limitation of liability', 'confidentiality'] },
        isActive: true,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'Minimum Deal Size',
        type: 'PRICING',
        description: 'Require minimum deal size of $10,000',
        logic: { minDealSize: 10000 },
        isActive: true,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'Payment Terms Limit',
        type: 'PRICING',
        description: 'Maximum payment terms of 90 days',
        logic: { maxPaymentDays: 90 },
        isActive: true,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'Deal Size Approval Threshold',
        type: 'PRICING',
        description: 'Deals over $100,000 require manager approval',
        logic: { approvalThreshold: 100000 },
        isActive: true,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'Liability Cap Required',
        type: 'LEGAL',
        description: 'All proposals must include a liability cap clause',
        logic: { requiredClause: 'liability cap' },
        isActive: true,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'Auto-Renewal Disclosure',
        type: 'LEGAL',
        description: 'Auto-renewal terms must be clearly disclosed',
        logic: { requiredDisclosure: 'auto-renewal' },
        isActive: true,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'Termination Rights',
        type: 'LEGAL',
        description: 'Clear termination rights must be specified',
        logic: { requiredClause: 'termination' },
        isActive: true,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const rule of rules) {
      const { error } = await supabase
        .from('Rule')
        .upsert({ id: randomUUID(), ...rule }, { onConflict: 'name' });
      
      if (error && error.code !== '23505') { // Ignore duplicate key errors
        console.error('Error creating rule:', rule.name, error);
      }
    }
    console.log('✅ Created', rules.length, 'compliance rules');

    // Create templates
    const templates = [
      {
        name: 'Standard Sales Proposal',
        description: 'A comprehensive sales proposal template for enterprise deals',
        type: 'SALES_PROPOSAL',
        content: `# Sales Proposal

## Executive Summary

This proposal outlines our solution to meet your business needs and deliver measurable value.

## Scope of Work

### Phase 1: Discovery & Planning
- Requirements gathering
- Stakeholder interviews
- Technical assessment

### Phase 2: Implementation
- System configuration
- Data migration
- Integration setup

### Phase 3: Go-Live & Support
- User training
- Production deployment
- 30-day support

## Pricing

Total Investment: $XXX,XXX
Payment Terms: Net 30

## Terms & Conditions

1. **Limitation of Liability**: Our liability is limited to the amount paid.
2. **Indemnification**: Both parties agree to indemnify each other.
3. **Confidentiality**: All information shared remains confidential.
4. **Termination**: Either party may terminate with 30 days notice.`,
        metadata: { defaultDealSize: 50000, defaultDiscount: 0 },
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'Master Services Agreement',
        description: 'Legal framework for ongoing service relationships',
        type: 'MSA',
        content: `# Master Services Agreement

## 1. Parties

This Agreement is entered into between [Company Name] ("Service Provider") and [Client Name] ("Client").

## 2. Services

Service Provider shall provide professional services as outlined in individual Statements of Work.

## 3. Payment Terms

- Invoices issued monthly
- Payment due within 30 days
- Late fees: 1.5% per month

## 4. Intellectual Property

All work product remains the property of Service Provider until full payment received.

## 5. Confidentiality

Both parties agree to maintain confidentiality of proprietary information.

## 6. Limitation of Liability

Liability limited to fees paid in the 12 months preceding the claim.

## 7. Termination

Either party may terminate with 90 days written notice.`,
        metadata: {},
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'Statement of Work',
        description: 'Detailed project scope and deliverables template',
        type: 'SOW',
        content: `# Statement of Work

## Project Overview

**Project Name:** [Project Name]
**Client:** [Client Name]
**Start Date:** [Date]
**End Date:** [Date]

## Deliverables

1. **Phase 1 Deliverables**
   - Requirements document
   - Technical architecture
   - Project plan

2. **Phase 2 Deliverables**
   - System setup
   - Initial configuration
   - Integration testing

3. **Phase 3 Deliverables**
   - User documentation
   - Training materials
   - Go-live support

## Timeline

| Milestone | Date | Status |
|-----------|------|--------|
| Kickoff | Week 1 | Pending |
| Phase 1 Complete | Week 4 | Pending |
| Phase 2 Complete | Week 8 | Pending |
| Go-Live | Week 12 | Pending |

## Investment

Total Project Cost: $XXX,XXX
Payment Schedule: 
- 30% upon signing
- 40% at Phase 2 completion
- 30% at Go-Live

## Assumptions

- Client provides timely feedback
- Access to required systems granted
- Key stakeholders available for meetings`,
        metadata: {},
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'Non-Disclosure Agreement',
        description: 'Standard NDA for protecting confidential information',
        type: 'NDA',
        content: `# Non-Disclosure Agreement

## Parties

This Non-Disclosure Agreement ("Agreement") is entered into as of [Date] between:

**Disclosing Party:** [Company Name]
**Receiving Party:** [Company Name]

## 1. Definition of Confidential Information

Confidential Information includes all non-public information disclosed by either party.

## 2. Obligations

The Receiving Party shall:
- Maintain confidentiality
- Use information only for intended purposes
- Limit disclosure to need-to-know personnel

## 3. Exclusions

This Agreement does not apply to information that:
- Is publicly available
- Was known prior to disclosure
- Is independently developed
- Is rightfully received from a third party

## 4. Term

This Agreement remains in effect for 2 years from the date of disclosure.

## 5. Return of Materials

Upon request, all confidential materials must be returned or destroyed.`,
        metadata: {},
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const template of templates) {
      const { error } = await supabase
        .from('Template')
        .upsert({ id: randomUUID(), ...template }, { onConflict: 'name' });
      
      if (error && error.code !== '23505') {
        console.error('Error creating template:', template.name, error);
      }
    }
    console.log('✅ Created', templates.length, 'templates');

    // Create sample proposals
    const proposals = [
      {
        title: 'Enterprise Software License - Acme Corp',
        content: `# Enterprise Software License Agreement

## Executive Summary
Acme Corporation has requested a comprehensive enterprise software license for their global operations spanning 500 users across North America.

## Solution Overview
Our enterprise platform provides:
- Unlimited user licenses
- 24/7 premium support
- Dedicated account manager
- Quarterly business reviews
- Custom integrations

## Pricing Structure
- Annual License Fee: $150,000
- Discount Applied: 15%
- Final Amount: $127,500

## Payment Terms
Net 30 days from invoice date

## Legal Terms
1. **Limitation of Liability**: Our aggregate liability is limited to fees paid in the preceding 12 months.
2. **Indemnification**: We will indemnify you against third-party IP claims.
3. **Confidentiality**: All customer data remains confidential and is not shared.
4. **Termination**: Either party may terminate with 90 days written notice.

## Contract Period
- Start Date: January 1, 2026
- End Date: December 31, 2026
- Auto-Renewal: Yes, unless either party provides 60 days notice`,
        status: 'PENDING',
        metadata: {
          clientName: 'Acme Corporation',
          dealSize: 150000,
          discount: 15,
          region: 'North America',
          currency: 'USD',
          industry: 'Technology',
          contactEmail: 'procurement@acme.com',
          salesRep: 'John Smith',
        },
        lockedSections: [],
        userId: demoUser.id,
        updatedAt: new Date().toISOString(),
        contractStartDate: '2026-01-01T00:00:00.000Z',
        contractEndDate: '2026-12-31T23:59:59.999Z',
        renewalDate: '2026-11-01T00:00:00.000Z',
        autoRenew: true,
      },
      {
        title: 'SaaS Subscription Renewal - TechStart Inc',
        content: `# Annual SaaS Subscription Renewal

## Overview
TechStart Inc's annual subscription is up for renewal. This proposal covers continued access to our platform with enhanced features.

## Subscription Details
- Users: 50
- Plan: Professional
- Annual Cost: $75,000
- Discount: 10% (loyalty)
- Final Amount: $67,500

## New Features Included
- Advanced analytics dashboard
- API access (10,000 calls/month)
- Priority support
- Training credits: $5,000

## Terms
- Payment: Net 30
- Contract Term: 12 months
- Support Level: Priority (4-hour response)

## Legal Provisions
- **Limitation of Liability**: Limited to subscription fees
- **Confidentiality**: Standard confidentiality protections apply
- **Data Security**: SOC2 Type II compliant
- **Indemnification**: Mutual indemnification clause included`,
        status: 'APPROVED',
        metadata: {
          clientName: 'TechStart Inc',
          dealSize: 75000,
          discount: 10,
          region: 'Europe',
          currency: 'EUR',
          industry: 'Startup',
          contactEmail: 'cto@techstart.io',
          salesRep: 'Sarah Johnson',
        },
        lockedSections: [],
        userId: demoUser.id,
        updatedAt: new Date().toISOString(),
        contractStartDate: '2026-02-01T00:00:00.000Z',
        contractEndDate: '2027-01-31T23:59:59.999Z',
        renewalDate: '2026-12-01T00:00:00.000Z',
        autoRenew: false,
      },
      {
        title: 'Professional Services Agreement - GlobalFinance',
        content: `# Professional Services Agreement

## Project Scope
GlobalFinance Ltd requires comprehensive consulting and implementation services for their digital transformation initiative.

## Engagement Details
- Duration: 6 months
- Team Size: 5 consultants
- Total Investment: $250,000
- Discount: 30%
- Final Amount: $175,000

## Deliverables
1. Current state assessment (Week 1-2)
2. Future state design (Week 3-6)
3. Implementation roadmap (Week 7-8)
4. Pilot deployment (Week 9-16)
5. Full rollout (Week 17-24)

## Payment Schedule
- 40% upfront ($70,000)
- 30% at mid-project ($52,500)
- 30% at completion ($52,500)

## Risk Factors
⚠️ **HIGH DISCOUNT ALERT**: 30% discount exceeds standard 25% threshold
⚠️ **PAYMENT TERMS**: 120-day terms exceed 90-day limit

## Legal Terms
- **Liability Cap**: Limited to fees paid
- **Indemnification**: Standard mutual indemnification
- **Termination**: 30-day notice required`,
        status: 'REJECTED',
        metadata: {
          clientName: 'GlobalFinance Ltd',
          dealSize: 250000,
          discount: 30,
          region: 'Asia Pacific',
          currency: 'USD',
          industry: 'Finance',
          contactEmail: 'procurement@globalfinance.com',
          salesRep: 'Michael Chen',
          rejectionReason: 'Excessive discount - requires pricing approval',
        },
        lockedSections: [],
        userId: adminUser.id,
        updatedAt: new Date().toISOString(),
      },
    ];

    const createdProposals = [];
    for (const proposal of proposals) {
      const { data, error } = await supabase
        .from('Proposal')
        .insert({ id: randomUUID(), ...proposal })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating proposal:', proposal.title, error);
        continue;
      }
      
      createdProposals.push(data);

      // Create risk report
      const readinessScore = proposal.status === 'APPROVED' ? 95 : 
                            proposal.status === 'REJECTED' ? 45 : 
                            Math.floor(Math.random() * 30) + 60;

      const { error: riskError } = await supabase
        .from('RiskReport')
        .insert({
          id: randomUUID(),
          proposalId: data.id,
          readinessScore,
          legalRisk: proposal.status === 'REJECTED' ? 75 : Math.floor(Math.random() * 30) + 10,
          pricingRisk: proposal.status === 'REJECTED' ? 85 : Math.floor(Math.random() * 40) + 5,
          structuralRisk: Math.floor(Math.random() * 25) + 5,
          findings: proposal.status === 'REJECTED' ? [
            { type: 'PRICING', level: 'CRITICAL', message: 'Discount exceeds maximum threshold (30% > 25%)', location: 'Pricing Structure' },
            { type: 'PRICING', level: 'HIGH', message: 'Payment terms exceed policy (120 days > 90 days)', location: 'Payment Schedule' },
          ] : [
            { type: 'LEGAL', level: 'INFO', message: 'All required legal clauses present', location: 'Legal Terms' },
            { type: 'PRICING', level: 'LOW', message: 'Pricing within acceptable ranges', location: 'Pricing' },
          ],
          recommendations: proposal.status === 'REJECTED' ? [
            { paragraphId: 'pricing', suggestion: 'Reduce discount to 25% or obtain approval', reason: 'Exceeds discount policy' },
            { paragraphId: 'payment', suggestion: 'Revise payment terms to 90 days', reason: 'Exceeds payment terms policy' },
          ] : [
            { paragraphId: 'intro', suggestion: 'Consider adding customer success metrics', reason: 'Enhances value proposition' },
          ],
        });
      
      if (riskError) {
        console.error('Error creating risk report:', riskError);
      }
    }
    console.log('✅ Created', createdProposals.length, 'sample proposals with risk reports');

    // Create legal clauses
    const legalClauses = [
      {
        identifier: 'INDEM-001',
        name: 'Mutual Indemnification',
        text: 'Each party agrees to indemnify, defend, and hold harmless the other party from any claims, damages, or expenses arising from their negligent acts or omissions.',
        isMandatory: true,
        region: 'GLOBAL',
        updatedAt: new Date().toISOString(),
      },
      {
        identifier: 'LIAB-001',
        name: 'Limitation of Liability',
        text: 'In no event shall either party\'s aggregate liability exceed the fees paid in the twelve (12) months preceding the claim.',
        isMandatory: true,
        region: 'GLOBAL',
        updatedAt: new Date().toISOString(),
      },
      {
        identifier: 'CONF-001',
        name: 'Confidentiality',
        text: 'Both parties agree to maintain the confidentiality of all proprietary and confidential information disclosed during the term of this agreement.',
        isMandatory: true,
        region: 'GLOBAL',
        updatedAt: new Date().toISOString(),
      },
      {
        identifier: 'TERM-001',
        name: 'Termination for Convenience',
        text: 'Either party may terminate this agreement for convenience with ninety (90) days written notice.',
        isMandatory: false,
        region: 'GLOBAL',
        updatedAt: new Date().toISOString(),
      },
      {
        identifier: 'IP-001',
        name: 'Intellectual Property Rights',
        text: 'All intellectual property rights in the deliverables shall vest in the Client upon full payment of fees.',
        isMandatory: false,
        region: 'GLOBAL',
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const clause of legalClauses) {
      const { error } = await supabase
        .from('LegalClause')
        .upsert({ id: randomUUID(), ...clause }, { onConflict: 'identifier' });
      
      if (error && error.code !== '23505') {
        console.error('Error creating legal clause:', clause.identifier, error);
      }
    }
    console.log('✅ Created', legalClauses.length, 'legal clauses');

    console.log('\n🎉 Seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log('- Users: 2 (admin@reviewer.ai, demo@reviewer.ai)');
    console.log('- Rules:', rules.length);
    console.log('- Templates:', templates.length);
    console.log('- Proposals:', proposals.length);
    console.log('- Legal Clauses:', legalClauses.length);
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  }
}

seed();
