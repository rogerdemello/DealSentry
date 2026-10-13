import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseMock } from './helpers/supabaseMock';

vi.mock('../src/lib/supabase', async () => {
  const { createSupabaseMock } = await import('./helpers/supabaseMock');
  const mock = createSupabaseMock();
  return { supabase: mock.client, default: mock.client, __mock: mock };
});

const { getLlmMock, createMock } = vi.hoisted(() => ({ getLlmMock: vi.fn(), createMock: vi.fn() }));
vi.mock('../src/api/lib/llm', () => ({ getLlm: getLlmMock }));

import * as supabaseModule from '../src/lib/supabase';
import analyzeRouter from '../src/api/analyze';
import { resetDefaultUser } from '../src/api/middleware/auth';

const sb = (supabaseModule as unknown as { __mock: SupabaseMock }).__mock;

const BAD_CONTENT = `Website Update Proposal

Overview
Quick website update for SmallBiz LLC.

Pricing
Total Cost: $8,500
Special Discount: 35%
Final Price: $5,525 USD
Payment Terms: Net 120 days`;

const GOOD_AI_ANALYSIS = {
  readinessScore: 92,
  legalRisk: 8,
  pricingRisk: 12,
  structuralRisk: 10,
  findings: [{ type: 'INFO', level: 'LOW', message: 'Looks fine', location: 'Document' }],
  recommendations: [],
};

const ADMIN = { id: 'admin1', email: 'admin@b.com', role: 'ADMIN', company_id: null };
const REP_C1 = { id: 'rep1', email: 'rep@b.com', role: 'SALES_REP', company_id: 'c1' };

function proposal(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    title: 'Website Update Proposal',
    content: BAD_CONTENT,
    status: 'PENDING',
    metadata: { clientName: 'SmallBiz LLC' },
    userId: 'owner1',
    company_id: null,
    ...over,
  };
}

/** Wire the mock database: who is signed in, which proposals exist, and any existing report. */
function seed(opts: {
  user?: Record<string, unknown>;
  proposals?: Record<string, ReturnType<typeof proposal>>;
  existingReportId?: string;
  rules?: unknown[];
}) {
  const user = opts.user ?? ADMIN;
  const proposals = opts.proposals ?? { p1: proposal() };
  sb.handle((ctx) => {
    if (ctx.table === 'User' && ctx.op === 'select') return { data: [user] };
    if (ctx.table === 'Proposal' && ctx.op === 'select') {
      const id = ctx.filters.find(([, col]) => col === 'id')?.[2] as string;
      return proposals[id] ? { data: proposals[id] } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    }
    if (ctx.table === 'Rule' && ctx.op === 'select') return { data: opts.rules ?? [] };
    if (ctx.table === 'RiskReport' && ctx.op === 'select') {
      return { data: opts.existingReportId ? [{ id: opts.existingReportId }] : [] };
    }
    if (ctx.table === 'RiskReport' && (ctx.op === 'insert' || ctx.op === 'update')) {
      return { data: { id: opts.existingReportId ?? 'rr-new', ...(ctx.payload as object) } };
    }
    return undefined;
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/analyze', analyzeRouter);
  return app;
}

const useAi = (reply: unknown) => {
  createMock.mockResolvedValue({
    choices: [{ message: { content: typeof reply === 'string' ? reply : JSON.stringify(reply) } }],
  });
};

const savedMode = process.env.ANALYSIS_MODE;

beforeEach(() => {
  sb.reset();
  resetDefaultUser();
  createMock.mockReset();
  getLlmMock.mockReset();
  getLlmMock.mockReturnValue({
    provider: 'gemini',
    model: 'test-model',
    client: { chat: { completions: { create: createMock } } },
    extraParams: { reasoning_effort: 'none' },
  });
  delete process.env.ANALYSIS_MODE;
  delete process.env.AUTH_MODE;
});

afterEach(() => {
  if (savedMode === undefined) delete process.env.ANALYSIS_MODE;
  else process.env.ANALYSIS_MODE = savedMode;
});

describe('POST /api/analyze/:id with a working AI', () => {
  it('stores the AI report and labels it as AI-generated', async () => {
    seed({});
    useAi(GOOD_AI_ANALYSIS);

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.status).toBe(200);
    expect(res.body.analysisSource).toBe('ai');
    expect(res.body.riskReport).toMatchObject({ readinessScore: 92, legalRisk: 8, pricingRisk: 12 });

    const sent = createMock.mock.calls[0][0];
    expect(sent.model).toBe('test-model');
    expect(sent.response_format).toEqual({ type: 'json_object' });
    expect(sent.reasoning_effort).toBe('none');
    expect(sent.messages[1].content).toContain('Website Update Proposal');

    const insert = sb.callsFor('RiskReport', 'insert')[0];
    expect(insert.payload).toMatchObject({ proposalId: 'p1', readinessScore: 92 });
  });

  it('updates the existing report instead of inserting a duplicate', async () => {
    seed({ existingReportId: 'rr-1' });
    useAi(GOOD_AI_ANALYSIS);

    await request(buildApp()).post('/api/analyze/p1');

    expect(sb.callsFor('RiskReport', 'insert')).toHaveLength(0);
    const update = sb.callsFor('RiskReport', 'update')[0];
    expect(update.filters).toContainEqual(['eq', 'id', 'rr-1']);
  });

  it('never writes a readinessScore column to Proposal (it does not exist there)', async () => {
    seed({});
    useAi(GOOD_AI_ANALYSIS);

    await request(buildApp()).post('/api/analyze/p1');

    const update = sb.callsFor('Proposal', 'update')[0];
    expect(update.payload).not.toHaveProperty('readinessScore');
    expect(update.payload).toHaveProperty('updatedAt');
  });

  it('advances a healthy PENDING proposal to IN_REVIEW', async () => {
    seed({});
    useAi(GOOD_AI_ANALYSIS);

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.body.statusAdvanced).toBe(true);
    expect(sb.callsFor('Proposal', 'update')[0].payload).toMatchObject({ status: 'IN_REVIEW' });
  });

  it('does not move an already-approved proposal back to IN_REVIEW', async () => {
    seed({ proposals: { p1: proposal({ status: 'APPROVED' }) } });
    useAi(GOOD_AI_ANALYSIS);

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.body.statusAdvanced).toBe(false);
    expect(sb.callsFor('Proposal', 'update')[0].payload).not.toHaveProperty('status');
  });

  it('does not advance a low-scoring proposal', async () => {
    seed({});
    useAi({ ...GOOD_AI_ANALYSIS, readinessScore: 40 });

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.body.statusAdvanced).toBe(false);
  });

  it('keeps a genuine zero risk score instead of replacing it with a default', async () => {
    seed({});
    useAi({ ...GOOD_AI_ANALYSIS, legalRisk: 0, pricingRisk: 0 });

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.body.riskReport).toMatchObject({ legalRisk: 0, pricingRisk: 0 });
  });

  it('puts the active rules into the prompt', async () => {
    seed({ rules: [{ name: 'Max discount', description: 'No more than 25%', logic: { maxDiscount: 25 } }] });
    useAi(GOOD_AI_ANALYSIS);

    await request(buildApp()).post('/api/analyze/p1');

    expect(createMock.mock.calls[0][0].messages[1].content).toContain('- Max discount: No more than 25%');
  });
});

describe('POST /api/analyze/:id when the AI is unavailable', () => {
  it('falls back to the rule checker when the provider errors', async () => {
    seed({});
    createMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.status).toBe(200);
    expect(res.body.analysisSource).toBe('rules');
    const types = (res.body.riskReport.findings as Array<{ type: string; level: string }>).map((f) => f.type);
    expect(types).toEqual(expect.arrayContaining(['DISCOUNT VIOLATION', 'DEAL SIZE', 'PAYMENT TERMS', 'ANALYSIS MODE']));
    // The 35% discount / $5,525 / Net 120 proposal must not look ready.
    expect(res.body.riskReport.readinessScore).toBeLessThan(60);
    expect(res.body.statusAdvanced).toBe(false);
  });

  it('falls back when the model returns truncated or invalid JSON', async () => {
    seed({});
    useAi('{"readinessScore": 80, "findings": [{"message": "unterminated');

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.status).toBe(200);
    expect(res.body.analysisSource).toBe('rules');
  });

  it('falls back when the model returns an empty body', async () => {
    seed({});
    createMock.mockResolvedValue({ choices: [{ message: { content: '' } }] });

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.body.analysisSource).toBe('rules');
  });

  it('uses the rule checker when no AI is configured, without calling anything', async () => {
    seed({});
    getLlmMock.mockReturnValue(null);

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.status).toBe(200);
    expect(res.body.analysisSource).toBe('rules');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('honours ANALYSIS_MODE=rules even when an AI is configured', async () => {
    seed({});
    process.env.ANALYSIS_MODE = 'rules';
    useAi(GOOD_AI_ANALYSIS);

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.body.analysisSource).toBe('rules');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('applies thresholds from the active rules in fallback mode', async () => {
    seed({
      proposals: { p1: proposal({ content: 'Pricing\nTotal Investment: $80,000\nDiscount: 12%\nPayment due within 30 days.' }) },
      rules: [{ name: 'Strict discount', description: 'Max 10%', logic: { maxDiscount: 10 } }],
    });
    getLlmMock.mockReturnValue(null);

    const res = await request(buildApp()).post('/api/analyze/p1');

    const types = (res.body.riskReport.findings as Array<{ type: string }>).map((f) => f.type);
    expect(types).toContain('DISCOUNT VIOLATION');
  });
});

describe('access control', () => {
  it('404s for an unknown proposal', async () => {
    seed({});
    const res = await request(buildApp()).post('/api/analyze/missing');
    expect(res.status).toBe(404);
  });

  it("403s for another company's proposal", async () => {
    seed({ user: REP_C1, proposals: { p1: proposal({ company_id: 'c2' }) } });
    useAi(GOOD_AI_ANALYSIS);

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('allows a member of the proposal’s company', async () => {
    seed({ user: REP_C1, proposals: { p1: proposal({ company_id: 'c1' }) } });
    useAi(GOOD_AI_ANALYSIS);

    const res = await request(buildApp()).post('/api/analyze/p1');

    expect(res.status).toBe(200);
  });
});

describe('POST /api/analyze/bulk', () => {
  it('rejects a missing or empty id list', async () => {
    seed({});
    expect((await request(buildApp()).post('/api/analyze/bulk').send({})).status).toBe(400);
    expect((await request(buildApp()).post('/api/analyze/bulk').send({ ids: [] })).status).toBe(400);
    expect((await request(buildApp()).post('/api/analyze/bulk').send({ ids: [1, null, ''] })).status).toBe(400);
  });

  it('rejects more than the per-request limit', async () => {
    seed({});
    const ids = Array.from({ length: 11 }, (_, i) => `p${i}`);
    const res = await request(buildApp()).post('/api/analyze/bulk').send({ ids });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most 10/i);
  });

  it('analyzes each proposal and reports per-item results, including failures', async () => {
    seed({ proposals: { p1: proposal({ id: 'p1' }), p2: proposal({ id: 'p2', status: 'APPROVED' }) } });
    useAi(GOOD_AI_ANALYSIS);

    const res = await request(buildApp()).post('/api/analyze/bulk').send({ ids: ['p1', 'p2', 'ghost'] });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ requested: 3, analyzed: 2, failed: 1 });
    expect(res.body.results).toEqual([
      expect.objectContaining({ proposalId: 'p1', ok: true, analysisSource: 'ai', readinessScore: 92, statusAdvanced: true }),
      expect.objectContaining({ proposalId: 'p2', ok: true, statusAdvanced: false }),
      { proposalId: 'ghost', ok: false, error: 'Proposal not found' },
    ]);
  });

  it('analyzes a repeated id once', async () => {
    seed({});
    useAi(GOOD_AI_ANALYSIS);

    const res = await request(buildApp()).post('/api/analyze/bulk').send({ ids: ['p1', 'p1', 'p1'] });

    expect(res.body.summary.requested).toBe(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('is not shadowed by the /:proposalId route', async () => {
    seed({});
    const res = await request(buildApp()).post('/api/analyze/bulk').send({ ids: ['p1'] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
  });
});

describe('GET /api/analyze/mode', () => {
  it('reports the AI provider when configured', async () => {
    seed({});
    const res = await request(buildApp()).get('/api/analyze/mode');
    expect(res.body).toEqual({ mode: 'ai', provider: 'gemini', model: 'test-model' });
  });

  it('reports rules when no AI is configured or ANALYSIS_MODE=rules', async () => {
    seed({});
    getLlmMock.mockReturnValue(null);
    expect((await request(buildApp()).get('/api/analyze/mode')).body.mode).toBe('rules');

    getLlmMock.mockReturnValue({ provider: 'azure', model: 'x', client: {}, extraParams: {} });
    process.env.ANALYSIS_MODE = 'rules';
    expect((await request(buildApp()).get('/api/analyze/mode')).body.mode).toBe('rules');
  });
});
