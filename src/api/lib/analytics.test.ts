import { describe, it, expect } from 'vitest';
import {
  buildAnalyticsSummary,
  discountBucket,
  weekStart,
  type AnalyticsProposal,
} from './analytics';

const NOW = new Date('2026-06-22T00:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

function p(overrides: Partial<AnalyticsProposal> = {}): AnalyticsProposal {
  return {
    status: 'PENDING',
    createdAt: daysAgo(1),
    readinessScore: 80,
    riskReport: { legalRisk: 10, pricingRisk: 20, structuralRisk: 30 },
    metadata: { discount: 5, dealSize: 1000, region: 'North America' },
    ...overrides,
  };
}

describe('discountBucket', () => {
  it('buckets against the 25% compliance threshold', () => {
    expect(discountBucket(0)).toBe('0%');
    expect(discountBucket(5)).toBe('1-10%');
    expect(discountBucket(10)).toBe('1-10%');
    expect(discountBucket(15)).toBe('11-20%');
    expect(discountBucket(25)).toBe('21-25%');
    expect(discountBucket(30)).toBe('>25%');
  });
});

describe('weekStart', () => {
  it('returns the Monday of the week (UTC)', () => {
    // 2026-06-22 is a Monday
    expect(weekStart(new Date('2026-06-22T12:00:00Z'))).toBe('2026-06-22');
    // 2026-06-24 (Wed) -> same Monday
    expect(weekStart(new Date('2026-06-24T12:00:00Z'))).toBe('2026-06-22');
    // 2026-06-21 (Sun) -> previous Monday
    expect(weekStart(new Date('2026-06-21T12:00:00Z'))).toBe('2026-06-15');
  });
});

describe('buildAnalyticsSummary', () => {
  it('counts statuses and totals', () => {
    const s = buildAnalyticsSummary(
      [
        p({ status: 'PENDING' }),
        p({ status: 'APPROVED' }),
        p({ status: 'APPROVED' }),
        p({ status: 'REJECTED' }),
        p({ status: 'IN_REVIEW' }),
      ],
      NOW
    );
    expect(s.totals).toEqual({ total: 5, pending: 1, inReview: 1, approved: 2, rejected: 1 });
    expect(s.statusBreakdown).toEqual([
      { status: 'PENDING', count: 1 },
      { status: 'IN_REVIEW', count: 1 },
      { status: 'APPROVED', count: 2 },
      { status: 'REJECTED', count: 1 },
    ]);
  });

  it('computes risk averages (rounded)', () => {
    const s = buildAnalyticsSummary(
      [
        p({ readinessScore: 80, riskReport: { legalRisk: 10, pricingRisk: 20, structuralRisk: 30 } }),
        p({ readinessScore: 60, riskReport: { legalRisk: 20, pricingRisk: 40, structuralRisk: 10 } }),
      ],
      NOW
    );
    expect(s.riskAverages).toEqual({ readiness: 70, legal: 15, pricing: 30, structural: 20 });
  });

  it('counts needsAttention as readiness < 60', () => {
    const s = buildAnalyticsSummary(
      [p({ readinessScore: 59 }), p({ readinessScore: 60 }), p({ readinessScore: 30 })],
      NOW
    );
    expect(s.headline.needsAttention.value).toBe(2);
  });

  it('computes period-over-period deltas (current 30d vs prior 30d)', () => {
    const s = buildAnalyticsSummary(
      [
        p({ createdAt: daysAgo(5) }), // current window
        p({ createdAt: daysAgo(10) }), // current window
        p({ createdAt: daysAgo(40) }), // previous window
      ],
      NOW
    );
    // current=2, previous=1 -> change +1, +100%
    expect(s.headline.total.delta.change).toBe(1);
    expect(s.headline.total.delta.changePct).toBe(100);
    expect(s.headline.total.delta.up).toBe(true);
  });

  it('zero previous period yields 0% (no divide-by-zero)', () => {
    const s = buildAnalyticsSummary([p({ createdAt: daysAgo(2) })], NOW);
    expect(s.headline.total.delta.changePct).toBe(0);
  });

  it('builds a 12-week zero-filled created-per-week series', () => {
    // daysAgo(0) === NOW === Monday 2026-06-22, so both land in the final week.
    const s = buildAnalyticsSummary([p({ createdAt: daysAgo(0) }), p({ createdAt: daysAgo(0) })], NOW);
    expect(s.createdPerWeek).toHaveLength(12);
    // chronological
    const weeks = s.createdPerWeek.map((w) => w.weekStart);
    expect([...weeks].sort()).toEqual(weeks);
    // this week (Monday 2026-06-22) has the 2 recent proposals
    expect(s.createdPerWeek[s.createdPerWeek.length - 1]).toEqual({ weekStart: '2026-06-22', count: 2 });
  });

  it('distributes discounts into all five buckets', () => {
    const s = buildAnalyticsSummary(
      [
        p({ metadata: { discount: 0 } }),
        p({ metadata: { discount: 8 } }),
        p({ metadata: { discount: 18 } }),
        p({ metadata: { discount: 24 } }),
        p({ metadata: { discount: 40 } }),
      ],
      NOW
    );
    expect(s.discountDistribution).toEqual([
      { bucket: '0%', count: 1 },
      { bucket: '1-10%', count: 1 },
      { bucket: '11-20%', count: 1 },
      { bucket: '21-25%', count: 1 },
      { bucket: '>25%', count: 1 },
    ]);
  });

  it('sums deal value by region, descending, defaulting blank region to Unknown', () => {
    const s = buildAnalyticsSummary(
      [
        p({ metadata: { dealSize: 1000, region: 'EMEA' } }),
        p({ metadata: { dealSize: 3000, region: 'APAC' } }),
        p({ metadata: { dealSize: 500, region: '' } }),
        p({ metadata: { dealSize: 0, region: 'EMEA' } }), // ignored (no value)
      ],
      NOW
    );
    expect(s.dealValueByRegion).toEqual([
      { region: 'APAC', total: 3000 },
      { region: 'EMEA', total: 1000 },
      { region: 'Unknown', total: 500 },
    ]);
  });

  it('handles an empty dataset without throwing', () => {
    const s = buildAnalyticsSummary([], NOW);
    expect(s.totals.total).toBe(0);
    expect(s.riskAverages.readiness).toBe(0);
    expect(s.dealValueByRegion).toEqual([]);
    expect(s.createdPerWeek).toHaveLength(12);
  });
});
