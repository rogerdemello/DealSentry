import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseMock, QueryContext } from './helpers/supabaseMock';

vi.mock('../src/lib/supabase', async () => {
  const { createSupabaseMock } = await import('./helpers/supabaseMock');
  const mock = createSupabaseMock();
  return { supabase: mock.client, default: mock.client, __mock: mock };
});

const { getLlmMock, createMock, embedMock, sendEmailMock, renderPdfMock } = vi.hoisted(() => ({
  getLlmMock: vi.fn(),
  createMock: vi.fn(),
  embedMock: vi.fn(),
  sendEmailMock: vi.fn(),
  renderPdfMock: vi.fn(),
}));
vi.mock('../src/api/lib/llm', () => ({ getLlm: getLlmMock }));
vi.mock('../src/api/lib/embeddings', () => ({ generateEmbedding: embedMock, EMBEDDING_DIM: 1536 }));
vi.mock('../src/api/lib/email', () => ({ sendEmail: sendEmailMock }));
vi.mock('../src/api/lib/proposalPdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/lib/proposalPdf')>()),
  renderPdf: renderPdfMock,
}));

import * as supabaseModule from '../src/lib/supabase';
import proposalsRouter from '../src/api/proposals';
import { resetDefaultUser } from '../src/api/middleware/auth';

const sb = (supabaseModule as unknown as { __mock: SupabaseMock }).__mock;

const ADMIN = { id: 'admin1', email: 'admin@b.com', role: 'ADMIN', company_id: null };
const REP_C1 = { id: 'rep1', email: 'rep@b.com', role: 'SALES_REP', company_id: 'c1' };
const LONER = { id: 'loner1', email: 'l@b.com', role: 'SALES_REP', company_id: null };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  title: 'Cloud Migration',
  content: 'Body text',
  status: 'PENDING',
  metadata: { clientName: 'Acme', dealSize: 50000, discount: 10 },
  userId: 'owner1',
  company_id: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...over,
});

/** Mock database: the signed-in (default) user plus a map of proposals by id. */
function seed(user: Record<string, unknown> = ADMIN, proposals: Record<string, ReturnType<typeof row>> = { p1: row() }) {
  sb.handle((ctx) => {
    if (ctx.table === 'User' && ctx.op === 'select' && !ctx.single) return { data: [user] };
    if (ctx.table === 'Proposal' && ctx.op === 'select' && ctx.single) {
      const id = ctx.filters.find(([, col]) => col === 'id')?.[2] as string;
      return proposals[id]
        ? { data: { ...proposals[id], User: { name: 'Owner', email: 'owner@b.com' }, RiskReport: [] } }
        : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    }
    if (ctx.table === 'Proposal' && ctx.op === 'select') return { data: Object.values(proposals) };
    if (ctx.table === 'Proposal' && ctx.op === 'insert') {
      return { data: { ...(ctx.payload as object), createdAt: '2026-02-01T00:00:00.000Z' } };
    }
    if (ctx.table === 'Proposal' && ctx.op === 'update' && ctx.single) {
      const id = ctx.filters.find(([, col]) => col === 'id')?.[2] as string;
      return { data: { ...proposals[id], ...(ctx.payload as object) } };
    }
    return undefined;
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/proposals', proposalsRouter);
  return app;
}

const lastCall = (table: string, op: QueryContext['op']) => sb.callsFor(table, op).at(-1);

beforeEach(() => {
  sb.reset();
  resetDefaultUser();
  for (const m of [getLlmMock, createMock, embedMock, sendEmailMock, renderPdfMock]) m.mockReset();
  getLlmMock.mockReturnValue({
    provider: 'gemini',
    model: 'test-model',
    client: { chat: { completions: { create: createMock } } },
    extraParams: {},
  });
  embedMock.mockResolvedValue(null); // embeddings off unless a test turns them on
  delete process.env.AUTH_MODE;
});

afterEach(() => {
  delete process.env.AUTH_MODE;
});

describe('GET /api/proposals', () => {
  it('returns every proposal to an admin, unfiltered', async () => {
    seed(ADMIN);
    const res = await request(buildApp()).get('/api/proposals');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(lastCall('Proposal', 'select')!.filters).toEqual([]);
  });

  it('narrows a company member to their company', async () => {
    seed(REP_C1);
    await request(buildApp()).get('/api/proposals');
    expect(lastCall('Proposal', 'select')!.filters).toContainEqual(['eq', 'company_id', 'c1']);
  });

  it('keeps legacy behaviour for a company-less non-admin in demo mode (no filter)', async () => {
    seed(LONER);
    await request(buildApp()).get('/api/proposals');
    expect(lastCall('Proposal', 'select')!.filters).toEqual([]);
  });

  it('narrows a company-less user to their own proposals in login mode', async () => {
    process.env.AUTH_MODE = 'login';
    const jwt = (await import('jsonwebtoken')).default;
    // requireAuth loads the token user with .single() on the User table.
    sb.handle((ctx) => {
      if (ctx.table === 'User' && ctx.single) return { data: LONER };
      if (ctx.table === 'Proposal' && ctx.op === 'select') return { data: [] };
      return undefined;
    });
    const token = jwt.sign({ userId: 'loner1' }, process.env.NEXTAUTH_SECRET as string, { expiresIn: '1h' });

    const res = await request(buildApp()).get('/api/proposals').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(lastCall('Proposal', 'select')!.filters).toContainEqual(['eq', 'userId', 'loner1']);
  });

  it('maps the risk report into the response', async () => {
    sb.handle((ctx) => {
      if (ctx.table === 'User') return { data: [ADMIN] };
      if (ctx.table === 'Proposal' && ctx.op === 'select') {
        return {
          data: [
            {
              ...row(),
              User: { name: 'Owner', email: 'o@b.com' },
              RiskReport: [{ readinessScore: 77, legalRisk: 1, pricingRisk: 2, structuralRisk: 3, findings: [], recommendations: [] }],
            },
          ],
        };
      }
      return undefined;
    });
    const res = await request(buildApp()).get('/api/proposals');
    expect(res.body[0]).toMatchObject({ id: 'p1', readinessScore: 77, riskReport: { legalRisk: 1, pricingRisk: 2 } });
  });
});

describe('GET /api/proposals/search', () => {
  it('returns an empty, available result for very short queries without embedding', async () => {
    seed();
    const res = await request(buildApp()).get('/api/proposals/search?q=ab');
    expect(res.body).toEqual({ available: true, results: [] });
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('reports unavailable when embeddings cannot be generated', async () => {
    seed();
    embedMock.mockResolvedValue(null);
    const res = await request(buildApp()).get('/api/proposals/search?q=payment+terms');
    expect(res.body).toEqual({ available: false, results: [] });
  });

  it('returns ranked ids from match_proposals, scoped to the company', async () => {
    seed(REP_C1);
    embedMock.mockResolvedValue([0.1, 0.2]);
    sb.handle((ctx) => (ctx.table === 'rpc:match_proposals' ? { data: [{ id: 'p1', similarity: 0.91 }] } : undefined));

    const res = await request(buildApp()).get('/api/proposals/search?q=payment+terms');

    expect(res.body).toEqual({ available: true, results: [{ id: 'p1', similarity: 0.91 }] });
    expect(sb.callsFor('rpc:match_proposals')[0].payload).toMatchObject({ filter_company: 'c1', match_count: 20 });
  });

  it('degrades to unavailable when the pgvector function is missing', async () => {
    seed();
    embedMock.mockResolvedValue([0.1]);
    sb.handle((ctx) => (ctx.table === 'rpc:match_proposals' ? { error: { message: 'function does not exist' } } : undefined));
    const res = await request(buildApp()).get('/api/proposals/search?q=payment+terms');
    expect(res.body.available).toBe(false);
  });
});

describe('POST /api/proposals', () => {
  it('400s without a title or content', async () => {
    seed();
    expect((await request(buildApp()).post('/api/proposals').send({ title: 'x' })).status).toBe(400);
    expect((await request(buildApp()).post('/api/proposals').send({ content: 'x' })).status).toBe(400);
  });

  it('creates a PENDING proposal owned by the caller and writes an audit entry', async () => {
    seed(REP_C1);
    const res = await request(buildApp())
      .post('/api/proposals')
      .send({ title: 'New', content: 'Hello', metadata: { clientName: 'Acme' } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'New', status: 'PENDING', userId: 'rep1', readinessScore: 0 });

    const insert = lastCall('Proposal', 'insert')!;
    expect(insert.payload).toMatchObject({ title: 'New', status: 'PENDING', userId: 'rep1', company_id: 'c1' });
    expect(lastCall('AuditLog', 'insert')!.payload).toMatchObject({
      actorId: 'rep1',
      action: 'Created proposal',
    });
  });

  it('omits company_id for a user without a company', async () => {
    seed(ADMIN);
    await request(buildApp()).post('/api/proposals').send({ title: 'New', content: 'Hello' });
    expect(lastCall('Proposal', 'insert')!.payload).not.toHaveProperty('company_id');
  });

  it('stores the embedding when one is produced, and survives when it cannot be stored', async () => {
    seed();
    embedMock.mockResolvedValue([0.5, 0.5]);
    const ok = await request(buildApp()).post('/api/proposals').send({ title: 'T', content: 'C' });
    expect(ok.status).toBe(201);
    expect(sb.callsFor('Proposal', 'update').some((c) => (c.payload as { embedding?: unknown }).embedding)).toBe(true);

    sb.handle((ctx) => (ctx.table === 'Proposal' && ctx.op === 'update' ? { error: { message: 'column embedding does not exist' } } : undefined));
    const failed = await request(buildApp()).post('/api/proposals').send({ title: 'T', content: 'C' });
    expect(failed.status).toBe(201);
  });

  it('500s when the insert itself fails', async () => {
    seed();
    sb.handle((ctx) => (ctx.table === 'Proposal' && ctx.op === 'insert' ? { error: { message: 'boom' } } : undefined));
    const res = await request(buildApp()).post('/api/proposals').send({ title: 'T', content: 'C' });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/proposals/generate', () => {
  const aiReply = (obj: unknown) =>
    createMock.mockResolvedValue({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] });

  const generated = {
    companyName: 'Acme Corp',
    title: 'Acme Website Redesign',
    content: '## Executive Summary\nWe will redesign the site.',
    metadata: { clientName: 'Acme Corp', dealSize: 45000, discount: 10, region: 'EMEA', currency: 'EUR', industry: 'Retail' },
  };

  it('400s on a blank query', async () => {
    seed();
    expect((await request(buildApp()).post('/api/proposals/generate').send({ naturalLanguageQuery: '  ' })).status).toBe(400);
    expect((await request(buildApp()).post('/api/proposals/generate').send({})).status).toBe(400);
  });

  it('424s with AI_UNAVAILABLE when no AI is configured', async () => {
    seed();
    getLlmMock.mockReturnValue(null);
    const res = await request(buildApp()).post('/api/proposals/generate').send({ naturalLanguageQuery: 'a proposal' });
    expect(res.status).toBe(424);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
  });

  it('424s with AI_UNAVAILABLE when the provider cannot be reached', async () => {
    seed();
    createMock.mockRejectedValue(new Error('ENOTFOUND'));
    const res = await request(buildApp()).post('/api/proposals/generate').send({ naturalLanguageQuery: 'a proposal' });
    expect(res.status).toBe(424);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
  });

  it('502s when the model answers with something that is not JSON', async () => {
    seed();
    aiReply('Sure! Here is your proposal: ...');
    const res = await request(buildApp()).post('/api/proposals/generate').send({ naturalLanguageQuery: 'a proposal' });
    expect(res.status).toBe(502);
  });

  it('400s when the model omits required fields', async () => {
    seed();
    aiReply({ title: 'Only a title' });
    const res = await request(buildApp()).post('/api/proposals/generate').send({ naturalLanguageQuery: 'a proposal' });
    expect(res.status).toBe(400);
    expect(sb.callsFor('Proposal', 'insert')).toHaveLength(0);
  });

  it('stores the generated proposal with the model metadata', async () => {
    seed();
    aiReply(generated);

    const res = await request(buildApp()).post('/api/proposals/generate').send({ naturalLanguageQuery: 'redesign for Acme' });

    expect(res.status).toBe(201);
    expect(createMock.mock.calls[0][0].messages[1].content).toContain('redesign for Acme');
    expect(lastCall('Proposal', 'insert')!.payload).toMatchObject({
      title: 'Acme Website Redesign',
      metadata: { clientName: 'Acme Corp', dealSize: 45000, discount: 10, region: 'EMEA', currency: 'EUR', industry: 'Retail' },
    });
    expect(lastCall('AuditLog', 'insert')!.payload).toMatchObject({
      action: 'Created proposal from AI generation',
      after: { source: 'ai-generated' },
    });
  });

  it('clamps an over-limit discount the model produced to 25%', async () => {
    seed();
    aiReply({ ...generated, metadata: { ...generated.metadata, discount: 60 } });
    await request(buildApp()).post('/api/proposals/generate').send({ naturalLanguageQuery: 'huge discount please' });
    expect((lastCall('Proposal', 'insert')!.payload as { metadata: { discount: number } }).metadata.discount).toBe(25);
  });

  it('turns a nonsense discount or deal size into safe values', async () => {
    seed();
    aiReply({ ...generated, metadata: { discount: 'lots', dealSize: 'a fortune' } });
    await request(buildApp()).post('/api/proposals/generate').send({ naturalLanguageQuery: 'x' });
    const meta = (lastCall('Proposal', 'insert')!.payload as { metadata: Record<string, unknown> }).metadata;
    expect(meta.discount).toBe(0);
    expect(meta.dealSize).toBeNull();
    expect(meta.region).toBe('North America');
  });
});

describe('PUT /api/proposals/:id/status', () => {
  it('is admin-only', async () => {
    seed(REP_C1);
    const res = await request(buildApp()).put('/api/proposals/p1/status').send({ status: 'APPROVED' });
    expect(res.status).toBe(403);
    expect(sb.callsFor('Proposal', 'update')).toHaveLength(0);
  });

  it('rejects an unknown status', async () => {
    seed(ADMIN);
    const res = await request(buildApp()).put('/api/proposals/p1/status').send({ status: 'DONE' });
    expect(res.status).toBe(400);
  });

  it('updates the status, audits it, and emails the owner', async () => {
    seed(ADMIN);
    sb.handle((ctx) => (ctx.table === 'User' && ctx.single ? { data: { name: 'Owner', email: 'owner@b.com' } } : undefined));

    const res = await request(buildApp()).put('/api/proposals/p1/status').send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'p1', status: 'APPROVED' });
    expect(lastCall('AuditLog', 'insert')!.payload).toMatchObject({ action: 'Changed status to APPROVED' });
    expect(sendEmailMock).toHaveBeenCalledWith('owner@b.com', expect.anything());
  });

  it('still succeeds when the notification email fails', async () => {
    seed(ADMIN);
    sb.handle((ctx) => (ctx.table === 'User' && ctx.single ? { data: { name: 'Owner', email: 'owner@b.com' } } : undefined));
    sendEmailMock.mockRejectedValue(new Error('smtp down'));
    const res = await request(buildApp()).put('/api/proposals/p1/status').send({ status: 'REJECTED' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/proposals/:id', () => {
  it("refuses another company's proposal", async () => {
    seed(REP_C1, { p1: row({ company_id: 'c2' }) });
    const res = await request(buildApp()).delete('/api/proposals/p1');
    expect(res.status).toBe(403);
    expect(sb.callsFor('Proposal', 'delete')).toHaveLength(0);
  });

  it('deletes the report, audit trail and proposal for an authorised caller', async () => {
    seed(REP_C1, { p1: row({ company_id: 'c1' }) });
    const res = await request(buildApp()).delete('/api/proposals/p1');
    expect(res.body).toEqual({ success: true });
    expect(sb.callsFor('RiskReport', 'delete')).toHaveLength(1);
    expect(sb.callsFor('AuditLog', 'delete')).toHaveLength(1);
    expect(sb.callsFor('Proposal', 'delete')).toHaveLength(1);
  });
});

describe('GET /api/proposals/:id', () => {
  it('404s for an unknown id', async () => {
    seed();
    sb.handle((ctx) =>
      ctx.table === 'Proposal' && ctx.single ? { data: null, error: null } : undefined
    );
    const res = await request(buildApp()).get('/api/proposals/missing');
    expect(res.status).toBe(404);
  });

  it("403s for another company's proposal and 200s for your own", async () => {
    seed(REP_C1, { other: row({ id: 'other', company_id: 'c2' }), mine: row({ id: 'mine', company_id: 'c1' }) });
    expect((await request(buildApp()).get('/api/proposals/other')).status).toBe(403);
    const ok = await request(buildApp()).get('/api/proposals/mine');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: 'mine', riskReport: null });
  });
});

describe('GET /api/proposals/:id/export/pdf', () => {
  it('renders the proposal and returns a PDF attachment', async () => {
    seed(ADMIN);
    renderPdfMock.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));

    const res = await request(buildApp()).get('/api/proposals/p1/export/pdf').buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('proposal-Cloud_Migration.pdf');
    const html = renderPdfMock.mock.calls[0][0] as string;
    expect(html).toContain('Cloud Migration');
    expect(html).toContain('Acme');
  });

  it('403s for another company’s proposal without launching a browser', async () => {
    seed(REP_C1, { p1: row({ company_id: 'c2' }) });
    const res = await request(buildApp()).get('/api/proposals/p1/export/pdf');
    expect(res.status).toBe(403);
    expect(renderPdfMock).not.toHaveBeenCalled();
  });

  it('500s cleanly when rendering fails', async () => {
    seed(ADMIN);
    renderPdfMock.mockRejectedValue(new Error('Chrome not found'));
    const res = await request(buildApp()).get('/api/proposals/p1/export/pdf');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to export PDF');
  });
});
