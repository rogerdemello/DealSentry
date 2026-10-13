import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { SupabaseMock } from './helpers/supabaseMock';

vi.mock('../src/lib/supabase', async () => {
  const { createSupabaseMock } = await import('./helpers/supabaseMock');
  const mock = createSupabaseMock();
  return { supabase: mock.client, default: mock.client, __mock: mock };
});

const { extractRawText } = vi.hoisted(() => ({ extractRawText: vi.fn() }));
vi.mock('mammoth', () => ({ default: { extractRawText } }));

import * as supabaseModule from '../src/lib/supabase';
import filesRouter, { MAX_FILE_BYTES, canAccessFile, toStorageKey } from '../src/api/files';
import { resetDefaultUser } from '../src/api/middleware/auth';

const sb = (supabaseModule as unknown as { __mock: SupabaseMock }).__mock;

const ADMIN = { id: 'admin1', email: 'a@b.com', role: 'ADMIN', company_id: null };
const REP = { id: 'rep1', email: 'r@b.com', role: 'SALES_REP', company_id: null };

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/files', filesRouter);
  return app;
}

const b64 = (text: string | Buffer) => Buffer.from(text).toString('base64');

/** GET `path` exactly as written (no URL normalisation) and resolve with the status code. */
function rawGet(app: express.Express, path: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      http
        .get({ host: '127.0.0.1', port, path, headers }, (res) => {
          res.resume();
          res.on('end', () => {
            server.close();
            resolve(res.statusCode ?? 0);
          });
        })
        .on('error', (err) => {
          server.close();
          reject(err);
        });
    });
  });
}

/** Demo mode: the default user is whoever we seed. Login mode: a token for them. */
function signInAs(user: Record<string, unknown>, mode: 'demo' | 'login') {
  process.env.AUTH_MODE = mode;
  sb.handle((ctx) => {
    if (ctx.table === 'User' && ctx.op === 'select') return { data: ctx.single ? user : [user] };
    return undefined;
  });
  return mode === 'login' ? { Authorization: `Bearer ${jwt.sign({ userId: user.id }, process.env.NEXTAUTH_SECRET as string)}` } : {};
}

beforeEach(() => {
  sb.reset();
  resetDefaultUser();
  extractRawText.mockReset();
  delete process.env.AUTH_MODE;
});

afterEach(() => {
  delete process.env.AUTH_MODE;
});

describe('toStorageKey', () => {
  it('maps a new-style path onto itself', () => {
    expect(toStorageKey(['proposals', 'u1', '123_a.pdf'])).toBe('proposals/u1/123_a.pdf');
  });

  it('prefixes a legacy flat name with proposals/', () => {
    expect(toStorageKey(['123_a.pdf'])).toBe('proposals/123_a.pdf');
  });

  it('rejects traversal and empty segments', () => {
    expect(toStorageKey(['proposals', '..', 'x'])).toBeNull();
    expect(toStorageKey(['proposals', '.', 'x'])).toBeNull();
    expect(toStorageKey(['proposals', '', 'x'])).toBeNull();
    expect(toStorageKey([])).toBeNull();
    expect(toStorageKey(undefined)).toBeNull();
  });
});

describe('canAccessFile', () => {
  const asReq = (user: Record<string, unknown>) => ({ user }) as never;

  it('lets admins reach anything', () => {
    process.env.AUTH_MODE = 'login';
    expect(canAccessFile('proposals/other/1_x.pdf', asReq({ id: 'a', role: 'ADMIN' }))).toBe(true);
  });

  it('confines others to their own folder', () => {
    const rep = asReq({ id: 'rep1', role: 'SALES_REP' });
    expect(canAccessFile('proposals/rep1/1_x.pdf', rep)).toBe(true);
    expect(canAccessFile('proposals/rep2/1_x.pdf', rep)).toBe(false);
    // A user id that merely starts with another's must not match.
    expect(canAccessFile('proposals/rep10/1_x.pdf', rep)).toBe(false);
  });

  it('opens legacy flat files in demo mode only', () => {
    const rep = asReq({ id: 'rep1', role: 'SALES_REP' });
    process.env.AUTH_MODE = 'demo';
    expect(canAccessFile('proposals/1_old.pdf', rep)).toBe(true);
    process.env.AUTH_MODE = 'login';
    expect(canAccessFile('proposals/1_old.pdf', rep)).toBe(false);
  });
});

describe('POST /api/files/upload', () => {
  it('400s without a file or name', async () => {
    signInAs(REP, 'demo');
    expect((await request(buildApp()).post('/api/files/upload').send({})).status).toBe(400);
    expect((await request(buildApp()).post('/api/files/upload').send({ file: b64('x') })).status).toBe(400);
    expect((await request(buildApp()).post('/api/files/upload').send({ file: b64('x'), fileName: 42 })).status).toBe(400);
  });

  it('rejects file types outside the allow-list', async () => {
    signInAs(REP, 'demo');
    for (const fileName of ['evil.html', 'run.exe', 'noextension', 'archive.zip']) {
      const res = await request(buildApp()).post('/api/files/upload').send({ file: b64('x'), fileName });
      expect(res.status).toBe(400);
    }
    expect(sb.storage.upload).not.toHaveBeenCalled();
  });

  it('rejects an empty file and an oversized one', async () => {
    signInAs(REP, 'demo');
    expect((await request(buildApp()).post('/api/files/upload').send({ file: '', fileName: 'a.pdf' })).status).toBe(400);

    const tooBig = Buffer.alloc(MAX_FILE_BYTES + 1, 1);
    const res = await request(buildApp()).post('/api/files/upload').send({ file: b64(tooBig), fileName: 'a.pdf' });
    expect(res.status).toBe(413);
    expect(sb.storage.upload).not.toHaveBeenCalled();
  });

  it('stores the file in the user’s folder with a proper content type and returns a signed link', async () => {
    signInAs(REP, 'demo');

    const res = await request(buildApp())
      .post('/api/files/upload')
      .send({ file: b64('%PDF-1.4'), fileName: 'My Proposal (v2).pdf' });

    expect(res.status).toBe(200);
    const [key, , options] = sb.storage.upload.mock.calls[0];
    expect(key).toMatch(/^proposals\/rep1\/\d+_My_Proposal__v2_\.pdf$/);
    expect(options).toMatchObject({ contentType: 'application/pdf', upsert: false });
    expect(res.body).toMatchObject({ success: true, filePath: key, extractedText: null });
    expect(res.body.fileUrl).toContain('signed.example');
  });

  it('falls back to the public URL if signing fails', async () => {
    signInAs(REP, 'demo');
    sb.storage.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const res = await request(buildApp()).post('/api/files/upload').send({ file: b64('hi'), fileName: 'a.txt' });
    expect(res.body.fileUrl).toContain('public.example');
  });

  it('extracts text from a .docx', async () => {
    signInAs(REP, 'demo');
    extractRawText.mockResolvedValue({ value: 'Hello from Word' });
    const res = await request(buildApp()).post('/api/files/upload').send({ file: b64('PK'), fileName: 'a.docx' });
    expect(res.body.extractedText).toBe('Hello from Word');
  });

  it('still succeeds when .docx text extraction fails', async () => {
    signInAs(REP, 'demo');
    extractRawText.mockRejectedValue(new Error('corrupt'));
    const res = await request(buildApp()).post('/api/files/upload').send({ file: b64('PK'), fileName: 'a.docx' });
    expect(res.status).toBe(200);
    expect(res.body.extractedText).toBeNull();
  });

  it('explains how to fix a missing bucket', async () => {
    signInAs(REP, 'demo');
    sb.storage.upload.mockResolvedValue({ data: null, error: { message: 'Bucket not found' } });
    const res = await request(buildApp()).post('/api/files/upload').send({ file: b64('hi'), fileName: 'a.txt' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/storage_bucket\.sql/);
  });
});

describe('GET /api/files/download/*', () => {
  it('serves your own file as an attachment', async () => {
    const headers = signInAs(REP, 'login');
    const res = await request(buildApp())
      .get('/api/files/download/proposals/rep1/1_plan.pdf')
      .set(headers)
      .buffer(true);

    expect(res.status).toBe(200);
    expect(sb.storage.download).toHaveBeenCalledWith('proposals/rep1/1_plan.pdf');
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment; filename="1_plan.pdf"');
  });

  it('refuses another user’s file in login mode', async () => {
    const headers = signInAs(REP, 'login');
    const res = await request(buildApp()).get('/api/files/download/proposals/rep2/1_plan.pdf').set(headers);
    expect(res.status).toBe(403);
    expect(sb.storage.download).not.toHaveBeenCalled();
  });

  it('lets an admin download anyone’s file', async () => {
    const headers = signInAs(ADMIN, 'login');
    const res = await request(buildApp()).get('/api/files/download/proposals/rep2/1_plan.pdf').set(headers);
    expect(res.status).toBe(200);
  });

  it('keeps the old flat URL working in demo mode', async () => {
    signInAs(REP, 'demo');
    const res = await request(buildApp()).get('/api/files/download/1_old.pdf');
    expect(res.status).toBe(200);
    expect(sb.storage.download).toHaveBeenCalledWith('proposals/1_old.pdf');
  });

  it('rejects path traversal (sent raw, as a hostile client would)', async () => {
    const headers = signInAs(ADMIN, 'login');
    // supertest/superagent resolve "%2e%2e" into a real ".." and collapse it before
    // sending, so talk to the server with a bare http request instead.
    const status = await rawGet(buildApp(), '/api/files/download/proposals/%2e%2e/secret', headers);
    expect(status).toBe(400);
    expect(sb.storage.download).not.toHaveBeenCalled();
  });

  it('401s without a token in login mode', async () => {
    signInAs(REP, 'login');
    const res = await request(buildApp()).get('/api/files/download/proposals/rep1/1_plan.pdf');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/files/delete/*', () => {
  it('deletes your own file', async () => {
    const headers = signInAs(REP, 'login');
    const res = await request(buildApp()).delete('/api/files/delete/proposals/rep1/1_plan.pdf').set(headers);
    expect(res.status).toBe(200);
    expect(sb.storage.remove).toHaveBeenCalledWith(['proposals/rep1/1_plan.pdf']);
  });

  it('refuses to delete another user’s file', async () => {
    const headers = signInAs(REP, 'login');
    const res = await request(buildApp()).delete('/api/files/delete/proposals/rep2/1_plan.pdf').set(headers);
    expect(res.status).toBe(403);
    expect(sb.storage.remove).not.toHaveBeenCalled();
  });
});

describe('POST /api/files/extract-text', () => {
  it('reads .txt and .md directly', async () => {
    signInAs(REP, 'demo');
    const res = await request(buildApp())
      .post('/api/files/extract-text')
      .send({ file: b64('one two three'), fileName: 'notes.txt' });
    expect(res.body).toMatchObject({ success: true, extractedText: 'one two three', wordCount: 3, charCount: 13 });
  });

  it('reads .docx through mammoth', async () => {
    signInAs(REP, 'demo');
    extractRawText.mockResolvedValue({ value: 'From Word' });
    const res = await request(buildApp()).post('/api/files/extract-text').send({ file: b64('PK'), fileName: 'a.docx' });
    expect(res.body.extractedText).toBe('From Word');
  });

  it('rejects unsupported types and missing input', async () => {
    signInAs(REP, 'demo');
    expect((await request(buildApp()).post('/api/files/extract-text').send({ file: b64('x'), fileName: 'a.pdf' })).status).toBe(400);
    expect((await request(buildApp()).post('/api/files/extract-text').send({ fileName: 'a.txt' })).status).toBe(400);
    expect((await request(buildApp()).post('/api/files/extract-text').send({ file: b64('x') })).status).toBe(400);
  });
});
