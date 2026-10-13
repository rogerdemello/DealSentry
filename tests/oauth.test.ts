import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { SupabaseMock } from './helpers/supabaseMock';

vi.mock('../src/lib/supabase', async () => {
  const { createSupabaseMock } = await import('./helpers/supabaseMock');
  const mock = createSupabaseMock();
  return { supabase: mock.client, default: mock.client, __mock: mock };
});

import * as supabaseModule from '../src/lib/supabase';
import oauthRouter from '../src/api/oauth';
import { resetDefaultUser } from '../src/api/middleware/auth';
import { signOAuthStart, signOAuthState, verifyOAuthState } from '../src/api/lib/oauthState';

const sb = (supabaseModule as unknown as { __mock: SupabaseMock }).__mock;
const fetchMock = vi.fn();

const ENV_KEYS = [
  'AUTH_MODE', 'HUBSPOT_DEMO_MODE', 'SALESFORCE_DEMO_MODE', 'GMAIL_DEMO_MODE', 'HUBSPOT_ACCESS_TOKEN',
  'HUBSPOT_CLIENT_ID', 'HUBSPOT_CLIENT_SECRET', 'SALESFORCE_CLIENT_ID', 'SALESFORCE_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
] as const;
let savedEnv: Record<string, string | undefined>;

const ADMIN = { id: 'admin1', email: 'a@b.com', role: 'ADMIN', company_id: null };
const REP = { id: 'rep1', email: 'r@b.com', role: 'SALES_REP', company_id: null };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/oauth', oauthRouter);
  return app;
}

/** Everyone resolves to `user`; `existing` is the Integration row an upsert finds (if any). */
function seed(user: Record<string, unknown> = ADMIN, existing: Record<string, unknown> | null = null) {
  sb.handle((ctx) => {
    if (ctx.table === 'User' && ctx.op === 'select') return { data: ctx.single ? user : [user] };
    if (ctx.table === 'Integration' && ctx.op === 'select') return { data: existing };
    return undefined;
  });
}

const redirect = (res: request.Response) => new URL(res.headers.location, 'http://app.test');
const integrationInsert = () => sb.callsFor('Integration', 'insert').at(-1)?.payload as Record<string, unknown> | undefined;
const tokenResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  sb.reset();
  resetDefaultUser();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.HUBSPOT_CLIENT_ID = 'hs-client';
  process.env.HUBSPOT_CLIENT_SECRET = 'hs-secret';
  process.env.SALESFORCE_CLIENT_ID = 'sf-client';
  process.env.SALESFORCE_CLIENT_SECRET = 'sf-secret';
  process.env.GOOGLE_CLIENT_ID = 'g-client';
  process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('POST /api/oauth/start-token', () => {
  it('issues a short-lived token for the signed-in user', async () => {
    seed(REP);
    const res = await request(buildApp()).post('/api/oauth/start-token');
    expect(res.status).toBe(200);
    const claims = jwt.decode(res.body.token) as { purpose: string; uid: string; exp: number; iat: number };
    expect(claims).toMatchObject({ purpose: 'oauth-start', uid: 'rep1' });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(120);
  });

  it('requires a session in login mode', async () => {
    process.env.AUTH_MODE = 'login';
    seed(REP);
    const res = await request(buildApp()).post('/api/oauth/start-token');
    expect(res.status).toBe(401);
  });
});

describe('authorize redirects', () => {
  it('demo mode, no token: connects the default user (as before)', async () => {
    process.env.HUBSPOT_DEMO_MODE = 'true';
    seed(ADMIN);

    const res = await request(buildApp()).get('/api/oauth/hubspot/authorize');

    expect(res.status).toBe(302);
    expect(redirect(res).searchParams.get('hubspot')).toBe('demo');
    expect(integrationInsert()).toMatchObject({
      type: 'HUBSPOT',
      userId: 'admin1',
      isActive: true,
      credentials: { demo: true },
    });
  });

  it('login mode: refuses a request with no token', async () => {
    process.env.AUTH_MODE = 'login';
    process.env.HUBSPOT_DEMO_MODE = 'true';
    seed(REP);

    const res = await request(buildApp()).get('/api/oauth/hubspot/authorize');

    expect(redirect(res).searchParams.get('error')).toBe('unauthorized');
    expect(sb.callsFor('Integration', 'insert')).toHaveLength(0);
  });

  it('login mode: accepts a start token and connects that user', async () => {
    process.env.AUTH_MODE = 'login';
    process.env.HUBSPOT_DEMO_MODE = 'true';
    seed(REP);

    const res = await request(buildApp()).get(`/api/oauth/hubspot/authorize?token=${signOAuthStart('rep1')}`);

    expect(redirect(res).searchParams.get('hubspot')).toBe('demo');
    expect(integrationInsert()).toMatchObject({ userId: 'rep1' });
  });

  it('login mode: a session token in the URL is not accepted', async () => {
    process.env.AUTH_MODE = 'login';
    process.env.HUBSPOT_DEMO_MODE = 'true';
    seed(REP);
    const session = jwt.sign({ userId: 'rep1' }, process.env.NEXTAUTH_SECRET as string, { expiresIn: '7d' });

    const res = await request(buildApp()).get(`/api/oauth/hubspot/authorize?token=${session}`);

    expect(redirect(res).searchParams.get('error')).toBe('unauthorized');
  });

  it('login mode: an OAuth state token cannot stand in for a start token', async () => {
    process.env.AUTH_MODE = 'login';
    process.env.HUBSPOT_DEMO_MODE = 'true';
    seed(REP);
    const res = await request(buildApp()).get(`/api/oauth/hubspot/authorize?token=${signOAuthState('rep1')}`);
    expect(redirect(res).searchParams.get('error')).toBe('unauthorized');
  });

  it('sends the user to HubSpot with a signed state that identifies them', async () => {
    seed(REP);
    const res = await request(buildApp()).get('/api/oauth/hubspot/authorize');

    const url = redirect(res);
    expect(url.host).toBe('app.hubspot.com');
    expect(url.searchParams.get('client_id')).toBe('hs-client');
    expect(verifyOAuthState(url.searchParams.get('state'))).toBe('rep1');
  });

  it('does the same for Salesforce and Gmail', async () => {
    seed(REP);
    const sf = redirect(await request(buildApp()).get('/api/oauth/salesforce/authorize'));
    expect(sf.host).toBe('login.salesforce.com');
    expect(verifyOAuthState(sf.searchParams.get('state'))).toBe('rep1');

    const gm = redirect(await request(buildApp()).get('/api/oauth/gmail/authorize'));
    expect(gm.host).toBe('accounts.google.com');
    expect(gm.searchParams.get('access_type')).toBe('offline');
    expect(verifyOAuthState(gm.searchParams.get('state'))).toBe('rep1');
  });

  it('reports a missing HubSpot client id', async () => {
    delete process.env.HUBSPOT_CLIENT_ID;
    seed(REP);
    const res = await request(buildApp()).get('/api/oauth/hubspot/authorize');
    expect(redirect(res).searchParams.get('error')).toBe('no_client_id');
  });

  it('reports a database failure instead of claiming success', async () => {
    process.env.GMAIL_DEMO_MODE = 'true';
    seed(REP);
    sb.handle((ctx) => (ctx.table === 'Integration' && ctx.op === 'insert' ? { error: { message: 'db down' } } : undefined));
    const res = await request(buildApp()).get('/api/oauth/gmail/authorize');
    expect(redirect(res).searchParams.get('error')).toBe('integration_save_failed');
    expect(redirect(res).searchParams.get('success')).toBeNull();
  });
});

describe('HubSpot private app token', () => {
  beforeEach(() => {
    process.env.HUBSPOT_ACCESS_TOKEN = 'private-app-token';
  });

  it('connects in demo mode', async () => {
    seed(REP);
    const res = await request(buildApp()).get('/api/oauth/hubspot/authorize');
    expect(redirect(res).searchParams.get('hubspot')).toBe('connected');
    expect(integrationInsert()).toMatchObject({ credentials: { accessToken: 'private-app-token' } });
  });

  it('is admin-only in login mode, since the token is shared company access', async () => {
    process.env.AUTH_MODE = 'login';
    seed(REP);
    const denied = await request(buildApp()).get(`/api/oauth/hubspot/authorize?token=${signOAuthStart('rep1')}`);
    expect(redirect(denied).searchParams.get('error')).toBe('forbidden');
    expect(sb.callsFor('Integration', 'insert')).toHaveLength(0);

    sb.reset();
    seed(ADMIN);
    const allowed = await request(buildApp()).get(`/api/oauth/hubspot/authorize?token=${signOAuthStart('admin1')}`);
    expect(redirect(allowed).searchParams.get('hubspot')).toBe('connected');
  });
});

describe('callbacks', () => {
  it('refuses the old forgeable state (a bare user id) without contacting the provider', async () => {
    seed(REP);
    const res = await request(buildApp()).get('/api/oauth/hubspot/callback?code=abc&state=rep1');
    expect(redirect(res).searchParams.get('error')).toBe('invalid_state');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sb.callsFor('Integration', 'insert')).toHaveLength(0);
  });

  it('refuses a state signed for a different purpose', async () => {
    seed(REP);
    const res = await request(buildApp()).get(`/api/oauth/hubspot/callback?code=abc&state=${signOAuthStart('rep1')}`);
    expect(redirect(res).searchParams.get('error')).toBe('invalid_state');
  });

  it('needs a code', async () => {
    seed(REP);
    const res = await request(buildApp()).get(`/api/oauth/salesforce/callback?state=${signOAuthState('rep1')}`);
    expect(redirect(res).searchParams.get('error')).toBe('no_code');
  });

  it('passes a provider-side denial back to the SPA', async () => {
    seed(REP);
    const res = await request(buildApp()).get('/api/oauth/hubspot/callback?error=access_denied');
    expect(redirect(res).searchParams.get('error')).toBe('access_denied');
  });

  it('HubSpot: exchanges the code and stores the tokens for the user named in the state', async () => {
    seed(REP);
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 1800 }));

    const res = await request(buildApp()).get(`/api/oauth/hubspot/callback?code=the-code&state=${signOAuthState('rep1')}`);

    expect(redirect(res).searchParams.get('hubspot')).toBe('connected');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.hubapi.com/oauth/v1/token');
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1].body));
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_secret')).toBe('hs-secret');
    expect(integrationInsert()).toMatchObject({
      type: 'HUBSPOT',
      userId: 'rep1',
      credentials: { accessToken: 'at', refreshToken: 'rt', expiresIn: 1800 },
    });
  });

  it('reports a failed token exchange without storing anything', async () => {
    seed(REP);
    fetchMock.mockResolvedValueOnce(new Response('bad code', { status: 400 }));
    const res = await request(buildApp()).get(`/api/oauth/hubspot/callback?code=x&state=${signOAuthState('rep1')}`);
    expect(redirect(res).searchParams.get('error')).toBe('token_exchange_failed');
    expect(sb.callsFor('Integration', 'insert')).toHaveLength(0);
  });

  it('reports a provider reply with no access token', async () => {
    seed(REP);
    fetchMock.mockResolvedValueOnce(tokenResponse({ error: 'invalid_grant' }));
    const res = await request(buildApp()).get(`/api/oauth/gmail/callback?code=x&state=${signOAuthState('rep1')}`);
    expect(redirect(res).searchParams.get('error')).toBe('token_exchange_failed');
  });

  it('reuses the newest existing integration instead of adding another copy', async () => {
    seed(REP, { id: 'existing-newest', credentials: { accessToken: 'old' } });
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'new-at', refresh_token: 'new-rt' }));

    await request(buildApp()).get(`/api/oauth/hubspot/callback?code=x&state=${signOAuthState('rep1')}`);

    expect(sb.callsFor('Integration', 'insert')).toHaveLength(0);
    const update = sb.callsFor('Integration', 'update')[0];
    expect(update.filters).toContainEqual(['eq', 'id', 'existing-newest']);
    expect(update.payload).toMatchObject({ isActive: true, credentials: { accessToken: 'new-at' } });
    // The lookup tolerates duplicates: newest first, one row, no .single().
    const lookup = sb.callsFor('Integration', 'select')[0];
    expect(lookup.order?.[0]?.[0]).toBe('createdAt');
    expect(lookup.limit).toBe(1);
  });

  it('keeps the user’s own integration name on reconnect', async () => {
    seed(REP, { id: 'existing', name: 'My HubSpot', credentials: {} });
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'at' }));
    await request(buildApp()).get(`/api/oauth/hubspot/callback?code=x&state=${signOAuthState('rep1')}`);
    expect(sb.callsFor('Integration', 'update')[0].payload).not.toHaveProperty('name');
  });

  it('Gmail: keeps the stored refresh token when Google does not send a new one', async () => {
    seed(REP, { id: 'g1', credentials: { accessToken: 'old', refreshToken: 'keep-me' } });
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'fresh', expires_in: 3600 }));

    const res = await request(buildApp()).get(`/api/oauth/gmail/callback?code=x&state=${signOAuthState('rep1')}`);

    expect(redirect(res).searchParams.get('gmail')).toBe('connected');
    expect(sb.callsFor('Integration', 'update')[0].payload).toMatchObject({
      credentials: { accessToken: 'fresh', refreshToken: 'keep-me' },
    });
  });

  it('Salesforce: stores the instance URL it was given', async () => {
    seed(REP);
    fetchMock.mockResolvedValueOnce(
      tokenResponse({ access_token: 'at', refresh_token: 'rt', instance_url: 'https://acme.my.salesforce.com' })
    );

    const res = await request(buildApp()).get(`/api/oauth/salesforce/callback?code=x&state=${signOAuthState('rep1')}`);

    expect(redirect(res).searchParams.get('salesforce')).toBe('connected');
    expect(integrationInsert()).toMatchObject({
      type: 'SALESFORCE',
      credentials: { instanceUrl: 'https://acme.my.salesforce.com', accessToken: 'at' },
    });
  });

  it('turns an unexpected exception into an error redirect', async () => {
    seed(REP);
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const res = await request(buildApp()).get(`/api/oauth/salesforce/callback?code=x&state=${signOAuthState('rep1')}`);
    expect(redirect(res).searchParams.get('error')).toBe('oauth_failed');
  });
});
