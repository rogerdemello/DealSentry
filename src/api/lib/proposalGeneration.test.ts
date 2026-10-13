import { describe, it, expect } from 'vitest';
import {
  GENERATION_SYSTEM_PROMPT,
  buildGenerationPrompt,
  clampDiscount,
  normalizeGenerated,
} from './proposalGeneration';

describe('clampDiscount', () => {
  it('passes through values inside 0-25', () => {
    expect(clampDiscount(0)).toBe(0);
    expect(clampDiscount(12.5)).toBe(12.5);
    expect(clampDiscount(25)).toBe(25);
  });

  it('caps anything above the maximum and floors negatives', () => {
    expect(clampDiscount(26)).toBe(25);
    expect(clampDiscount(500)).toBe(25);
    expect(clampDiscount(-10)).toBe(0);
  });

  it('accepts numeric strings', () => {
    expect(clampDiscount('15')).toBe(15);
    expect(clampDiscount('40')).toBe(25);
  });

  it('treats missing or non-numeric input as no discount (never NaN)', () => {
    for (const bad of [undefined, null, '', 'lots', NaN, Infinity, {}]) {
      expect(clampDiscount(bad)).toBe(0);
    }
  });
});

describe('normalizeGenerated', () => {
  const valid = {
    companyName: 'Acme',
    title: 'Acme Proposal',
    content: '## Summary\nText',
    metadata: { clientName: 'Acme Ltd', dealSize: 60000, discount: 10, region: 'APAC', currency: 'AUD', industry: 'Mining' },
  };

  it('returns a fully-populated proposal for good input', () => {
    expect(normalizeGenerated(valid)).toEqual({
      title: 'Acme Proposal',
      content: '## Summary\nText',
      metadata: { clientName: 'Acme Ltd', dealSize: 60000, discount: 10, region: 'APAC', currency: 'AUD', industry: 'Mining' },
    });
  });

  it('fills defaults when optional metadata is missing', () => {
    const out = normalizeGenerated({ companyName: 'Acme', title: 'T', content: 'C' });
    expect(out?.metadata).toEqual({
      clientName: 'Acme',
      dealSize: null,
      discount: 0,
      region: 'North America',
      currency: 'USD',
      industry: 'General',
    });
  });

  it('clamps the discount and sanitises the deal size', () => {
    const out = normalizeGenerated({ ...valid, metadata: { discount: 80, dealSize: -5 } });
    expect(out?.metadata.discount).toBe(25);
    expect(out?.metadata.dealSize).toBeNull();
  });

  it('trims text fields', () => {
    expect(normalizeGenerated({ ...valid, title: '  Padded  ' })?.title).toBe('Padded');
  });

  it('rejects an answer missing any required field', () => {
    expect(normalizeGenerated({ ...valid, companyName: '' })).toBeNull();
    expect(normalizeGenerated({ ...valid, title: undefined })).toBeNull();
    expect(normalizeGenerated({ ...valid, content: '   ' })).toBeNull();
  });

  it('rejects non-object answers', () => {
    for (const bad of [null, undefined, 'text', 42, []]) {
      expect(normalizeGenerated(bad as unknown)).toBeNull();
    }
  });

  it('ignores a metadata value that is not an object', () => {
    const out = normalizeGenerated({ ...valid, metadata: 'oops' });
    expect(out?.metadata.discount).toBe(0);
  });
});

describe('prompts', () => {
  it('embeds the user request and the compliance limits', () => {
    const prompt = buildGenerationPrompt('A website for Globex, $30k');
    expect(prompt).toContain('A website for Globex, $30k');
    expect(prompt).toContain('MAXIMUM 90 days');
    expect(prompt).toContain('MAXIMUM 25% discount');
    expect(prompt).toContain('Indemnification');
    expect(prompt).toContain('Respond in JSON format');
  });

  it('keeps the system prompt demanding JSON and the hard limits', () => {
    expect(GENERATION_SYSTEM_PROMPT).toMatch(/valid JSON/);
    expect(GENERATION_SYSTEM_PROMPT).toMatch(/90 days/);
    expect(GENERATION_SYSTEM_PROMPT).toMatch(/25%/);
  });
});
