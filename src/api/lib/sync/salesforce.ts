/**
 * Salesforce connector: imports open opportunities as proposals, refreshing the
 * access token once when Salesforce answers 401.
 */

import { logger } from '../logger';
import {
  baseProposal,
  credentialField,
  failureResult,
  importedIds,
  insertProposals,
  parseMoney,
  saveCredentials,
  successResult,
  timeoutSignal,
  type SyncContext,
  type SyncResult,
} from './common';

/** Salesforce API version used for queries. */
const API_VERSION = 'v60.0';

const QUERY =
  'SELECT Id, Name, Amount, StageName, CloseDate, Description, Account.Name, CreatedDate, LastModifiedDate ' +
  'FROM Opportunity WHERE IsClosed = false ORDER BY LastModifiedDate DESC LIMIT 100';

/** Domains Salesforce serves orgs from (instance, My Domain, sandbox, Government Cloud). */
const SALESFORCE_DOMAINS = ['salesforce.com', 'force.com', 'cloudforce.com', 'salesforce.mil'];

/**
 * Whether `url` is an https Salesforce org URL. The instance URL is stored in
 * credentials that users can edit, and the server calls it with the user's token
 * attached — without this check it would be a server-side request forgery vector
 * (e.g. pointing it at http://169.254.169.254 or an internal service).
 */
export function isSalesforceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    return SALESFORCE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

interface Opportunity {
  Id: string;
  Name?: string;
  Amount?: number | null;
  StageName?: string;
  CloseDate?: string;
  Description?: string;
  CreatedDate?: string;
  Account?: { Name?: string } | null;
}

export async function syncSalesforce(ctx: SyncContext): Promise<SyncResult> {
  try {
    const credentials = ctx.integration.credentials;
    let accessToken = credentialField(credentials, 'accessToken', 'access_token');
    const refreshToken = credentialField(credentials, 'refreshToken', 'refresh_token');
    let instanceUrl = credentialField(credentials, 'instanceUrl', 'instance_url');

    if (!accessToken) {
      throw new Error('No access token found. Please reconnect Salesforce.');
    }
    if (!instanceUrl) {
      throw new Error('No instance URL found. Please reconnect Salesforce.');
    }
    if (!isSalesforceUrl(instanceUrl)) {
      throw new Error('The stored Salesforce instance URL is not a Salesforce address. Please reconnect Salesforce.');
    }

    const queryUrl = (base: string) => `${base}/services/data/${API_VERSION}/query?q=${encodeURIComponent(QUERY)}`;
    const authHeaders = () => ({ Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' });

    let response = await fetch(queryUrl(instanceUrl), { headers: authHeaders(), signal: timeoutSignal() });

    // Expired access token: swap it for a new one using the refresh token.
    if (response.status === 401 && refreshToken) {
      const isSandbox = process.env.SALESFORCE_SANDBOX === 'true';
      const loginHost = isSandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com';

      logger.debug('Salesforce access token expired, refreshing...');
      const tokenResponse = await fetch(`${loginHost}/services/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.SALESFORCE_CLIENT_ID ?? '',
          client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? '',
        }),
        signal: timeoutSignal(),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to refresh token. Please reconnect Salesforce.');
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token as string;
      const newInstanceUrl: string = tokenData.instance_url || instanceUrl;
      if (!isSalesforceUrl(newInstanceUrl)) {
        throw new Error('Salesforce returned an unexpected instance URL. Please reconnect Salesforce.');
      }
      instanceUrl = newInstanceUrl;

      await saveCredentials(ctx.integration.id, {
        ...credentials,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? refreshToken,
        expiresIn: tokenData.expires_in,
        instanceUrl,
      });
      logger.debug('Salesforce token refreshed successfully');

      response = await fetch(queryUrl(instanceUrl), { headers: authHeaders(), signal: timeoutSignal() });
    }

    if (!response.ok) {
      const hint =
        response.status === 401
          ? ' Authorization may have expired or been revoked. Please reconnect Salesforce.'
          : '';
      throw new Error(`Salesforce API error: ${response.statusText}.${hint}`);
    }

    const data = (await response.json()) as { records?: Opportunity[] };
    const opportunities = data.records || [];

    if (opportunities.length === 0) {
      return successResult(0, {
        message: 'No open opportunities found in Salesforce',
        opportunitiesProcessed: 0,
        proposalsCreated: 0,
      });
    }

    const existing = await importedIds(ctx.userId, 'opportunityId');
    const fresh = opportunities.filter((opp) => !existing.has(String(opp.Id)));

    if (fresh.length === 0) {
      return successResult(0, {
        message: 'No new opportunities to sync. All opportunities have already been imported.',
        opportunitiesProcessed: opportunities.length,
        opportunitiesAlreadyImported: opportunities.length,
        proposalsCreated: 0,
      });
    }

    const created = await insertProposals(
      fresh.map((opp) => ({
        id: crypto.randomUUID(),
        title: opp.Name || 'Untitled Opportunity',
        content:
          opp.Description ||
          `Opportunity imported from Salesforce\n\nAmount: $${opp.Amount || '0'}\nStage: ${opp.StageName || 'Unknown'}\nAccount: ${opp.Account?.Name || 'N/A'}`,
        ...baseProposal(ctx),
        createdAt: opp.CreatedDate || new Date().toISOString(),
        metadata: {
          clientName: opp.Account?.Name || opp.Name,
          dealSize: parseMoney(opp.Amount),
          source: 'salesforce',
          opportunityId: opp.Id,
          stageName: opp.StageName,
          closeDate: opp.CloseDate,
          accountName: opp.Account?.Name,
          importedAt: new Date().toISOString(),
        },
      }))
    );

    return successResult(created, {
      message: `Successfully synced ${created} new opportunities from Salesforce`,
      opportunitiesProcessed: opportunities.length,
      opportunitiesAlreadyImported: opportunities.length - fresh.length,
      proposalsCreated: created,
    });
  } catch (err) {
    logger.error('Salesforce sync error:', err);
    return failureResult(err, 'Failed to sync with Salesforce');
  }
}
