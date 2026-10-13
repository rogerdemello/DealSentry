import { describe, it, expect } from 'vitest';
import {
  analyzeByRules,
  extractDealSize,
  extractDiscountPercent,
  extractPaymentDays,
  findMissingClauses,
  pricingRiskForDiscount,
  thresholdsFromRules,
} from './ruleAnalysis';

/** The seeded "bad" sample: over-discounted, tiny, long payment terms, no legal clauses. */
const BAD_PROPOSAL = `Website Update Proposal

Overview

Quick website update for SmallBiz LLC.

What We Will Do

Update homepage design, refresh color scheme, and add a contact form. Work will be completed within 3 weeks.

Pricing

Total Cost: $8,500

Special Discount: 35%

Final Price: $5,525 USD

Payment Terms: Net 120 days

Basic Terms

Standard terms and conditions apply. Work begins upon receipt of signed agreement.`;

const GOOD_PROPOSAL = `# Cloud Migration Proposal

## Executive Summary
We will migrate your infrastructure to the cloud with minimal downtime.

## Scope of Work
Assessment, migration waves, validation and hand-over of all deliverables.

## Timeline & Milestones
Discovery in weeks 1-2, migration in weeks 3-10, hyper-care in weeks 11-12.

## Investment & Pricing
Total Investment: $120,000
Discount: 10% volume discount applied.
Payment is due within 30 days of invoice date.

## Terms & Conditions
**Indemnification**: Each party agrees to indemnify and hold harmless the other.
**Liability Limitation**: Neither party shall be liable for indirect damages; total liability is capped at the contract value.
**Termination Rights**: Either party may terminate with 30 days written notice.
**Confidentiality**: Both parties will protect proprietary information.
**Intellectual Property**: Deliverables transfer to the client on full payment.`;

describe('extractDiscountPercent', () => {
  it('reads "Special Discount: 35%"', () => {
    expect(extractDiscountPercent('Special Discount: 35%')).toBe(35);
  });

  it('reads "20% discount" and "15% off"', () => {
    expect(extractDiscountPercent('We offer a 20% discount.')).toBe(20);
    expect(extractDiscountPercent('Sign this month for 15% off.')).toBe(15);
  });

  it('reads "discount of 12.5 percent"', () => {
    expect(extractDiscountPercent('A discount of 12.5 percent applies.')).toBe(12.5);
  });

  it('returns the largest when several are stated (the conservative choice)', () => {
    expect(extractDiscountPercent('Early-bird 10% discount, plus a further 30% discount on renewal')).toBe(30);
  });

  it('ignores percentages that are not discounts and impossible values', () => {
    expect(extractDiscountPercent('Our uptime is 99.9% and growth was 40%.')).toBeNull();
    expect(extractDiscountPercent('discount: 250%')).toBeNull();
  });

  it('returns null when no discount is mentioned', () => {
    expect(extractDiscountPercent('No incentives here.')).toBeNull();
  });
});

describe('extractDealSize', () => {
  it('prefers the labelled final price over the pre-discount total', () => {
    expect(extractDealSize(BAD_PROPOSAL)).toBe(5525);
  });

  it('uses a labelled total when there is no final price', () => {
    expect(extractDealSize('Total Investment: $120,000')).toBe(120000);
  });

  it('understands k and M suffixes', () => {
    expect(extractDealSize('Total price: $50k')).toBe(50000);
    expect(extractDealSize('Contract value: $1.2M')).toBe(1_200_000);
  });

  it('ignores unlabelled dollar amounts such as hourly rates', () => {
    expect(extractDealSize('Our rate is $150 per hour for consulting.')).toBeNull();
  });

  it('returns null when there is no amount', () => {
    expect(extractDealSize('Pricing to be agreed.')).toBeNull();
  });
});

describe('extractPaymentDays', () => {
  it('reads Net terms', () => {
    expect(extractPaymentDays('Payment Terms: Net 120 days')).toBe(120);
    expect(extractPaymentDays('terms are net-45')).toBe(45);
  });

  it('reads "due within N days"', () => {
    expect(extractPaymentDays('Invoices are due within 30 days.')).toBe(30);
  });

  it('reads "N days of invoice"', () => {
    expect(extractPaymentDays('Payment is due 60 days from invoice date')).toBe(60);
  });

  it('takes the longest term when several are stated', () => {
    expect(extractPaymentDays('Net 30 for services; payment for hardware within 75 days')).toBe(75);
  });

  it('returns null when no term is stated', () => {
    expect(extractPaymentDays('Payment on delivery.')).toBeNull();
  });
});

describe('findMissingClauses', () => {
  it('finds nothing missing in a full set of clauses', () => {
    expect(
      findMissingClauses(GOOD_PROPOSAL, [
        'indemnification',
        'limitation_of_liability',
        'termination',
        'confidentiality',
        'intellectual_property',
      ])
    ).toEqual([]);
  });

  it('lists the labels of absent clauses', () => {
    expect(findMissingClauses('We agree to keep things confidential.', ['indemnification', 'confidentiality'])).toEqual([
      'Indemnification',
    ]);
  });

  it('treats unknown required terms as plain substrings', () => {
    expect(findMissingClauses('Includes a force majeure clause.', ['force majeure'])).toEqual([]);
    expect(findMissingClauses('Nothing special.', ['force majeure'])).toEqual(['force majeure']);
  });
});

describe('thresholdsFromRules', () => {
  it('defaults when there are no rules', () => {
    expect(thresholdsFromRules([])).toMatchObject({ maxDiscount: 25, minDealSize: 10000, maxPaymentDays: 90 });
  });

  it('applies the strictest limits across rules', () => {
    const t = thresholdsFromRules([
      { logic: { maxDiscount: 20 } },
      { logic: { maxDiscount: 15, minDealSize: 50000 } },
      { logic: { maxPaymentDays: 60 } },
    ]);
    expect(t.maxDiscount).toBe(15);
    expect(t.minDealSize).toBe(50000);
    expect(t.maxPaymentDays).toBe(60);
  });

  it('never loosens a limit beyond the built-in defaults', () => {
    const t = thresholdsFromRules([{ logic: { maxDiscount: 50, minDealSize: 100, maxPaymentDays: 365 } }]);
    expect(t).toMatchObject({ maxDiscount: 25, minDealSize: 10000, maxPaymentDays: 90 });
  });

  it('maps required terms onto canonical clauses and keeps custom ones', () => {
    const t = thresholdsFromRules([
      { logic: { requiredTerms: ['indemnification', 'limitation of liability', 'confidentiality', 'Force Majeure'] } },
    ]);
    expect(t.requiredTerms).toEqual(
      expect.arrayContaining(['indemnification', 'limitation_of_liability', 'termination', 'confidentiality', 'force majeure'])
    );
  });

  it('tolerates logic stored as a JSON string, and malformed logic', () => {
    expect(thresholdsFromRules([{ logic: '{"maxDiscount": 10}' }]).maxDiscount).toBe(10);
    expect(thresholdsFromRules([{ logic: 'not json' }, { logic: null }, {}]).maxDiscount).toBe(25);
  });
});

describe('pricingRiskForDiscount', () => {
  it('follows the AI prompt bands', () => {
    expect(pricingRiskForDiscount(0)).toBe(12);
    expect(pricingRiskForDiscount(10)).toBe(12);
    expect(pricingRiskForDiscount(12)).toBe(30);
    expect(pricingRiskForDiscount(18)).toBe(45);
    expect(pricingRiskForDiscount(25)).toBe(65);
    expect(pricingRiskForDiscount(26)).toBe(95);
  });
});

describe('analyzeByRules', () => {
  it('flags the three hard-limit violations in the seeded bad proposal', () => {
    const result = analyzeByRules({ title: 'Website Update Proposal', content: BAD_PROPOSAL });

    expect(result.extracted).toMatchObject({ discountPercent: 35, dealSize: 5525, paymentDays: 120 });

    const critical = result.findings.filter((f) => f.level === 'CRITICAL').map((f) => f.type);
    expect(critical).toEqual(expect.arrayContaining(['DISCOUNT VIOLATION', 'DEAL SIZE', 'PAYMENT TERMS']));

    expect(result.pricingRisk).toBeGreaterThanOrEqual(90);
    expect(result.readinessScore).toBeLessThanOrEqual(55);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('flags the missing legal clauses in the bad proposal', () => {
    const result = analyzeByRules({ content: BAD_PROPOSAL });
    expect(result.extracted.missingClauses).toEqual(
      expect.arrayContaining(['Indemnification', 'Limitation of liability'])
    );
    expect(result.legalRisk).toBeGreaterThan(40);
  });

  it('scores a compliant proposal as ready, with no critical findings', () => {
    const result = analyzeByRules({ content: GOOD_PROPOSAL });
    expect(result.findings.filter((f) => f.level === 'CRITICAL')).toEqual([]);
    expect(result.extracted).toMatchObject({ discountPercent: 10, dealSize: 120000, paymentDays: 30 });
    expect(result.extracted.missingClauses).toEqual([]);
    expect(result.readinessScore).toBeGreaterThanOrEqual(80);
  });

  it('falls back to form metadata when the document states no numbers', () => {
    const result = analyzeByRules({
      content: 'A short proposal without any figures.',
      metadata: { discount: 40, dealSize: 5000 },
    });
    expect(result.extracted).toMatchObject({ discountPercent: 40, dealSize: 5000 });
    expect(result.findings.some((f) => f.type === 'DISCOUNT VIOLATION')).toBe(true);
  });

  it('prefers document values over conflicting form metadata', () => {
    const result = analyzeByRules({
      content: 'Discount: 5%\nTotal Investment: $90,000',
      metadata: { discount: 40, dealSize: 1000 },
    });
    expect(result.extracted).toMatchObject({ discountPercent: 5, dealSize: 90000 });
    expect(result.findings.some((f) => f.type === 'DISCOUNT VIOLATION')).toBe(false);
  });

  it('honours stricter limits from active rules', () => {
    const result = analyzeByRules({
      content: GOOD_PROPOSAL,
      rules: [{ logic: { maxDiscount: 5 } }],
    });
    expect(result.findings.some((f) => f.type === 'DISCOUNT VIOLATION')).toBe(true);
  });

  it('notes when no deal value can be found rather than inventing a violation', () => {
    const result = analyzeByRules({ content: 'We will build a website. Terms to follow.' });
    const dealFinding = result.findings.find((f) => f.type === 'DEAL SIZE');
    expect(dealFinding?.level).toBe('LOW');
  });

  it('always labels the report as produced by the rule checker', () => {
    const result = analyzeByRules({ content: GOOD_PROPOSAL });
    expect(result.findings.some((f) => f.type === 'ANALYSIS MODE')).toBe(true);
  });

  it('returns scores within 0-100 for empty content', () => {
    const result = analyzeByRules({ content: '' });
    for (const score of [result.readinessScore, result.legalRisk, result.pricingRisk, result.structuralRisk]) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
