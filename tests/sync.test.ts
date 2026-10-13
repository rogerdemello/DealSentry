import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseMock } from './helpers/supabaseMock';

vi.mock('../src/lib/supabase', async () => {
  const { createSupabaseMock } = await import('./helpers/supabaseMock');
  const mock = createSupabaseMock();
  return { supabase: mock.client, default: mock.client, __mock: mock };
});

import * as supabaseModule from '../src/lib/supabase';
import { runSync } from '../src/api/lib/sync';
import type { SyncContext } from '../src/api/lib/sync';
import { sampleDeals } from '../src/api/lib/sync/demo';
import { extractBody, extractClientName, extractDealSize } from '../src/api/lib/sync/gmail';
import { isSalesforceUrl } from '../src/api/lib/sync/salesforce';

const sb = (supabaseModule as unknown as { __mock: SupabaseMock }).__mock;
const fetchMock = vi.fn();

const ENV_KEYS = ['HUBSPOT_CLIENT_ID', 'HUBSPOT_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SALESFORCE_CLIENT_ID', 'SALESFORCE_CLIENT_SECRET'] as const;
let savedEnv: Record<string, string | undefined>;

const ctx = (type: string, credentials: Record<string, unknown> | null, over: Partial<SyncContext> = {}): SyncContext => ({
  integration: { id: 'int1', type, name: type, userId: 'owner1', credentials },
  userId: 'owner1',
  companyId: null,
  ...over,
});

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

/** Make Proposal inserts succeed (echoing the rows) and report which ids were imported earlier. */
function seedDb(opts: { imported?: Array<Record<string, unknown>>; insertError?: string } = {}) {
  sb.handle((c) => {
    if (c.table === 'Proposal' && c.op === 'select') {
      return { data: (opts.imported ?? []).map((metadata) => ({ metadata })) };
    }
    if (c.table === 'Proposal' && c.op === 'insert') {
      return opts.insertError ? { error: { message: opts.insertError } } : { data: c.payload };
    }
    return undefined;
  });
}

/** A proposal row as the connectors insert it (only the fields these tests read). */
interface ImportedProposal {
  title: string;
  userId: string;
  status: string;
  company_id?: string;
  createdAt?: string;
  metadata: Record<string, unknown>;
}

const insertedProposals = () => sb.callsFor('Proposal', 'insert').flatMap((c) => c.payload as ImportedProposal[]);

beforeEach(() => {
  sb.reset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.HUBSPOT_CLIENT_ID = 'hs-id';
  process.env.HUBSPOT_CLIENT_SECRET = 'hs-secret';
  process.env.GOOGLE_CLIENT_ID = 'g-id';
  process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
  process.env.SALESFORCE_CLIENT_ID = 'sf-id';
  process.env.SALESFORCE_CLIENT_SECRET = 'sf-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('runSync dispatch', () => {
  it('records the attempt for types without a connector', async () => {
    const result = await runSync(ctx('DOCUSIGN', { accessToken: 'x' }));
    expect(result).toMatchObject({ failed: false, recordsAffected: 0, details: { message: 'Manual sync triggered' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records the attempt when a known type has no credentials', async () => {
    const result = await runSync(ctx('HUBSPOT', null));
    expect(result.details.message).toBe('Manual sync triggered');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('demo sync', () => {
  const demoCtx = (over: Partial<SyncContext> = {}) => ctx('SALESFORCE', { demo: true, accessToken: 'demo_token' }, over);

  it('imports the sample deals for the integration owner, not whoever is first in the User table', async () => {
    seedDb();
    const result = await runSync(demoCtx({ userId: 'owner1', companyId: 'c1' }));

    expect(result).toMatchObject({ failed: false, recordsAffected: 3 });
    const rows = insertedProposals();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({ userId: 'owner1', company_id: 'c1', status: 'PENDING' });
    }
    expect(rows[0].metadata).toMatchObject({ source: 'salesforce-demo', dealId: 'demo-salesforce-001' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not re-import deals this user already has', async () => {
    seedDb({ imported: sampleDeals('salesforce').slice(0, 2).map((d) => ({ dealId: d.id })) });
    const result = await runSync(demoCtx());
    expect(result.recordsAffected).toBe(1);
    expect(insertedProposals().map((r) => r.metadata.dealId)).toEqual(['demo-salesforce-003']);
  });

  it('says so when everything is already imported', async () => {
    seedDb({ imported: sampleDeals('salesforce').map((d) => ({ dealId: d.id })) });
    const result = await runSync(demoCtx());
    expect(result).toMatchObject({ failed: false, recordsAffected: 0 });
    expect(result.details.message).toMatch(/already imported/);
    expect(sb.callsFor('Proposal', 'insert')).toHaveLength(0);
  });

  it('scopes the "already imported" lookup to the owner', async () => {
    seedDb();
    await runSync(demoCtx({ userId: 'owner1' }));
    const lookup = sb.callsFor('Proposal', 'select')[0];
    expect(lookup.filters).toContainEqual(['eq', 'userId', 'owner1']);
  });

  it('reports a failed insert', async () => {
    seedDb({ insertError: 'permission denied' });
    const result = await runSync(demoCtx());
    expect(result).toMatchObject({ failed: true, deactivate: false });
    expect(result.details.error).toBe('permission denied');
  });
});

describe('HubSpot sync', () => {
  const hs = (credentials: Record<string, unknown> | null = { accessToken: 'tok', refreshToken: 'ref' }, over: Partial<SyncContext> = {}) =>
    ctx('HUBSPOT', credentials, over);
  const deal = (id: string, props: Record<string, string> = {}) => ({
    id,
    properties: { dealname: `Deal ${id}`, amount: '50000', dealstage: 'qualified', createdate: '2026-01-02T00:00:00Z', ...props },
  });

  it('imports new deals as the owner, inheriting the company', async () => {
    seedDb();
    fetchMock.mockResolvedValueOnce(
      json({ results: [deal('1'), deal('2', { amount: 'n/a' }), deal('3', { amount: '9,500.50' })] })
    );

    const result = await runSync(hs({ accessToken: 'tok' }, { companyId: 'c1' }));

    expect(result).toMatchObject({ failed: false, recordsAffected: 3 });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    const rows = insertedProposals();
    expect(rows[0]).toMatchObject({
      title: 'Deal 1',
      userId: 'owner1',
      company_id: 'c1',
      createdAt: '2026-01-02T00:00:00Z',
      metadata: { source: 'hubspot', dealId: '1', dealSize: 50000 },
    });
    // Unparseable amounts become 0 (never NaN); formatted ones are read in full.
    expect(rows[1].metadata.dealSize).toBe(0);
    expect(rows[2].metadata.dealSize).toBe(9500.5);
  });

  it('skips deals already imported by this user', async () => {
    seedDb({ imported: [{ dealId: '1' }] });
    fetchMock.mockResolvedValueOnce(json({ results: [deal('1'), deal('2')] }));

    const result = await runSync(hs());

    expect(result.recordsAffected).toBe(1);
    expect(result.details).toMatchObject({ dealsProcessed: 2, dealsAlreadyImported: 1 });
    expect(insertedProposals().map((r) => r.metadata.dealId)).toEqual(['2']);
  });

  it('handles an empty account and an up-to-date re-sync', async () => {
    seedDb();
    fetchMock.mockResolvedValueOnce(json({ results: [] }));
    expect((await runSync(hs())).details.message).toBe('No deals found in HubSpot');

    seedDb({ imported: [{ dealId: '1' }] });
    fetchMock.mockResolvedValueOnce(json({ results: [deal('1')] }));
    const again = await runSync(hs());
    expect(again).toMatchObject({ failed: false, recordsAffected: 0 });
    expect(again.details.message).toMatch(/No new deals/);
  });

  it('fails and asks for a reconnect when there is no access token', async () => {
    const result = await runSync(hs({ refreshToken: 'ref' }));
    expect(result).toMatchObject({ failed: true, deactivate: true });
    expect(result.details.error).toMatch(/No access token/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes an expired token, stores it, and retries', async () => {
    seedDb();
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401, statusText: 'Unauthorized' }))
      .mockResolvedValueOnce(json({ access_token: 'new-tok', refresh_token: 'new-ref', expires_in: 1800 }))
      .mockResolvedValueOnce(json({ results: [deal('1')] }));

    const result = await runSync(hs());

    expect(result).toMatchObject({ failed: false, recordsAffected: 1 });
    expect(fetchMock.mock.calls[1][0]).toContain('oauth/v1/token');
    expect(String(fetchMock.mock.calls[1][1].body)).toContain('grant_type=refresh_token');
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new-tok');
    expect(sb.callsFor('Integration', 'update')[0].payload).toMatchObject({
      credentials: { accessToken: 'new-tok', refreshToken: 'new-ref', expiresIn: 1800 },
    });
  });

  it('asks for a reconnect when the refresh itself is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 400 }));

    const result = await runSync(hs());

    expect(result).toMatchObject({ failed: true, deactivate: true });
    expect(result.details.error).toMatch(/reconnect HubSpot/);
  });

  it('asks for a reconnect on a 401 when there is no refresh token to try', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401, statusText: 'Unauthorized' }));
    const result = await runSync(hs({ accessToken: 'tok' }));
    expect(result).toMatchObject({ failed: true, deactivate: true });
  });

  it('keeps the connection on a transient server error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503, statusText: 'Service Unavailable' }));
    const result = await runSync(hs());
    expect(result).toMatchObject({ failed: true, deactivate: false });
    expect(result.details.error).toMatch(/Service Unavailable/);
  });

  it('turns a network failure or timeout into a failed result instead of throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));
    const result = await runSync(hs());
    expect(result).toMatchObject({ failed: true, deactivate: false });
    expect(result.details.error).toMatch(/timeout/);
  });

  it('attaches a timeout signal to every request', async () => {
    seedDb();
    fetchMock.mockResolvedValueOnce(json({ results: [] }));
    await runSync(hs());
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('Gmail sync', () => {
  const gm = (credentials: Record<string, unknown> | null = { accessToken: 'tok', refreshToken: 'ref' }, over: Partial<SyncContext> = {}) =>
    ctx('GMAIL', credentials, over);

  const b64 = (text: string) => Buffer.from(text).toString('base64url');
  const message = (id: string, threadId: string, over: Record<string, unknown> = {}) => ({
    id,
    threadId,
    labelIds: ['INBOX'],
    internalDate: String(Date.UTC(2026, 0, 5)),
    snippet: `snippet ${id}`,
    payload: {
      headers: [
        { name: 'Subject', value: `Proposal ${id}` },
        { name: 'From', value: 'Pat <pat@seller.com>' },
        { name: 'To', value: 'Dana Buyer <dana@acme.com>' },
      ],
      body: { data: b64(`Hello.\nInvestment: $12,500.00\nThanks`) },
    },
    ...over,
  });

  /** Search returns `ids`; each message fetch returns the matching entry. */
  function mockInbox(messages: Array<ReturnType<typeof message>>) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/messages?q=')) return json({ messages: messages.map((m) => ({ id: m.id })) });
      const found = messages.find((m) => url.endsWith(`/messages/${m.id}`));
      return found ? json(found) : new Response('', { status: 404 });
    });
  }

  it('imports each new thread once, as the owner, with the company and parsed details', async () => {
    seedDb();
    mockInbox([message('m1', 't1'), message('m2', 't1'), message('m3', 't2')]);

    const result = await runSync(gm(undefined, { companyId: 'c1' }));

    expect(result).toMatchObject({ failed: false, recordsAffected: 2 });
    const rows = insertedProposals();
    expect(rows.map((r) => r.metadata.emailThreadId)).toEqual(['t1', 't2']);
    expect(rows[0]).toMatchObject({
      title: 'Proposal m1',
      userId: 'owner1',
      company_id: 'c1',
      metadata: { source: 'gmail', clientName: 'Dana Buyer', dealSize: 12500 },
    });
  });

  it('does not put email bodies in the sync log details', async () => {
    seedDb();
    mockInbox([message('m1', 't1')]);

    const result = await runSync(gm());

    const threads = result.details.emailThreads as Array<Record<string, unknown>>;
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ subject: 'Proposal m1', from: 'Pat <pat@seller.com>' });
    expect(threads[0]).not.toHaveProperty('body');
    expect(JSON.stringify(result.details)).not.toContain('Investment');
  });

  it('skips messages that are not in the inbox and threads already imported', async () => {
    seedDb({ imported: [{ emailThreadId: 't1' }] });
    mockInbox([message('m1', 't1'), message('m2', 't2', { labelIds: ['SENT'] }), message('m3', 't3')]);

    const result = await runSync(gm());

    expect(insertedProposals().map((r) => r.metadata.emailThreadId)).toEqual(['t3']);
    expect(result.details).toMatchObject({ emailsProcessed: 3, emailsAlreadyImported: 1 });
  });

  it('reports an empty inbox', async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    const result = await runSync(gm());
    expect(result).toMatchObject({ failed: false, recordsAffected: 0 });
    expect(result.details.message).toMatch(/No proposal-related emails/);
  });

  it('fails with a reconnect request when there is no access token', async () => {
    const result = await runSync(gm({ refreshToken: 'ref' }));
    expect(result).toMatchObject({ failed: true, deactivate: true });
  });

  it('refreshes an expired token and retries the search', async () => {
    seedDb();
    const msg = message('m1', 't1');
    let searches = 0;
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url.includes('oauth2.googleapis.com/token')) return json({ access_token: 'fresh', expires_in: 3600 });
      if (url.includes('/messages?q=')) {
        searches++;
        return searches === 1 ? new Response('', { status: 401, statusText: 'Unauthorized' }) : json({ messages: [{ id: 'm1' }] });
      }
      return init?.method === 'POST' ? new Response('', { status: 500 }) : json(msg);
    });

    const result = await runSync(gm());

    expect(result).toMatchObject({ failed: false, recordsAffected: 1 });
    // A refresh response without a new refresh token keeps the old one.
    expect(sb.callsFor('Integration', 'update')[0].payload).toMatchObject({
      credentials: { accessToken: 'fresh', refreshToken: 'ref' },
    });
  });

  it('asks for a reconnect when it cannot refresh', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401, statusText: 'Unauthorized' }));
    const result = await runSync(gm({ accessToken: 'tok' })); // no refresh token
    expect(result).toMatchObject({ failed: true, deactivate: true });
    expect(result.details.error).toMatch(/reconnect Gmail/i);
  });

  describe('parsing helpers', () => {
    it('reads a single-part body and a multipart text/plain body', () => {
      expect(extractBody({ headers: [], body: { data: b64('single') } })).toBe('single');
      expect(
        extractBody({
          headers: [],
          parts: [
            { mimeType: 'text/html', body: { data: b64('<b>html</b>') } },
            { mimeType: 'text/plain', body: { data: b64('plain') } },
          ],
        })
      ).toBe('plain');
      expect(extractBody({ headers: [] })).toBe('');
    });

    it('finds the deal size after "Investment" or falls back to the first dollar figure', () => {
      expect(extractDealSize('Investment: $1,200')).toBe(1200);
      expect(extractDealSize('We charge $3,400.50 in total')).toBe(3400.5);
      expect(extractDealSize('no figures here')).toBe(0);
    });

    it('takes the client name from the To header', () => {
      expect(extractClientName('Dana Buyer <dana@acme.com>')).toBe('Dana Buyer');
      expect(extractClientName('dana@acme.com')).toBe('dana');
    });
  });
});

describe('Salesforce sync', () => {
  const sfCreds = { accessToken: 'tok', refreshToken: 'ref', instanceUrl: 'https://acme.my.salesforce.com' };
  const sf = (credentials: Record<string, unknown> | null = sfCreds, over: Partial<SyncContext> = {}) =>
    ctx('SALESFORCE', credentials, over);
  const opp = (id: string, over: Record<string, unknown> = {}) => ({
    Id: id,
    Name: `Opportunity ${id}`,
    Amount: 75000,
    StageName: 'Negotiation',
    CloseDate: '2026-06-30',
    Account: { Name: 'Acme' },
    CreatedDate: '2026-01-03T00:00:00Z',
    ...over,
  });

  describe('isSalesforceUrl', () => {
    it('accepts https Salesforce org URLs', () => {
      for (const url of [
        'https://na1.salesforce.com',
        'https://acme.my.salesforce.com',
        'https://acme--sandbox.sandbox.my.salesforce.com',
        'https://acme.my.site.force.com',
        'https://org.cloudforce.com',
        'https://salesforce.com',
      ]) {
        expect(isSalesforceUrl(url), url).toBe(true);
      }
    });

    it('rejects everything else, including look-alikes and internal addresses', () => {
      for (const url of [
        'http://acme.my.salesforce.com', // not https
        'https://salesforce.com.evil.example',
        'https://evilsalesforce.com',
        'https://evil.example/?x=.salesforce.com',
        'https://user:pw@acme.my.salesforce.com',
        'https://169.254.169.254',
        'http://localhost:3001',
        'https://localhost',
        'not a url',
        '',
      ]) {
        expect(isSalesforceUrl(url), url).toBe(false);
      }
    });
  });

  it('imports opportunities as the owner — there is no hard-coded fallback user', async () => {
    seedDb();
    fetchMock.mockResolvedValueOnce(json({ records: [opp('006A'), opp('006B', { Amount: null })] }));

    const result = await runSync(sf(sfCreds, { companyId: 'c9' }));

    expect(result).toMatchObject({ failed: false, recordsAffected: 2 });
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/acme\.my\.salesforce\.com\/services\/data\/v60\.0\/query\?q=/);
    const rows = insertedProposals();
    expect(rows[0]).toMatchObject({
      title: 'Opportunity 006A',
      userId: 'owner1',
      company_id: 'c9',
      metadata: { source: 'salesforce', opportunityId: '006A', dealSize: 75000, clientName: 'Acme' },
    });
    expect(rows[1].metadata.dealSize).toBe(0);
  });

  it('never calls a stored instance URL that is not a Salesforce address', async () => {
    const result = await runSync(sf({ ...sfCreds, instanceUrl: 'http://169.254.169.254/latest/meta-data' }));
    expect(result).toMatchObject({ failed: true, deactivate: true });
    expect(result.details.error).toMatch(/not a Salesforce address/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires an instance URL and an access token', async () => {
    expect((await runSync(sf({ accessToken: 'tok' }))).details.error).toMatch(/No instance URL/);
    expect((await runSync(sf({ instanceUrl: sfCreds.instanceUrl }))).details.error).toMatch(/No access token/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips opportunities already imported', async () => {
    seedDb({ imported: [{ opportunityId: '006A' }] });
    fetchMock.mockResolvedValueOnce(json({ records: [opp('006A'), opp('006B')] }));
    const result = await runSync(sf());
    expect(insertedProposals().map((r) => r.metadata.opportunityId)).toEqual(['006B']);
    expect(result.details).toMatchObject({ opportunitiesProcessed: 2, opportunitiesAlreadyImported: 1 });
  });

  it('refreshes an expired token, keeping the validated instance URL', async () => {
    seedDb();
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(json({ access_token: 'fresh', instance_url: 'https://acme2.my.salesforce.com' }))
      .mockResolvedValueOnce(json({ records: [opp('006A')] }));

    const result = await runSync(sf());

    expect(result).toMatchObject({ failed: false, recordsAffected: 1 });
    expect(fetchMock.mock.calls[2][0]).toContain('https://acme2.my.salesforce.com');
    expect(sb.callsFor('Integration', 'update')[0].payload).toMatchObject({
      credentials: { accessToken: 'fresh', refreshToken: 'ref', instanceUrl: 'https://acme2.my.salesforce.com' },
    });
  });

  it('refuses a refreshed instance URL that points somewhere else', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(json({ access_token: 'fresh', instance_url: 'https://evil.example' }));

    const result = await runSync(sf());

    expect(result).toMatchObject({ failed: true });
    expect(fetchMock).toHaveBeenCalledTimes(2); // no query was sent to evil.example
  });

  it('uses the sandbox login host to refresh when SALESFORCE_SANDBOX=true', async () => {
    process.env.SALESFORCE_SANDBOX = 'true';
    try {
      fetchMock
        .mockResolvedValueOnce(new Response('', { status: 401 }))
        .mockResolvedValueOnce(new Response('{}', { status: 400 }));
      const result = await runSync(sf());
      expect(fetchMock.mock.calls[1][0]).toBe('https://test.salesforce.com/services/oauth2/token');
      expect(result).toMatchObject({ failed: true, deactivate: true });
    } finally {
      delete process.env.SALESFORCE_SANDBOX;
    }
  });

  it('reports no open opportunities', async () => {
    fetchMock.mockResolvedValueOnce(json({ records: [] }));
    const result = await runSync(sf());
    expect(result.details.message).toBe('No open opportunities found in Salesforce');
  });
});
