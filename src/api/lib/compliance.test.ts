import { describe, it, expect } from 'vitest';
import {
  classifyRiskLevel,
  normalizeAnalysis,
  shouldAutoReview,
  markdownToHtml,
  MAX_DISCOUNT_PERCENT,
  MIN_DEAL_SIZE,
  AUTO_REVIEW_THRESHOLD,
} from './compliance';

describe('classifyRiskLevel', () => {
  it('classifies high scores as Low Risk (green)', () => {
    expect(classifyRiskLevel(100).label).toBe('Low Risk');
    expect(classifyRiskLevel(70).label).toBe('Low Risk');
    expect(classifyRiskLevel(70).color).toBe('#22c55e');
  });

  it('classifies mid scores as Medium Risk (amber)', () => {
    expect(classifyRiskLevel(69).label).toBe('Medium Risk');
    expect(classifyRiskLevel(40).label).toBe('Medium Risk');
    expect(classifyRiskLevel(55).color).toBe('#f59e0b');
  });

  it('classifies low scores as High Risk (red)', () => {
    expect(classifyRiskLevel(39).label).toBe('High Risk');
    expect(classifyRiskLevel(0).label).toBe('High Risk');
    expect(classifyRiskLevel(0).color).toBe('#ef4444');
  });

  it('treats the band boundaries as inclusive on the upper band', () => {
    // 70 -> Low, 69 -> Medium, 40 -> Medium, 39 -> High
    expect(classifyRiskLevel(70).label).toBe('Low Risk');
    expect(classifyRiskLevel(69).label).toBe('Medium Risk');
    expect(classifyRiskLevel(40).label).toBe('Medium Risk');
    expect(classifyRiskLevel(39).label).toBe('High Risk');
  });
});

describe('normalizeAnalysis', () => {
  it('applies safe defaults for a null/empty analysis', () => {
    expect(normalizeAnalysis(null)).toEqual({
      readinessScore: 50,
      legalRisk: 20,
      pricingRisk: 20,
      structuralRisk: 20,
      findings: [],
      recommendations: [],
    });
    expect(normalizeAnalysis({})).toEqual(normalizeAnalysis(null));
  });

  it('preserves provided values', () => {
    const result = normalizeAnalysis({
      readinessScore: 85,
      legalRisk: 5,
      pricingRisk: 10,
      structuralRisk: 15,
      findings: [{ level: 'LOW' }],
      recommendations: [{ suggestion: 'tidy up' }],
    });
    expect(result.readinessScore).toBe(85);
    expect(result.legalRisk).toBe(5);
    expect(result.findings).toHaveLength(1);
    expect(result.recommendations).toHaveLength(1);
  });

  it('falls back to defaults when a score is zero/falsy (documented behaviour)', () => {
    // 0 is falsy so it defaults — this mirrors the original `x || default` logic.
    const result = normalizeAnalysis({ readinessScore: 0, legalRisk: 0 });
    expect(result.readinessScore).toBe(50);
    expect(result.legalRisk).toBe(20);
  });
});

describe('shouldAutoReview', () => {
  it('advances at or above the threshold', () => {
    expect(shouldAutoReview(AUTO_REVIEW_THRESHOLD)).toBe(true);
    expect(shouldAutoReview(100)).toBe(true);
  });

  it('does not advance below the threshold', () => {
    expect(shouldAutoReview(AUTO_REVIEW_THRESHOLD - 1)).toBe(false);
    expect(shouldAutoReview(0)).toBe(false);
  });
});

describe('markdownToHtml', () => {
  it('returns empty string for falsy input', () => {
    expect(markdownToHtml('')).toBe('');
  });

  it('converts headers', () => {
    expect(markdownToHtml('# Title')).toContain('<h1 class="content-h1">Title</h1>');
    expect(markdownToHtml('## Sub')).toContain('<h2 class="content-h2">Sub</h2>');
    expect(markdownToHtml('### Small')).toContain('<h3 class="content-h3">Small</h3>');
  });

  it('converts bold, italic and underline', () => {
    expect(markdownToHtml('**bold**')).toContain('<strong>bold</strong>');
    expect(markdownToHtml('a *italic* b')).toContain('<em>italic</em>');
    expect(markdownToHtml('__under__')).toContain('<u>under</u>');
  });

  it('converts bullet lines to list items', () => {
    expect(markdownToHtml('- item')).toContain('<li>item</li>');
    expect(markdownToHtml('• item')).toContain('<li>item</li>');
  });

  it('converts newlines to <br>', () => {
    expect(markdownToHtml('a\nb')).toContain('<br>');
  });
});

describe('compliance constants', () => {
  it('exposes the documented thresholds', () => {
    expect(MAX_DISCOUNT_PERCENT).toBe(25);
    expect(MIN_DEAL_SIZE).toBe(10_000);
    expect(AUTO_REVIEW_THRESHOLD).toBe(80);
  });
});
