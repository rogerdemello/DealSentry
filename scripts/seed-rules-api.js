/**
 * Direct API script to populate compliance rules
 * Run with: node scripts/seed-rules-api.js
 */

const rules = [
  // PRICING RULES
  {
    name: 'Maximum Discount Threshold',
    description: 'Discounts exceeding 20% require Sales Manager approval',
    type: 'PRICING',
    logic: {
      condition: 'discount > 20',
      threshold: 20,
      operator: 'greater_than',
      field: 'discount',
      message: 'Discount of {discount}% exceeds the 20% threshold. Sales Manager approval required.',
      severity: 'HIGH'
    },
    isActive: true
  },
  {
    name: 'Payment Terms - Net 30',
    description: 'Standard payment terms must be Net 30 or less',
    type: 'PRICING',
    logic: {
      condition: 'payment_terms <= 30',
      threshold: 30,
      operator: 'less_than_or_equal',
      field: 'payment_terms',
      message: 'Payment terms exceed Net 30. Extended terms require finance approval.',
      severity: 'MEDIUM'
    },
    isActive: true
  },
  {
    name: 'Minimum Deal Size',
    description: 'Enterprise deals must be at least $50,000',
    type: 'PRICING',
    logic: {
      condition: 'deal_value >= 50000',
      threshold: 50000,
      operator: 'greater_than_or_equal',
      field: 'deal_value',
      message: 'Deal value is below minimum enterprise threshold of $50,000.',
      severity: 'MEDIUM'
    },
    isActive: true
  },
  {
    name: 'Multi-Year Discount Cap',
    description: 'Multi-year contracts (2+ years) cannot exceed 30% discount',
    type: 'PRICING',
    logic: {
      condition: 'contract_years >= 2 AND discount > 30',
      threshold: 30,
      operator: 'greater_than',
      field: 'discount',
      requiresApproval: true,
      message: 'Multi-year discount exceeds 30% cap. VP Sales approval required.',
      severity: 'HIGH'
    },
    isActive: true
  },

  // LEGAL RULES
  {
    name: 'Indemnification Clause Required',
    description: 'All proposals must include standard indemnification language',
    type: 'LEGAL',
    logic: {
      condition: 'contains(content, "indemnification")',
      requiredText: 'indemnification',
      operator: 'contains',
      field: 'content',
      message: 'Mandatory Indemnification clause is missing.',
      severity: 'HIGH'
    },
    isActive: true
  },
  {
    name: 'Limitation of Liability Clause',
    description: 'Proposals must include limitation of liability language',
    type: 'LEGAL',
    logic: {
      condition: 'contains(content, "limitation of liability")',
      requiredText: 'limitation of liability',
      operator: 'contains',
      field: 'content',
      message: 'Limitation of Liability clause is missing.',
      severity: 'HIGH'
    },
    isActive: true
  },
  {
    name: 'Confidentiality Clause',
    description: 'All proposals must reference confidentiality or NDA',
    type: 'LEGAL',
    logic: {
      condition: 'contains(content, "confidential")',
      requiredText: 'confidential',
      operator: 'contains',
      field: 'content',
      message: 'Confidentiality/NDA reference is missing.',
      severity: 'MEDIUM'
    },
    isActive: true
  },
  {
    name: 'Termination Rights',
    description: 'Contract must specify termination conditions',
    type: 'LEGAL',
    logic: {
      condition: 'contains(content, "termination")',
      requiredText: 'termination',
      operator: 'contains',
      field: 'content',
      message: 'Termination clause is required.',
      severity: 'MEDIUM'
    },
    isActive: true
  },
  {
    name: 'Governing Law Specification',
    description: 'Contract must specify governing law jurisdiction',
    type: 'LEGAL',
    logic: {
      condition: 'contains(content, "governing law")',
      requiredText: 'governing law',
      operator: 'contains',
      field: 'content',
      message: 'Governing law jurisdiction must be specified.',
      severity: 'MEDIUM'
    },
    isActive: true
  },
  {
    name: 'Data Privacy Compliance',
    description: 'Proposals must include GDPR/data privacy language',
    type: 'LEGAL',
    logic: {
      condition: 'contains(content, "data privacy")',
      requiredText: 'data privacy',
      operator: 'contains',
      field: 'content',
      message: 'Data privacy/GDPR compliance clause is missing.',
      severity: 'HIGH'
    },
    isActive: true
  },

  // STRUCTURAL RULES
  {
    name: 'Executive Summary Required',
    description: 'All proposals must start with an executive summary',
    type: 'STRUCTURAL',
    logic: {
      condition: 'contains(content, "executive summary")',
      requiredSection: 'Executive Summary',
      operator: 'contains',
      field: 'content',
      message: 'Executive Summary section is missing.',
      severity: 'MEDIUM'
    },
    isActive: true
  },
  {
    name: 'Pricing Table Required',
    description: 'Proposals must include a clear pricing breakdown',
    type: 'STRUCTURAL',
    logic: {
      condition: 'contains(content, "pricing")',
      requiredSection: 'Pricing',
      operator: 'contains',
      field: 'content',
      message: 'Pricing/Investment section is missing.',
      severity: 'HIGH'
    },
    isActive: true
  },
  {
    name: 'Scope of Work Defined',
    description: 'Proposals must clearly define scope of work or deliverables',
    type: 'STRUCTURAL',
    logic: {
      condition: 'contains(content, "scope of work")',
      requiredSection: 'Scope of Work',
      operator: 'contains',
      field: 'content',
      message: 'Scope of Work section is missing.',
      severity: 'HIGH'
    },
    isActive: true
  },
  {
    name: 'Implementation Timeline',
    description: 'Proposals must include project timeline or milestones',
    type: 'STRUCTURAL',
    logic: {
      condition: 'contains(content, "timeline")',
      requiredSection: 'Timeline',
      operator: 'contains',
      field: 'content',
      message: 'Implementation timeline is missing.',
      severity: 'MEDIUM'
    },
    isActive: true
  },
  {
    name: 'Terms and Conditions Section',
    description: 'Proposals must have a dedicated T&C section',
    type: 'STRUCTURAL',
    logic: {
      condition: 'contains(content, "terms and conditions")',
      requiredSection: 'Terms and Conditions',
      operator: 'contains',
      field: 'content',
      message: 'Terms and Conditions section is missing.',
      severity: 'HIGH'
    },
    isActive: true
  },
  {
    name: 'Contact Information Complete',
    description: 'Proposals must include complete contact information',
    type: 'STRUCTURAL',
    logic: {
      condition: 'contains(content, "email")',
      requiredFields: 'email',
      operator: 'contains',
      field: 'content',
      message: 'Complete contact information is required.',
      severity: 'LOW'
    },
    isActive: true
  },
  {
    name: 'Security Standards Declaration',
    description: 'Enterprise proposals must reference security standards',
    type: 'LEGAL',
    logic: {
      condition: 'contains(content, "SOC 2")',
      requiredText: 'SOC 2',
      operator: 'contains',
      field: 'content',
      message: 'Security standards certification should be mentioned.',
      severity: 'MEDIUM'
    },
    isActive: true
  },
  {
    name: 'Service Level Agreement',
    description: 'Enterprise contracts should include SLA commitments',
    type: 'STRUCTURAL',
    logic: {
      condition: 'contains(content, "SLA")',
      requiredSection: 'Service Level Agreement',
      operator: 'contains',
      field: 'content',
      message: 'Service Level Agreement (SLA) is recommended.',
      severity: 'MEDIUM'
    },
    isActive: true
  }
];

async function seedRules() {
  console.log('🌱 Seeding compliance rules via API...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const rule of rules) {
    try {
      const response = await fetch('http://localhost:3000/api/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rule)
      });

      if (response.ok) {
        const created = await response.json();
        console.log(`✅ Created: ${created.name} (${created.type})`);
        successCount++;
      } else {
        const error = await response.text();
        console.error(`❌ Failed: ${rule.name} - ${error}`);
        errorCount++;
      }
    } catch (error) {
      console.error(`❌ Failed: ${rule.name} - ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Successfully created: ${successCount} rules`);
  console.log(`   ❌ Failed: ${errorCount} rules`);
  console.log(`\n📋 Rules by type:`);
  console.log(`   💰 PRICING: ${rules.filter(r => r.type === 'PRICING').length} rules`);
  console.log(`   ⚖️  LEGAL: ${rules.filter(r => r.type === 'LEGAL').length} rules`);
  console.log(`   📝 STRUCTURAL: ${rules.filter(r => r.type === 'STRUCTURAL').length} rules`);
}

seedRules().catch(console.error);
