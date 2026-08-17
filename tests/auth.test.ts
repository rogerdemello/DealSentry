import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Shared, hoisted Supabase mock. The real client is a chainable query builder
// (`.from().select().eq().single()` for one row, `.limit()` for a list); each
// terminal returns a single controllable result.
const { mockSingle, mockLimit, supabaseMock } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockLimit = vi.fn();
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = mockSingle;
  builder.limit = mockLimit;
  const supabaseMock = { from: vi.fn(() => builder) };
  return { mockSingle, mockLimit, supabaseMock };
});

vi.mock('../src/lib/supabase', () => ({ supabase: supabaseMock, default: supabaseMock }));

// Imported after the mock is registered.
import { requireAuth, isAdmin, canAccessCompany, resetDefaultUser } from '../src/api/middleware/auth';
import authRouter from '../src/api/auth';

const JWT_SECRET = process.env.NEXTAUTH_SECRET as string;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });
  return app;
}

function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

/** The row resolveDefaultUser() finds when the app runs without a token. */
const DEFAULT_USER_ROW = { id: 'default', email: 'admin@b.com', role: 'ADMIN', company_id: null };

beforeEach(() => {
  mockSingle.mockReset();
  mockLimit.mockReset();
  mockLimit.mockResolvedValue({ data: [DEFAULT_USER_ROW], error: null });
  resetDefaultUser();
});

// Sign-in was removed from the product: an absent or unusable token is served as
// the default user rather than rejected.
describe('requireAuth middleware', () => {
  it('serves requests with no token as the default user', async () => {
    const res = await request(buildApp()).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'default', role: 'ADMIN' });
  });

  it('falls back to the default user for an invalid/garbage token', async () => {
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'default' });
  });

  it('falls back to the default user for an expired token', async () => {
    const expired = jwt.sign({ userId: 'u1' }, JWT_SECRET, { expiresIn: -10 });
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'default' });
  });

  it('503s when no token is sent and the User table is empty', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    const res = await request(buildApp()).get('/protected');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/no user records/i);
  });

  it('503s with the DB error when the database is unreachable', async () => {
    mockLimit.mockRejectedValue(new Error('fetch failed'));
    const res = await request(buildApp()).get('/protected');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/database unavailable: fetch failed/i);
  });

  it('accepts a valid token and attaches the DB user to req.user', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', role: 'SALES_REP', company_id: 'c1' },
      error: null,
    });
    const token = signToken({ userId: 'u1' });
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'u1', role: 'SALES_REP', companyId: 'c1' });
  });

  it('falls back to the default user when the token user no longer exists', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const token = signToken({ userId: 'ghost' });
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'default' });
  });
});

describe('GET /api/auth/session', () => {
  it('reports the default user when no token is sent', async () => {
    const res = await request(buildApp()).get('/api/auth/session');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'default', email: 'admin@b.com', role: 'ADMIN' });
  });

  it('reports the token user when a valid token is sent', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', role: 'SALES_REP', company_id: 'c1' },
      error: null,
    });
    const res = await request(buildApp())
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${signToken({ userId: 'u1' })}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'u1', companyId: 'c1' });
  });
});

describe('RBAC helpers', () => {
  const adminReq = { user: { id: 'a', email: 'a', role: 'ADMIN', companyId: 'c1' } } as never;
  const repReq = { user: { id: 'r', email: 'r', role: 'SALES_REP', companyId: 'c1' } } as never;

  it('isAdmin is true only for ADMIN role', () => {
    expect(isAdmin(adminReq)).toBe(true);
    expect(isAdmin(repReq)).toBe(false);
  });

  it('admin can access any company', () => {
    expect(canAccessCompany('c2', adminReq)).toBe(true);
  });

  it('non-admin can access only their own company', () => {
    expect(canAccessCompany('c1', repReq)).toBe(true);
    expect(canAccessCompany('c2', repReq)).toBe(false);
  });

  it('null company is allowed (backward compat)', () => {
    expect(canAccessCompany(null, repReq)).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  it('400 when email/password missing', async () => {
    const res = await request(buildApp()).post('/api/auth/login').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('401 on unknown user', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'no rows' } });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'nobody@b.com', password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('401 on wrong password', async () => {
    const hash = await bcrypt.hash('correct-password', 10);
    mockSingle.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', role: 'SALES_REP', password: hash, company_id: 'c1' },
      error: null,
    });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('200 and returns a token on correct credentials', async () => {
    const hash = await bcrypt.hash('correct-password', 10);
    mockSingle.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', name: 'A', role: 'SALES_REP', password: hash, company_id: 'c1' },
      error: null,
    });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ id: 'u1', role: 'SALES_REP', companyId: 'c1' });

    // Token must be verifiable and carry the right claims.
    const decoded = jwt.verify(res.body.token, JWT_SECRET) as Record<string, unknown>;
    expect(decoded.userId).toBe('u1');
    expect(decoded.role).toBe('SALES_REP');
  });
});
