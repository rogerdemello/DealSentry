import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { SupabaseMock } from './helpers/supabaseMock';

vi.mock('../src/lib/supabase', async () => {
  const { createSupabaseMock } = await import('./helpers/supabaseMock');
  const mock = createSupabaseMock();
  return { supabase: mock.client, default: mock.client, __mock: mock };
});

import * as supabaseModule from '../src/lib/supabase';
import rulesRouter from '../src/api/rules';
import templatesRouter from '../src/api/templates';
import auditRouter from '../src/api/audit';
import notificationsRouter from '../src/api/notifications';
import analyticsRouter from '../src/api/analytics';
import authRouter from '../src/api/auth';
import { resetDefaultUser } from '../src/api/middleware/auth';

const sb = (supabaseModule as unknown as { __mock: SupabaseMock }).__mock;

const ADMIN = { id: 'admin1', email: 'a@b.com', role: 'ADMIN', company_id: null };
const REP_C1 = { id: 'rep1', email: 'r@b.com', role: 'SALES_REP', company_id: 'c1' };
const LONER = { id: 'loner1', email: 'l@b.com', role: 'SALES_REP', company_id: null };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/rules', rulesRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/auth', authRouter);
  return app;
}

/** Everyone is `user` (demo mode's default identity). */
function signInAs(user: Record<string, unknown>) {
  sb.handle((ctx) => {
    if (ctx.table === 'User' && ctx.op === 'select' && !ctx.single) return { data: [user] };
    return undefined;
  });
}

beforeEach(() => {
  sb.reset();
  resetDefaultUser();
  delete process.env.AUTH_MODE;
});

describe('rules', () => {
  const dbRule = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    name: 'Max discount',
    type: 'DISCOUNT',
    description: 'No more than 25%',
    logic: { maxDiscount: 25 },
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...over,
  });

  it('lists rules in the shape the SPA expects, tolerating snake_case columns', async () => {
    signInAs(REP_C1);
    sb.handle((ctx) =>
      ctx.table === 'Rule' && ctx.op === 'select'
        ? {
            data: [
              dbRule(),
              { id: 'r2', name: 'Legacy', type: 'PAYMENT', is_active: false, created_at: 'c', updated_at: 'u' },
              { name: 'no id, dropped' },
            ],
          }
        : undefined
    );

    const res = await request(buildApp()).get('/api/rules');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'r1', isActive: true, logic: { maxDiscount: 25 } });
    expect(res.body[1]).toMatchObject({ id: 'r2', isActive: false, createdAt: 'c', updatedAt: 'u', description: '' });
  });

  it('falls back to a plain select when the order column does not exist', async () => {
    signInAs(REP_C1);
    sb.handle((ctx) => {
      if (ctx.table !== 'Rule' || ctx.op !== 'select') return undefined;
      return ctx.order ? { error: { message: 'column "updatedAt" does not exist' } } : { data: [dbRule()] };
    });
    const res = await request(buildApp()).get('/api/rules');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('only lets administrators create, change or delete rules', async () => {
    signInAs(REP_C1);
    expect((await request(buildApp()).post('/api/rules').send({ name: 'x', type: 'DISCOUNT' })).status).toBe(403);
    expect((await request(buildApp()).put('/api/rules/r1').send({ name: 'x' })).status).toBe(403);
    expect((await request(buildApp()).delete('/api/rules/r1')).status).toBe(403);
    expect(sb.callsFor('Rule', 'insert')).toHaveLength(0);
    expect(sb.callsFor('Rule', 'update')).toHaveLength(0);
    expect(sb.callsFor('Rule', 'delete')).toHaveLength(0);
  });

  it('creates a rule (camelCase columns first)', async () => {
    signInAs(ADMIN);
    sb.handle((ctx) => (ctx.table === 'Rule' && ctx.op === 'insert' ? { data: dbRule(ctx.payload as object) } : undefined));

    const res = await request(buildApp())
      .post('/api/rules')
      .send({ name: 'Min deal', type: 'PRICING', logic: { minDealSize: 10000 } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Min deal', type: 'PRICING', isActive: true, logic: { minDealSize: 10000 } });
    expect(sb.callsFor('Rule', 'insert')[0].payload).toMatchObject({ isActive: true, description: '' });
  });

  it('retries with snake_case columns when the table uses them', async () => {
    signInAs(ADMIN);
    sb.handle((ctx) => {
      if (ctx.table !== 'Rule' || ctx.op !== 'insert') return undefined;
      const payload = ctx.payload as Record<string, unknown>;
      return 'isActive' in payload
        ? { error: { message: 'column "isActive" of relation "Rule" does not exist' } }
        : { data: { ...payload, id: payload.id } };
    });

    const res = await request(buildApp()).post('/api/rules').send({ name: 'Legacy', type: 'LEGAL' });

    expect(res.status).toBe(201);
    expect(sb.callsFor('Rule', 'insert')).toHaveLength(2);
    expect(sb.callsFor('Rule', 'insert')[1].payload).toMatchObject({ is_active: true });
  });

  it('validates required fields and reports a failed insert', async () => {
    signInAs(ADMIN);
    expect((await request(buildApp()).post('/api/rules').send({ name: 'no type' })).status).toBe(400);

    sb.handle((ctx) => (ctx.table === 'Rule' && ctx.op === 'insert' ? { error: { message: 'boom' } } : undefined));
    expect((await request(buildApp()).post('/api/rules').send({ name: 'x', type: 'LEGAL' })).status).toBe(500);
  });

  it('updates and deletes as an admin', async () => {
    signInAs(ADMIN);
    sb.handle((ctx) =>
      ctx.table === 'Rule' && ctx.op === 'update' ? { data: dbRule({ name: 'Renamed' }) } : undefined
    );

    const updated = await request(buildApp()).put('/api/rules/r1').send({ name: 'Renamed' });
    expect(updated.body).toMatchObject({ id: 'r1', name: 'Renamed' });
    expect(sb.callsFor('Rule', 'update')[0].filters).toContainEqual(['eq', 'id', 'r1']);

    const deleted = await request(buildApp()).delete('/api/rules/r1');
    expect(deleted.body).toEqual({ success: true });
  });
});

describe('templates', () => {
  it('lists active templates, newest first', async () => {
    signInAs(REP_C1);
    sb.handle((ctx) => (ctx.table === 'Template' ? { data: [{ id: 't1', name: 'MSA' }] } : undefined));

    const res = await request(buildApp()).get('/api/templates');

    expect(res.body).toEqual([{ id: 't1', name: 'MSA' }]);
    const query = sb.callsFor('Template', 'select')[0];
    expect(query.filters).toContainEqual(['eq', 'isActive', true]);
    expect(query.order?.[0]?.[0]).toBe('createdAt');
  });

  it('validates and creates a template', async () => {
    signInAs(REP_C1);
    expect((await request(buildApp()).post('/api/templates').send({ name: 'x' })).status).toBe(400);

    sb.handle((ctx) => (ctx.table === 'Template' && ctx.op === 'insert' ? { data: ctx.payload } : undefined));
    const res = await request(buildApp()).post('/api/templates').send({ name: 'SOW', type: 'SOW', content: '# SOW' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'SOW', description: '', isActive: true });
  });
});

describe('audit log and notifications', () => {
  const log = (id: string, timestamp: string) => ({
    id,
    action: 'Created proposal',
    timestamp,
    actorId: 'rep1',
    proposalId: 'p1',
    User: { name: 'Rep', email: 'r@b.com', role: 'SALES_REP' },
    Proposal: { title: 'Cloud Migration' },
  });

  it('shows an admin everything, formatted for the SPA', async () => {
    signInAs(ADMIN);
    sb.handle((ctx) => (ctx.table === 'AuditLog' ? { data: [log('a1', '2026-02-01T00:00:00Z')] } : undefined));

    const res = await request(buildApp()).get('/api/audit');

    expect(res.body[0]).toEqual({
      id: 'a1',
      action: 'Created proposal',
      timestamp: '2026-02-01T00:00:00Z',
      actorId: 'rep1',
      actor: { name: 'Rep', email: 'r@b.com', role: 'SALES_REP' },
      proposalId: 'p1',
      proposal: { title: 'Cloud Migration' },
    });
    const query = sb.callsFor('AuditLog', 'select')[0];
    expect(query.filters).toEqual([]);
    expect(query.limit).toBe(100);
  });

  it('scopes a company member to their own actions plus their company’s proposals', async () => {
    signInAs(REP_C1);
    sb.handle((ctx) => {
      if (ctx.table === 'Proposal') return { data: [{ id: 'p1' }, { id: 'p2' }] };
      if (ctx.table === 'AuditLog') return { data: [] };
      return undefined;
    });

    await request(buildApp()).get('/api/audit');

    const orFilter = sb.callsFor('AuditLog', 'select')[0].filters.find(([m]) => m === 'or');
    expect(orFilter?.[1]).toBe('actorId.eq.rep1,proposalId.in.(p1,p2)');
  });

  it('limits a user with no company to their own actions', async () => {
    signInAs(LONER);
    sb.handle((ctx) => (ctx.table === 'AuditLog' ? { data: [] } : undefined));

    await request(buildApp()).get('/api/audit');

    expect(sb.callsFor('AuditLog', 'select')[0].filters).toContainEqual(['eq', 'actorId', 'loner1']);
  });

  it('reports failures as a 500', async () => {
    signInAs(ADMIN);
    sb.handle((ctx) => (ctx.table === 'AuditLog' ? { error: { message: 'boom' } } : undefined));
    expect((await request(buildApp()).get('/api/audit')).status).toBe(500);
    expect((await request(buildApp()).get('/api/notifications')).status).toBe(500);
  });

  it('counts notifications newer than the client’s `since` timestamp', async () => {
    signInAs(ADMIN);
    sb.handle((ctx) =>
      ctx.table === 'AuditLog'
        ? { data: [log('new', '2026-03-02T00:00:00Z'), log('mid', '2026-03-01T12:00:00Z'), log('old', '2026-02-01T00:00:00Z')] }
        : undefined
    );

    const since = await request(buildApp()).get('/api/notifications?since=2026-03-01T00:00:00Z');
    expect(since.body.items).toHaveLength(3);
    expect(since.body.unreadCount).toBe(2);

    const noSince = await request(buildApp()).get('/api/notifications');
    expect(noSince.body.unreadCount).toBe(3);

    const badSince = await request(buildApp()).get('/api/notifications?since=not-a-date');
    expect(badSince.body.unreadCount).toBe(3);
  });
});

describe('analytics summary', () => {
  const rows = [
    { status: 'PENDING', createdAt: '2026-03-01T00:00:00Z', metadata: { discount: 5, dealSize: 1000, region: 'EMEA' }, RiskReport: [{ readinessScore: 70, legalRisk: 10, pricingRisk: 20, structuralRisk: 30 }] },
    { status: 'APPROVED', createdAt: '2026-03-02T00:00:00Z', metadata: {}, RiskReport: [] },
  ];

  it('returns the aggregates for an admin without filtering', async () => {
    signInAs(ADMIN);
    sb.handle((ctx) => (ctx.table === 'Proposal' && ctx.op === 'select' ? { data: rows } : undefined));

    const res = await request(buildApp()).get('/api/analytics/summary');

    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ total: 2, pending: 1, approved: 1 });
    expect(sb.callsFor('Proposal', 'select')[0].filters).toEqual([]);
  });

  it('narrows a company member to their company', async () => {
    signInAs(REP_C1);
    sb.handle((ctx) => (ctx.table === 'Proposal' && ctx.op === 'select' ? { data: [] } : undefined));
    await request(buildApp()).get('/api/analytics/summary');
    expect(sb.callsFor('Proposal', 'select')[0].filters).toContainEqual(['eq', 'company_id', 'c1']);
  });

  it('narrows a company-less user to their own proposals in login mode', async () => {
    process.env.AUTH_MODE = 'login';
    const jwt = (await import('jsonwebtoken')).default;
    sb.handle((ctx) => {
      if (ctx.table === 'User' && ctx.single) return { data: LONER };
      if (ctx.table === 'Proposal') return { data: [] };
      return undefined;
    });
    const token = jwt.sign({ userId: 'loner1' }, process.env.NEXTAUTH_SECRET as string);

    const res = await request(buildApp()).get('/api/analytics/summary').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(sb.callsFor('Proposal', 'select')[0].filters).toContainEqual(['eq', 'userId', 'loner1']);
  });

  it('reports a database failure as a 500', async () => {
    signInAs(ADMIN);
    sb.handle((ctx) => (ctx.table === 'Proposal' ? { error: { message: 'boom' } } : undefined));
    expect((await request(buildApp()).get('/api/analytics/summary')).status).toBe(500);
  });
});

describe('POST /api/auth/change-password', () => {
  const stored = async (password = 'old-password-123') => ({
    id: 'rep1',
    email: 'r@b.com',
    role: 'SALES_REP',
    company_id: null,
    password: await bcrypt.hash(password, 4),
  });

  function seedUser(row: Record<string, unknown> | null) {
    sb.handle((ctx) => {
      if (ctx.table !== 'User') return undefined;
      if (ctx.op === 'select') return { data: ctx.single ? row : row ? [row] : [] };
      return undefined;
    });
  }

  it('validates the request', async () => {
    seedUser(await stored());
    const app = buildApp();
    expect((await request(app).post('/api/auth/change-password').send({})).status).toBe(400);
    expect(
      (await request(app).post('/api/auth/change-password').send({ currentPassword: 'old-password-123', newPassword: 'short' })).status
    ).toBe(400);
  });

  it('rejects a wrong current password without changing anything', async () => {
    seedUser(await stored());
    const res = await request(buildApp())
      .post('/api/auth/change-password')
      .send({ currentPassword: 'not-the-password', newPassword: 'a-brand-new-password' });
    expect(res.status).toBe(401);
    expect(sb.callsFor('User', 'update')).toHaveLength(0);
  });

  it('refuses when the account has no password set', async () => {
    seedUser({ ...(await stored()), password: null });
    const res = await request(buildApp())
      .post('/api/auth/change-password')
      .send({ currentPassword: 'anything-long', newPassword: 'a-brand-new-password' });
    expect(res.status).toBe(400);
  });

  it('stores the new password hashed, never in the clear', async () => {
    seedUser(await stored());

    const res = await request(buildApp())
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old-password-123', newPassword: 'a-brand-new-password' });

    expect(res.status).toBe(200);
    const update = sb.callsFor('User', 'update')[0];
    const newHash = (update.payload as { password: string }).password;
    expect(newHash).not.toBe('a-brand-new-password');
    expect(await bcrypt.compare('a-brand-new-password', newHash)).toBe(true);
  });
});
