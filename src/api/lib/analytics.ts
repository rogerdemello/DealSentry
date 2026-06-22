/**
 * Pure analytics aggregation for the dashboard. Functions take plain proposal
 * rows and return chart-ready shapes — no DB or network access — so they are
 * cheap to unit-test (see analytics.test.ts). The route layer
 * (src/api/analytics.ts) fetches rows and calls buildAnalyticsSummary.
 */

import { MAX_DISCOUNT_PERCENT } from './compliance';

export interface AnalyticsProposal {
  status: string;
  createdAt: string;
  readinessScore: number;
  riskReport?: {
    legalRisk?: number;
    pricingRisk?: number;
    structuralRisk?: number;
  } | null;
  metadata?: {
    discount?: number;
    dealSize?: number;
    region?: string;
  } | null;
}

export interface Delta {
  /** Absolute change vs the previous period. */
  change: number;
  /** Percentage change vs the previous period (0 when previous was 0). */
  changePct: number;
  /** Direction for UI styling. */
  up: boolean;
}

export interface AnalyticsSummary {
  totals: { total: number; pending: number; inReview: number; approved: number; rejected: number };
  headline: {
    total: { value: number; delta: Delta };
    pending: { value: number; delta: Delta };
    avgReadiness: { value: number; delta: Delta };
    needsAttention: { value: number; delta: Delta };
  };
  statusBreakdown: { status: string; count: number }[];
  riskAverages: { readiness: number; legal: number; pricing: number; structural: number };
  createdPerWeek: { weekStart: string; count: number }[];
  discountDistribution: { bucket: string; count: number }[];
  dealValueByRegion: { region: string; total: number }[];
}

const STATUSES = ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'] as const;
const NEEDS_ATTENTION_BELOW = 60;
const PERIOD_DAYS = 30;
const WEEKS_BACK = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

function round(n: number): number {
  return Math.round(n);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function makeDelta(current: number, previous: number): Delta {
  const change = current - previous;
  const changePct = previous === 0 ? 0 : round((change / previous) * 100);
  return { change, changePct, up: change >= 0 };
}

/** Monday (UTC) of the week containing `d`, as an ISO date string (YYYY-MM-DD). */
export function weekStart(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

/** Bucket a discount percentage against the compliance thresholds. */
export function discountBucket(discount: number): string {
  if (discount <= 0) return '0%';
  if (discount <= 10) return '1-10%';
  if (discount <= 20) return '11-20%';
  if (discount <= MAX_DISCOUNT_PERCENT) return `21-${MAX_DISCOUNT_PERCENT}%`;
  return `>${MAX_DISCOUNT_PERCENT}%`;
}

export function buildAnalyticsSummary(
  proposals: AnalyticsProposal[],
  now: Date = new Date()
): AnalyticsSummary {
  const total = proposals.length;

  // Status counts
  const statusCounts: Record<string, number> = {};
  for (const s of STATUSES) statusCounts[s] = 0;
  for (const p of proposals) {
    statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
  }

  const totals = {
    total,
    pending: statusCounts['PENDING'] ?? 0,
    inReview: statusCounts['IN_REVIEW'] ?? 0,
    approved: statusCounts['APPROVED'] ?? 0,
    rejected: statusCounts['REJECTED'] ?? 0,
  };

  // Risk averages
  const riskAverages = {
    readiness: round(avg(proposals.map((p) => p.readinessScore || 0))),
    legal: round(avg(proposals.map((p) => p.riskReport?.legalRisk ?? 0))),
    pricing: round(avg(proposals.map((p) => p.riskReport?.pricingRisk ?? 0))),
    structural: round(avg(proposals.map((p) => p.riskReport?.structuralRisk ?? 0))),
  };

  // Period-over-period deltas: current 30d window vs the prior 30d window.
  const nowMs = now.getTime();
  const currentStart = nowMs - PERIOD_DAYS * DAY_MS;
  const prevStart = nowMs - 2 * PERIOD_DAYS * DAY_MS;
  const inWindow = (p: AnalyticsProposal, from: number, to: number) => {
    const t = new Date(p.createdAt).getTime();
    return t >= from && t < to;
  };
  const current = proposals.filter((p) => inWindow(p, currentStart, nowMs));
  const previous = proposals.filter((p) => inWindow(p, prevStart, currentStart));

  const needsAttentionCount = (rows: AnalyticsProposal[]) =>
    rows.filter((p) => (p.readinessScore || 0) < NEEDS_ATTENTION_BELOW).length;
  const pendingCount = (rows: AnalyticsProposal[]) =>
    rows.filter((p) => p.status === 'PENDING').length;

  const headline = {
    total: { value: total, delta: makeDelta(current.length, previous.length) },
    pending: {
      value: totals.pending,
      delta: makeDelta(pendingCount(current), pendingCount(previous)),
    },
    avgReadiness: {
      value: riskAverages.readiness,
      delta: makeDelta(
        round(avg(current.map((p) => p.readinessScore || 0))),
        round(avg(previous.map((p) => p.readinessScore || 0)))
      ),
    },
    needsAttention: {
      value: needsAttentionCount(proposals),
      delta: makeDelta(needsAttentionCount(current), needsAttentionCount(previous)),
    },
  };

  // Created per week over the last WEEKS_BACK weeks (zero-filled, chronological).
  const weekCounts: Record<string, number> = {};
  for (let i = WEEKS_BACK - 1; i >= 0; i--) {
    const d = new Date(nowMs - i * 7 * DAY_MS);
    weekCounts[weekStart(d)] = 0;
  }
  for (const p of proposals) {
    const ws = weekStart(new Date(p.createdAt));
    if (ws in weekCounts) weekCounts[ws] += 1;
  }
  const createdPerWeek = Object.keys(weekCounts)
    .sort()
    .map((weekStartKey) => ({ weekStart: weekStartKey, count: weekCounts[weekStartKey] }));

  // Discount distribution
  const discountBuckets: Record<string, number> = {
    '0%': 0,
    '1-10%': 0,
    '11-20%': 0,
    [`21-${MAX_DISCOUNT_PERCENT}%`]: 0,
    [`>${MAX_DISCOUNT_PERCENT}%`]: 0,
  };
  for (const p of proposals) {
    const discount = Number(p.metadata?.discount);
    if (!Number.isNaN(discount)) {
      discountBuckets[discountBucket(discount)] += 1;
    }
  }
  const discountDistribution = Object.keys(discountBuckets).map((bucket) => ({
    bucket,
    count: discountBuckets[bucket],
  }));

  // Deal value by region (descending by total)
  const regionTotals: Record<string, number> = {};
  for (const p of proposals) {
    const dealSize = Number(p.metadata?.dealSize);
    if (Number.isNaN(dealSize) || dealSize <= 0) continue;
    const region = p.metadata?.region?.trim() || 'Unknown';
    regionTotals[region] = (regionTotals[region] ?? 0) + dealSize;
  }
  const dealValueByRegion = Object.keys(regionTotals)
    .map((region) => ({ region, total: round(regionTotals[region]) }))
    .sort((a, b) => b.total - a.total);

  const statusBreakdown = STATUSES.map((status) => ({ status, count: statusCounts[status] ?? 0 }));

  return {
    totals,
    headline,
    statusBreakdown,
    riskAverages,
    createdPerWeek,
    discountDistribution,
    dealValueByRegion,
  };
}
