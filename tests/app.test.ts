import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import express from 'express';

vi.mock('../src/lib/supabase', async () => {
  const { createSupabaseMock } = await import('./helpers/supabaseMock');
  const mock = createSupabaseMock();
  return { supabase: mock.client, default: mock.client, __mock: mock };
});

// One route that blows up, to exercise the global error handler.
vi.mock('../src/api/templates', async () => {
  const { Router } = await import('express');
  const router = Router();
  router.get('/boom', () => {
    throw new Error('relation "Template" does not exist (secret db detail)');
  });
  return { default: router };
});

import { createApp, parseTrustProxy } from '../src/api/app';

const savedEnv = { NODE_ENV: process.env.NODE_ENV, TRUST_PROXY: process.env.TRUST_PROXY };

afterEach(() => {
  process.env.NODE_ENV = savedEnv.NODE_ENV;
  if (savedEnv.TRUST_PROXY === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = savedEnv.TRUST_PROXY;
});

describe('parseTrustProxy', () => {
  it('defaults to one hop in production and off elsewhere', () => {
    expect(parseTrustProxy(undefined, true)).toBe(1);
    expect(parseTrustProxy('', true)).toBe(1);
    expect(parseTrustProxy(undefined, false)).toBe(false);
  });

  it('honours explicit settings', () => {
    expect(parseTrustProxy('2', true)).toBe(2);
    expect(parseTrustProxy('0', true)).toBe(0);
    expect(parseTrustProxy('true', false)).toBe(true);
    expect(parseTrustProxy('false', true)).toBe(false);
    expect(parseTrustProxy('loopback, 10.0.0.0/8', false)).toBe('loopback, 10.0.0.0/8');
  });

  it('is applied to the app', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TRUST_PROXY;
    expect(createApp().get('trust proxy')).toBe(1);

    process.env.NODE_ENV = 'test';
    expect(createApp().get('trust proxy')).toBe(false);
  });

  it('lets the real client IP through when one proxy hop is trusted', async () => {
    process.env.TRUST_PROXY = '1';
    const app = createApp();
    // Same setting, probed with a tiny app: req.ip must come from X-Forwarded-For.
    const probe = express();
    probe.set('trust proxy', app.get('trust proxy'));
    probe.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });
    const res = await request(probe).get('/ip').set('X-Forwarded-For', '203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
  });
});

describe('createApp', () => {
  it('answers the health check', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('answers unknown API paths with a JSON 404', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('sets security headers', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('reports malformed JSON as a 400, not a 500', async () => {
    const res = await request(createApp())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('reports an oversized body as a 413', async () => {
    const big = JSON.stringify({ file: 'x'.repeat(11 * 1024 * 1024) });
    const res = await request(createApp()).post('/api/auth/login').set('Content-Type', 'application/json').send(big);
    expect(res.status).toBe(413);
  });
});

describe('error handler', () => {
  it('shows the message outside production (useful while developing)', async () => {
    process.env.NODE_ENV = 'test';
    const res = await request(createApp()).get('/api/templates/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('does not exist');
  });

  it('hides internals in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(createApp()).get('/api/templates/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('secret db detail');
  });
});

describe('serving the built SPA in production', () => {
  let dist: string;

  beforeAll(() => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'dealsentry-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>SPA shell</title>');
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log("app")');
  });

  afterAll(() => {
    fs.rmSync(dist, { recursive: true, force: true });
  });

  it('serves static assets and falls back to index.html for client-side routes', async () => {
    process.env.NODE_ENV = 'production';
    const app = createApp({ distPath: dist });

    const asset = await request(app).get('/assets/app.js');
    expect(asset.status).toBe(200);
    expect(asset.text).toContain('console.log');

    const route = await request(app).get('/proposals/abc/review');
    expect(route.status).toBe(200);
    expect(route.text).toContain('SPA shell');
  });

  it('keeps API 404s as JSON rather than serving the shell', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(createApp({ distPath: dist })).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('does not serve the SPA outside production', async () => {
    process.env.NODE_ENV = 'test';
    const res = await request(createApp({ distPath: dist })).get('/proposals');
    expect(res.status).toBe(404);
  });
});
