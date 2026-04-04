import { prisma } from '../src/lib/db';

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Create demo users
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@dealsentry.ai' },
      update: {},
      create: {
        email: 'admin@dealsentry.ai',
        name: 'Admin User',
        role: 'ADMIN',
      },
    });

    // Create 5 test users
    const testUsers = [
      { email: 'test1@dealsentry.ai', name: 'Test User 1' },
      { email: 'test2@dealsentry.ai', name: 'Test User 2' },
      { email: 'test3@dealsentry.ai', name: 'Test User 3' },
      { email: 'test4@dealsentry.ai', name: 'Test User 4' },
      { email: 'test5@dealsentry.ai', name: 'Test User 5' },
    ];

    for (const testUser of testUsers) {
      await prisma.user.upsert({
        where: { email: testUser.email },
        update: {},
        create: {
          email: testUser.email,
          name: testUser.name,
          role: 'SALES_REP',
        },
      });
    }

    console.log('✅ Created users: 1 admin + 5 test users');

    // Create compliance rules
    const rules = [
      {
        name: 'Maximum Discount Threshold',
        type: 'DISCOUNT',
        description: 'Enforce maximum discount limit of 25% on all proposals',
        logic: { maxDiscount: 25 },
        isActive: true,
      },
      {
        name: 'Required Legal Clauses',
        type: 'LEGAL_TERM',
        description: 'Ensure all proposals include required legal terms',
        logic: { requiredTerms: ['indemnification', 'limitation of liability', 'confidentiality'] },
        isActive: true,
      },
      {
        name: 'Minimum Deal Size',
        type: 'PRICING',
        description: 'Require minimum deal size of $10,000',
        logic: { minDealSize: 10000 },
        isActive: true,
      },
      {
        name: 'Payment Terms Limit',
        type: 'PAYMENT',
        description: 'Maximum payment terms of 90 days',
        logic: { maxPaymentDays: 90 },
        isActive: false,
      },
    ];

    for (const rule of rules) {
      await prisma.rule.upsert({
        where: { id: rule.name.toLowerCase().replace(/\s+/g, '-') },
        update: rule,
        create: { id: rule.name.toLowerCase().replace(/\s+/g, '-'), ...rule },
      });
    }
    console.log('✅ Created', rules.length, 'compliance rules');

    // Create templates
    const templates = [
      {
        name: 'Standard Sales Proposal',
        description: 'A comprehensive sales proposal template for enterprise deals',
        type: 'SALES_PROPOSAL',
        content: '# Sales Proposal\n\n## Executive Summary\n\n[Your executive summary here]\n\n## Scope of Work\n\n[Details of scope]\n\n## Pricing\n\n[Pricing details]\n\n## Terms & Conditions\n\n[Standard terms]',
        metadata: {},
      },
      {
        name: 'Master Services Agreement',
        description: 'Legal framework for ongoing service relationships',
        type: 'MSA',
        content: '# Master Services Agreement\n\n## Parties\n\n[Party details]\n\n## Services\n\n[Service descriptions]\n\n## Payment Terms\n\n[Payment terms]',
        metadata: {},
      },
      {
        name: 'Statement of Work',
        description: 'Detailed project scope and deliverables template',
        type: 'SOW',
        content: '# Statement of Work\n\n## Project Overview\n\n[Overview]\n\n## Deliverables\n\n[List deliverables]\n\n## Timeline\n\n[Project timeline]',
        metadata: {},
      },
    ];

    for (const template of templates) {
      await prisma.template.upsert({
        where: { id: template.name.toLowerCase().replace(/\s+/g, '-') },
        update: template,
        create: { id: template.name.toLowerCase().replace(/\s+/g, '-'), ...template },
      });
    }
    console.log('✅ Created', templates.length, 'templates');

    // Create sample proposals
    const proposals = [
      {
        title: 'Enterprise Software License Agreement',
        content: 'This Enterprise Software License Agreement establishes the terms for software licensing...',
        status: 'PENDING',
        metadata: {
          clientName: 'Acme Corporation',
          dealSize: 150000,
          discount: 15,
          region: 'North America',
          currency: 'USD',
          industry: 'Technology',
        },
        userId: demoUser.id,
      },
      {
        title: 'Annual SaaS Subscription Renewal',
        content: 'This Annual SaaS Subscription Renewal Agreement covers the continued use of...',
        status: 'APPROVED',
        metadata: {
          clientName: 'TechStart Inc',
          dealSize: 75000,
          discount: 10,
          region: 'Europe',
          currency: 'EUR',
          industry: 'Startup',
        },
        userId: demoUser.id,
      },
      {
        title: 'Professional Services Agreement',
        content: 'This Professional Services Agreement outlines the consulting and implementation...',
        status: 'REJECTED',
        metadata: {
          clientName: 'GlobalFinance Ltd',
          dealSize: 250000,
          discount: 30,
          region: 'Asia Pacific',
          currency: 'USD',
          industry: 'Finance',
        },
        userId: adminUser.id,
      },
    ];

    for (const proposal of proposals) {
      const created = await prisma.proposal.create({
        data: {
          ...proposal,
          lockedSections: [],
        },
      });

      // Create a risk report for each proposal
      await prisma.riskReport.create({
        data: {
          proposalId: created.id,
          readinessScore: Math.floor(Math.random() * 40) + 55,
          legalRisk: Math.floor(Math.random() * 50),
          pricingRisk: Math.floor(Math.random() * 50),
          structuralRisk: Math.floor(Math.random() * 30),
          findings: [
            { type: 'REVIEW_REQUIRED', level: 'INFO', message: 'Initial review pending', location: 'Section 1' },
          ],
          recommendations: [
            { paragraphId: '1', suggestion: 'Review and approve', reason: 'Standard review process' },
          ],
        },
      });
    }
    console.log('✅ Created', proposals.length, 'sample proposals with risk reports');

    console.log('🎉 Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed();
