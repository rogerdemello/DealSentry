import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Shared, hoisted Supabase mock. The real client is a chainable query builder
// (`.from().select().eq().single()`); we return a single controllable result.
const { mockSingle, supabaseMock } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = mockSingle;
  const supabaseMock = { from: vi.fn(() => builder) };
  return { mockSingle, supabaseMock };
});

vi.mock('../src/lib/supabase', () => ({ supabase: supabaseMock, default: supabaseMock }));

// Imported after the mock is registered.
import { requireAuth, isAdmin, canAccessCompany } from '../src/api/middleware/auth';
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

beforeEach(() => {
  mockSingle.mockReset();
});

describe('requireAuth middleware', () => {
  it('rejects requests with no token (401)', async () => {
    const res = await request(buildApp()).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication required/i);
  });

  it('rejects an invalid/garbage token (401)', async () => {
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects an expired token (401, TOKEN_EXPIRED)', async () => {
    const expired = jwt.sign({ userId: 'u1' }, JWT_SECRET, { expiresIn: -10 });
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
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

  it('rejects a valid token whose user no longer exists (401)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const token = signToken({ userId: 'ghost' });
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
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
