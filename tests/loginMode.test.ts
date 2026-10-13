import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Chainable Supabase mock; each terminal returns a single controllable result.
const { mockSingle, mockLimit, mockOrder, mockInsert, supabaseMock } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockLimit = vi.fn();
  const mockOrder = vi.fn();
  const builder: Record<string, unknown> = {};
  const mockInsert = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.insert = mockInsert;
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.order = mockOrder;
  builder.single = mockSingle;
  builder.limit = mockLimit;
  const supabaseMock = { from: vi.fn(() => builder) };
  return { mockSingle, mockLimit, mockOrder, mockInsert, supabaseMock };
});
vi.mock('../src/lib/supabase', () => ({ supabase: supabaseMock, default: supabaseMock }));

import {
  canAccessResource,
  listScope,
  requireAuth,
  resetDefaultUser,
} from '../src/api/middleware/auth';
import { checkAuthConfig, getAuthMode, getJwtSecret } from '../src/api/lib/authConfig';
import authRouter from '../src/api/auth';
import usersRouter from '../src/api/users';

const SECRET = process.env.NEXTAUTH_SECRET as string;
const ENV_KEYS = ['AUTH_MODE', 'ALLOW_SELF_REGISTRATION', 'NEXTAUTH_SECRET', 'NODE_ENV'] as const;
let savedEnv: Record<string, string | undefined>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });
  return app;
}

const tokenFor = (userId = 'u1') => jwt.sign({ userId }, SECRET, { expiresIn: '1h' });

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'rep@b.com',
  role: 'SALES_REP',
  company_id: null,
  ...over,
});

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  mockSingle.mockReset();
  mockLimit.mockReset();
  mockOrder.mockReset();
  mockInsert.mockClear();
  // A default admin exists, so a leak into demo behaviour would be visible.
  mockLimit.mockResolvedValue({ data: [userRow({ id: 'admin1', role: 'ADMIN' })], error: null });
  resetDefaultUser();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('authConfig', () => {
  it('defaults to demo mode and switches on AUTH_MODE=login', () => {
    delete process.env.AUTH_MODE;
    expect(getAuthMode()).toBe('demo');
    process.env.AUTH_MODE = 'login';
    expect(getAuthMode()).toBe('login');
    process.env.AUTH_MODE = 'anything-else';
    expect(getAuthMode()).toBe('demo');
  });

  it('refuses a missing or placeholder secret in login mode', () => {
    process.env.AUTH_MODE = 'login';
    delete process.env.NEXTAUTH_SECRET;
    expect(() => getJwtSecret()).toThrow(/NEXTAUTH_SECRET/);
    process.env.NEXTAUTH_SECRET = 'default-secret-change-in-production';
    expect(() => getJwtSecret()).toThrow(/NEXTAUTH_SECRET/);
    expect(() => checkAuthConfig()).toThrow();
  });

  it('tolerates a missing secret in demo mode, and warns in production', () => {
    process.env.AUTH_MODE = 'demo';
    delete process.env.NEXTAUTH_SECRET;
    expect(getJwtSecret()).toBeTruthy();
    expect(checkAuthConfig()).toEqual([]);
    process.env.NODE_ENV = 'production';
    expect(checkAuthConfig().join(' ')).toMatch(/NEXTAUTH_SECRET/);
  });

  it('accepts a real secret in login mode', () => {
    process.env.AUTH_MODE = 'login';
    process.env.NEXTAUTH_SECRET = 'a-long-random-secret-for-testing-only';
    expect(getJwtSecret()).toBe('a-long-random-secret-for-testing-only');
    expect(() => checkAuthConfig()).not.toThrow();
  });
});

describe('requireAuth in login mode', () => {
  beforeEach(() => {
    process.env.AUTH_MODE = 'login';
  });

  it('401s with AUTH_REQUIRED when no token is sent, and never serves the default user', async () => {
    const res = await request(buildApp()).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it('401s for a garbage token', async () => {
    const res = await request(buildApp()).get('/protected').set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('401s for an expired token', async () => {
    const expired = jwt.sign({ userId: 'u1' }, SECRET, { expiresIn: -10 });
    const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('401s for a token signed with another secret', async () => {
    const forged = jwt.sign({ userId: 'u1' }, 'not-the-real-secret', { expiresIn: '1h' });
    const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('401s when the token is valid but the user no longer exists', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(401);
  });

  it('503s (not 401) when the token is valid but the database is failing', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });
    const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/database unavailable/i);
  });

  it('accepts a valid token and loads the user', async () => {
    mockSingle.mockResolvedValue({ data: userRow({ company_id: 'c1' }), error: null });
    const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'u1', role: 'SALES_REP', companyId: 'c1' });
  });

  it('demo mode is unchanged: no token still resolves the default user', async () => {
    process.env.AUTH_MODE = 'demo';
    const res = await request(buildApp()).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'admin1', role: 'ADMIN' });
  });
});

describe('canAccessResource', () => {
  const asReq = (user: Record<string, unknown>) => ({ user }) as never;
  const admin = asReq({ id: 'a', role: 'ADMIN', companyId: null });
  const rep = asReq({ id: 'r1', role: 'SALES_REP', companyId: 'c1' });
  const loner = asReq({ id: 'r2', role: 'SALES_REP', companyId: null });

  it('admins can access anything in either mode', () => {
    for (const mode of ['demo', 'login']) {
      process.env.AUTH_MODE = mode;
      expect(canAccessResource({ companyId: 'c9', ownerId: 'x' }, admin)).toBe(true);
      expect(canAccessResource({ companyId: null, ownerId: 'x' }, admin)).toBe(true);
    }
  });

  it('a company resource is visible only to that company', () => {
    for (const mode of ['demo', 'login']) {
      process.env.AUTH_MODE = mode;
      expect(canAccessResource({ companyId: 'c1', ownerId: 'x' }, rep)).toBe(true);
      expect(canAccessResource({ companyId: 'c2', ownerId: 'x' }, rep)).toBe(false);
      expect(canAccessResource({ companyId: 'c1', ownerId: 'x' }, loner)).toBe(false);
    }
  });

  it('legacy no-company data is open in demo mode but owner-only in login mode', () => {
    process.env.AUTH_MODE = 'demo';
    expect(canAccessResource({ companyId: null, ownerId: 'someone-else' }, rep)).toBe(true);

    process.env.AUTH_MODE = 'login';
    expect(canAccessResource({ companyId: null, ownerId: 'someone-else' }, rep)).toBe(false);
    expect(canAccessResource({ companyId: null, ownerId: 'r1' }, rep)).toBe(true);
    expect(canAccessResource({ companyId: null, ownerId: null }, rep)).toBe(false);
  });
});

describe('listScope', () => {
  const asReq = (user: Record<string, unknown>) => ({ user }) as never;

  it('does not narrow admins', () => {
    process.env.AUTH_MODE = 'login';
    expect(listScope(asReq({ id: 'a', role: 'ADMIN', companyId: 'c1' }))).toBeNull();
  });

  it('narrows a company member to their company', () => {
    expect(listScope(asReq({ id: 'r', role: 'SALES_REP', companyId: 'c1' }))).toEqual({
      column: 'company_id',
      value: 'c1',
    });
  });

  it('narrows a company-less user to their own rows in login mode only', () => {
    const loner = asReq({ id: 'r2', role: 'SALES_REP', companyId: null });
    process.env.AUTH_MODE = 'demo';
    expect(listScope(loner)).toBeNull();
    process.env.AUTH_MODE = 'login';
    expect(listScope(loner)).toEqual({ column: 'userId', value: 'r2' });
  });
});

describe('GET /api/auth/config', () => {
  it('reports the mode and registration flag without authentication', async () => {
    process.env.AUTH_MODE = 'login';
    process.env.ALLOW_SELF_REGISTRATION = 'true';
    const res = await request(buildApp()).get('/api/auth/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mode: 'login', allowRegistration: true });
  });

  it('defaults to demo with registration closed', async () => {
    delete process.env.AUTH_MODE;
    delete process.env.ALLOW_SELF_REGISTRATION;
    const res = await request(buildApp()).get('/api/auth/config');
    expect(res.body).toEqual({ mode: 'demo', allowRegistration: false });
  });
});

describe('POST /api/auth/register', () => {
  const body = { email: '  New.User@Example.COM ', password: 'long-enough-pw', name: 'New User' };

  it('is closed unless ALLOW_SELF_REGISTRATION=true', async () => {
    delete process.env.ALLOW_SELF_REGISTRATION;
    const res = await request(buildApp()).post('/api/auth/register').send(body);
    expect(res.status).toBe(403);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  describe('when enabled', () => {
    beforeEach(() => {
      process.env.ALLOW_SELF_REGISTRATION = 'true';
    });

    it('creates a SALES_REP with a normalised email and ignores a client-supplied companyId', async () => {
      mockLimit.mockResolvedValue({ data: [], error: null }); // no existing user
      mockSingle.mockResolvedValue({
        data: { id: 'new1', email: 'new.user@example.com', name: 'New User', role: 'SALES_REP' },
        error: null,
      });

      const res = await request(buildApp())
        .post('/api/auth/register')
        .send({ ...body, companyId: 'victim-company', role: 'ADMIN' });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.role).toBe('SALES_REP');

      const inserted = (mockInsert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      expect(inserted.email).toBe('new.user@example.com');
      expect(inserted.role).toBe('SALES_REP');
      expect(inserted).not.toHaveProperty('company_id');
      // The password is stored hashed, never in the clear.
      expect(inserted.password).not.toBe(body.password);
      expect(String(inserted.password)).toMatch(/^\$2[aby]\$/);
    });

    it('409s when the email is already registered', async () => {
      mockLimit.mockResolvedValue({ data: [{ id: 'existing' }], error: null });
      const res = await request(buildApp()).post('/api/auth/register').send(body);
      expect(res.status).toBe(409);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('400s on a short password and on a missing email', async () => {
      const short = await request(buildApp()).post('/api/auth/register').send({ ...body, password: 'short' });
      expect(short.status).toBe(400);
      const noEmail = await request(buildApp()).post('/api/auth/register').send({ password: 'long-enough-pw' });
      expect(noEmail.status).toBe(400);
    });
  });
});

describe('users routes in login mode', () => {
  beforeEach(() => {
    process.env.AUTH_MODE = 'login';
  });

  it('does not let a non-admin list every user', async () => {
    mockSingle.mockResolvedValueOnce({ data: userRow(), error: null });
    const res = await request(buildApp()).get('/api/users').set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(403);
  });

  it('does not let a non-admin read another user, but allows reading themselves', async () => {
    mockSingle.mockResolvedValueOnce({ data: userRow(), error: null });
    const other = await request(buildApp()).get('/api/users/someone-else').set('Authorization', `Bearer ${tokenFor()}`);
    expect(other.status).toBe(403);

    mockSingle
      .mockResolvedValueOnce({ data: userRow(), error: null }) // requireAuth
      .mockResolvedValueOnce({ data: userRow({ password: 'hash' }), error: null }); // the route
    const self = await request(buildApp()).get('/api/users/u1').set('Authorization', `Bearer ${tokenFor()}`);
    expect(self.status).toBe(200);
    expect(self.body).not.toHaveProperty('password');
  });

  it('lets an admin create a user with a hashed password and a company', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: userRow({ id: 'adm', role: 'ADMIN' }), error: null }) // requireAuth
      .mockResolvedValueOnce({ data: userRow({ id: 'n1', email: 'n@b.com', password: 'x' }), error: null }); // insert
    const res = await request(buildApp())
      .post('/api/users')
      .set('Authorization', `Bearer ${tokenFor('adm')}`)
      .send({ email: 'N@B.com', password: 'initial-password', companyId: 'c7', role: 'LEGAL' });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('password');
    const inserted = (mockInsert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({ email: 'n@b.com', role: 'LEGAL', company_id: 'c7' });
    expect(String(inserted.password)).toMatch(/^\$2[aby]\$/);
  });

  it('rejects an unknown role and a weak password', async () => {
    mockSingle.mockResolvedValue({ data: userRow({ id: 'adm', role: 'ADMIN' }), error: null });
    const badRole = await request(buildApp())
      .post('/api/users')
      .set('Authorization', `Bearer ${tokenFor('adm')}`)
      .send({ email: 'a@b.com', role: 'SUPERUSER' });
    expect(badRole.status).toBe(400);

    const weak = await request(buildApp())
      .post('/api/users')
      .set('Authorization', `Bearer ${tokenFor('adm')}`)
      .send({ email: 'a@b.com', password: '123' });
    expect(weak.status).toBe(400);
  });

  it('stops an admin deleting their own account', async () => {
    mockSingle.mockResolvedValue({ data: userRow({ id: 'adm', role: 'ADMIN' }), error: null });
    const res = await request(buildApp()).delete('/api/users/adm').set('Authorization', `Bearer ${tokenFor('adm')}`);
    expect(res.status).toBe(400);
  });
});
