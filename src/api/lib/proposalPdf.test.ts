import { describe, it, expect, beforeEach, vi } from 'vitest';

const { launchMock } = vi.hoisted(() => ({ launchMock: vi.fn() }));
vi.mock('puppeteer', () => ({ default: { launch: launchMock } }));

import { buildProposalHtml, escapeHtml, renderPdf, type ProposalPdfInput } from './proposalPdf';

const input = (over: Partial<ProposalPdfInput> = {}): ProposalPdfInput => ({
  id: 'abcdef12-3456-7890-abcd-ef1234567890',
  title: 'Cloud Migration Proposal',
  content: '## Scope\nMove **everything** to the cloud.\n- Assess\n- Migrate',
  createdAt: '2026-03-15T10:00:00.000Z',
  metadata: { clientName: 'Acme Corp', dealSize: 120000, discount: 10, region: 'EMEA', industry: 'Retail' },
  createdBy: 'Pat Seller',
  riskReport: null,
  rules: [],
  ...over,
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });

  it('renders null and undefined as empty, and stringifies numbers', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('buildProposalHtml', () => {
  it('produces a complete document with the proposal details on the cover page', () => {
    const html = buildProposalHtml(input());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Cloud Migration Proposal');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Retail');
    expect(html).toContain('EMEA');
    expect(html).toContain('Pat Seller');
    expect(html).toContain('PRO-ABCDEF12');
    expect(html).toContain('March 15, 2026');
  });

  it('formats the deal size and discount in the investment table', () => {
    const html = buildProposalHtml(input());
    expect(html).toContain('$120,000');
    expect(html).toContain('10% discount applied');
  });

  it('renders the proposal body as HTML', () => {
    const html = buildProposalHtml(input());
    expect(html).toContain('<h2 class="content-h2">Scope</h2>');
    expect(html).toContain('<strong>everything</strong>');
    expect(html).toContain('<li>Assess</li>');
  });

  it('escapes user-controlled fields so a malicious title or client cannot inject markup', () => {
    const html = buildProposalHtml(
      input({ title: '<script>alert(1)</script>', metadata: { clientName: '"><img src=x onerror=alert(1)>' } })
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('omits the compliance appendix when there is no risk report', () => {
    expect(buildProposalHtml(input())).not.toContain('APPENDIX A');
  });

  it('includes scores, review notes and policies when there is a risk report', () => {
    const html = buildProposalHtml(
      input({
        riskReport: {
          readinessScore: 82,
          legalRisk: 20,
          pricingRisk: 10,
          structuralRisk: 30,
          findings: [{ message: 'Add an indemnification clause' }, { title: 'Pricing note' }, {}, { message: 'fourth, dropped' }],
        },
        rules: [{ name: 'Max discount', description: 'No more than 25%' }],
      })
    );
    expect(html).toContain('APPENDIX A');
    expect(html).toContain('<strong>82/100</strong>');
    expect(html).toContain('80/100'); // 100 - legalRisk
    expect(html).toContain('Add an indemnification clause');
    expect(html).toContain('Pricing note');
    expect(html).toContain('Quality review note'); // fallback label for an empty finding
    expect(html).not.toContain('fourth, dropped'); // only the first three notes
    expect(html).toContain('Max discount');
  });

  it('copes with missing metadata', () => {
    const html = buildProposalHtml(input({ metadata: {} }));
    expect(html).toContain('Client Name');
    expect(html).not.toContain('Investment Overview');
  });

  it('keeps the list styles: no stray declarations between the table and list rules', () => {
    const html = buildProposalHtml(input());
    // A leftover declaration block here made browsers discard the `ol, ul` rule.
    expect(html).toMatch(/tr:nth-child\(even\)\s*\{[^}]*\}\s*ol, ul \{/);
  });
});

describe('renderPdf', () => {
  const fakeBrowser = (opts: { pdfError?: Error } = {}) => {
    const page = {
      setContent: vi.fn().mockResolvedValue(undefined),
      pdf: opts.pdfError ? vi.fn().mockRejectedValue(opts.pdfError) : vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    };
    const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn().mockResolvedValue(undefined) };
    return { browser, page };
  };

  beforeEach(() => {
    launchMock.mockReset();
  });

  it('launches memory-lean headless Chrome and returns the PDF bytes', async () => {
    const { browser, page } = fakeBrowser();
    launchMock.mockResolvedValue(browser);

    const pdf = await renderPdf('<html></html>');

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.toString()).toBe('%PDF');
    const launchOpts = launchMock.mock.calls[0][0];
    expect(launchOpts.headless).toBe('new');
    expect(launchOpts.args).toEqual(expect.arrayContaining(['--no-sandbox', '--single-process']));
    expect(page.pdf).toHaveBeenCalledWith(expect.objectContaining({ format: 'A4', printBackground: true }));
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser even when rendering fails (no leaked Chrome)', async () => {
    const { browser } = fakeBrowser({ pdfError: new Error('page crashed') });
    launchMock.mockResolvedValue(browser);

    await expect(renderPdf('<html></html>')).rejects.toThrow('page crashed');
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('renders one document at a time, and keeps going after a failure', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    const first = fakeBrowser();
    first.page.pdf.mockImplementation(async () => {
      order.push('first:start');
      await gate;
      order.push('first:end');
      return new Uint8Array([1]);
    });
    const second = fakeBrowser({ pdfError: new Error('boom') });
    second.page.pdf.mockImplementation(async () => {
      order.push('second:start');
      throw new Error('boom');
    });
    const third = fakeBrowser();
    third.page.pdf.mockImplementation(async () => {
      order.push('third:start');
      return new Uint8Array([3]);
    });
    launchMock.mockResolvedValueOnce(first.browser).mockResolvedValueOnce(second.browser).mockResolvedValueOnce(third.browser);

    const p1 = renderPdf('1');
    const p2 = renderPdf('2');
    const p3 = renderPdf('3');
    const settled2 = p2.catch((e: Error) => e.message);

    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(['first:start']); // the others are waiting, not racing

    release();
    await p1;
    expect(await settled2).toBe('boom');
    await p3;
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'third:start']);
  });
});
