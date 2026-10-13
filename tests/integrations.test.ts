import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseMock } from './helpers/supabaseMock';

vi.mock('../src/lib/supabase', async () => {
  const { createSupabaseMock } = await import('./helpers/supabaseMock');
  const mock = createSupabaseMock();
  return { supabase: mock.client, default: mock.client, __mock: mock };
});

const { runSyncMock } = vi.hoisted(() => ({ runSyncMock: vi.fn() }));
vi.mock('../src/api/lib/sync', () => ({ runSync: runSyncMock }));

import * as supabaseModule from '../src/lib/supabase';
import integrationsRouter from '../src/api/integrations';
import { resetDefaultUser } from '../src/api/middleware/auth';

const sb = (supabaseModule as unknown as { __mock: SupabaseMock }).__mock;

const USER = { id: 'u1', email: 'u@b.com', role: 'SALES_REP', company_id: 'c1' };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'int1',
  type: 'HUBSPOT',
  name: 'HubSpot',
  userId: 'u1',
  isActive: true,
  credentials: { accessToken: 'SECRET-ACCESS', refreshToken: 'SECRET-REFRESH' },
  config: {},
  lastSyncAt: null,
  ...over,
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/integrations', integrationsRouter);
  return app;
}

/** The signed-in default user, plus the integration row(s) the routes will find. */
function seed(integration: Record<string, unknown> | null = row(), user = USER) {
  sb.handle((ctx) => {
    if (ctx.table === 'User' && ctx.op === 'select') return { data: [user] };
    if (ctx.table === 'Integration' && ctx.op === 'select') {
      return ctx.single ? { data: integration } : { data: integration ? [integration] : [] };
    }
    if (ctx.table === 'Integration' && (ctx.op === 'insert' || ctx.op === 'update')) {
      return { data: { ...integration, ...(ctx.payload as object) } };
    }
    if (ctx.table === 'SyncLog' && ctx.op === 'insert') return { data: { id: 'log1', ...(ctx.payload as object) } };
    return undefined;
  });
}

const syncOk = (over: Record<string, unknown> = {}) => ({
  recordsAffected: 2,
  failed: false,
  deactivate: false,
  details: { message: 'Synced 2 new deals' },
  ...over,
});

beforeEach(() => {
  sb.reset();
  resetDefaultUser();
  runSyncMock.mockReset();
  delete process.env.AUTH_MODE;
});

describe('credentials never reach the browser', () => {
  const SECRETS = ['SECRET-ACCESS', 'SECRET-REFRESH'];

  it('redacts tokens from the list but still says the integration is connected', async () => {
    seed();
    const res = await request(buildApp()).get('/api/integrations');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: 'int1', hasCredentials: true, credentials: { connected: true } });
    for (const secret of SECRETS) expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it('shows empty credentials for a disconnected integration', async () => {
    seed(row({ credentials: {}, isActive: false }));
    const res = await request(buildApp()).get('/api/integrations');
    expect(res.body[0]).toMatchObject({ hasCredentials: false, credentials: {} });
  });

  it('flags demo connections', async () => {
    seed(row({ credentials: { demo: true, accessToken: 'demo_token' } }));
    const res = await request(buildApp()).get('/api/integrations');
    expect(res.body[0].credentials).toEqual({ connected: true, demo: true });
  });

  it('redacts a single integration, a create, and an update too', async () => {
    seed();
    const single = await request(buildApp()).get('/api/integrations/int1');
    const created = await request(buildApp())
      .post('/api/integrations')
      .send({ type: 'HUBSPOT', name: 'HubSpot', credentials: { accessToken: 'SECRET-ACCESS' } });
    const updated = await request(buildApp()).patch('/api/integrations/int1').send({ name: 'Renamed' });

    for (const res of [single, created, updated]) {
      expect(res.status).toBeLessThan(300);
      for (const secret of SECRETS) expect(JSON.stringify(res.body)).not.toContain(secret);
    }
  });

  it('still lets the SPA disconnect by clearing credentials', async () => {
    seed();
    const res = await request(buildApp()).patch('/api/integrations/int1').send({ isActive: false, credentials: {} });
    expect(res.status).toBe(200);
    expect(sb.callsFor('Integration', 'update')[0].payload).toMatchObject({ isActive: false, credentials: {} });
  });
});

describe('ownership', () => {
  it("only lists the caller's integrations", async () => {
    seed();
    await request(buildApp()).get('/api/integrations');
    expect(sb.callsFor('Integration', 'select')[0].filters).toContainEqual(['eq', 'userId', 'u1']);
  });

  it("403s when touching someone else's integration", async () => {
    seed(row({ userId: 'someone-else' }));
    expect((await request(buildApp()).patch('/api/integrations/int1').send({ name: 'x' })).status).toBe(403);
    expect((await request(buildApp()).delete('/api/integrations/int1')).status).toBe(403);
    expect((await request(buildApp()).get('/api/integrations/int1/logs')).status).toBe(403);
    expect(sb.callsFor('Integration', 'update')).toHaveLength(0);
    expect(sb.callsFor('Integration', 'delete')).toHaveLength(0);
  });

  it('404s a sync for an integration that is not yours', async () => {
    seed(null);
    const res = await request(buildApp()).post('/api/integrations/int1/sync');
    expect(res.status).toBe(404);
    expect(runSyncMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/integrations', () => {
  it('requires a type and name, and rejects unknown types', async () => {
    seed();
    expect((await request(buildApp()).post('/api/integrations').send({ name: 'x' })).status).toBe(400);
    expect((await request(buildApp()).post('/api/integrations').send({ type: 'HUBSPOT' })).status).toBe(400);
    const unknown = await request(buildApp()).post('/api/integrations').send({ type: 'MYSPACE', name: 'x' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/Unknown integration type/);
  });
});

describe('DELETE /api/integrations/:id', () => {
  it('removes the sync logs before the integration (no DB cascade)', async () => {
    seed();
    const res = await request(buildApp()).delete('/api/integrations/int1');
    expect(res.status).toBe(204);
    const order = sb.calls.filter((c) => c.op === 'delete').map((c) => c.table);
    expect(order).toEqual(['SyncLog', 'Integration']);
  });
});

describe('POST /api/integrations/:id/sync', () => {
  it('runs the sync for the owner and records success', async () => {
    seed();
    runSyncMock.mockResolvedValue(syncOk());

    const res = await request(buildApp()).post('/api/integrations/int1/sync');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: 'Synced 2 new deals', recordsAffected: 2 });
    expect(runSyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', companyId: 'c1', integration: expect.objectContaining({ id: 'int1' }) })
    );
    expect(sb.callsFor('SyncLog', 'insert')[0].payload).toMatchObject({
      integrationId: 'int1',
      status: 'SUCCESS',
      recordsAffected: 2,
    });
    // lastSyncAt is bumped on success.
    expect(sb.callsFor('Integration', 'update').some((c) => 'lastSyncAt' in (c.payload as object))).toBe(true);
  });

  it('counts a sync with nothing new as a success', async () => {
    seed();
    runSyncMock.mockResolvedValue(syncOk({ recordsAffected: 0, details: { message: 'No new deals' } }));
    const res = await request(buildApp()).post('/api/integrations/int1/sync');
    expect(res.body.success).toBe(true);
    expect(sb.callsFor('SyncLog', 'insert')[0].payload).toMatchObject({ status: 'SUCCESS' });
  });

  it('answers a failed sync with 424, the reason, and a log entry — not a 200', async () => {
    seed();
    runSyncMock.mockResolvedValue({
      recordsAffected: 0,
      failed: true,
      deactivate: false,
      details: { error: 'HubSpot API error: Service Unavailable.', message: 'Sync failed' },
    });

    const res = await request(buildApp()).post('/api/integrations/int1/sync');

    expect(res.status).toBe(424);
    expect(res.body).toMatchObject({
      success: false,
      error: 'HubSpot API error: Service Unavailable.',
      needsReconnect: false,
      code: 'SYNC_FAILED',
    });
    expect(sb.callsFor('SyncLog', 'insert')[0].payload).toMatchObject({ status: 'FAILURE' });
    // A failed sync must not claim a fresh "last synced" time.
    expect(sb.callsFor('Integration', 'update').some((c) => 'lastSyncAt' in (c.payload as object))).toBe(false);
  });

  it('switches off a revoked connection and tells the client to reconnect', async () => {
    seed();
    runSyncMock.mockResolvedValue({
      recordsAffected: 0,
      failed: true,
      deactivate: true,
      details: { error: 'No access token found. Please reconnect HubSpot.', message: 'Sync failed' },
    });

    const res = await request(buildApp()).post('/api/integrations/int1/sync');

    expect(res.status).toBe(424);
    expect(res.body.needsReconnect).toBe(true);
    expect(sb.callsFor('Integration', 'update')[0].payload).toMatchObject({ isActive: false });
  });
});

describe('GET /api/integrations/:id/logs', () => {
  it('clamps the limit to a sane range', async () => {
    seed();
    await request(buildApp()).get('/api/integrations/int1/logs?limit=100000');
    expect(sb.callsFor('SyncLog', 'select')[0].limit).toBe(200);

    sb.calls.length = 0;
    await request(buildApp()).get('/api/integrations/int1/logs?limit=abc');
    expect(sb.callsFor('SyncLog', 'select')[0].limit).toBe(50);
  });
});
