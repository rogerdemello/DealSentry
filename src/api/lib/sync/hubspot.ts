/**
 * HubSpot connector: imports open deals as proposals, refreshing the access
 * token once when HubSpot answers 401.
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

export const HUBSPOT_DEALS_URL =
  'https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,pipeline,closedate,createdate,hs_lastmodifieddate,description';
const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';

interface HubspotDeal {
  id: string;
  properties: Record<string, string | undefined>;
}

const fetchDeals = (accessToken: string) =>
  fetch(HUBSPOT_DEALS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    signal: timeoutSignal(),
  });

export async function syncHubspot(ctx: SyncContext): Promise<SyncResult> {
  try {
    const credentials = ctx.integration.credentials;
    let accessToken = credentialField(credentials, 'accessToken', 'access_token');
    const refreshToken = credentialField(credentials, 'refreshToken', 'refresh_token');

    if (!accessToken) {
      throw new Error('No access token found. Please reconnect HubSpot.');
    }

    let response = await fetchDeals(accessToken);

    // Expired access token: swap it for a new one using the refresh token.
    if (response.status === 401 && refreshToken) {
      logger.debug('HubSpot access token expired, refreshing...');

      const tokenResponse = await fetch(HUBSPOT_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.HUBSPOT_CLIENT_ID ?? '',
          client_secret: process.env.HUBSPOT_CLIENT_SECRET ?? '',
          refresh_token: refreshToken,
        }),
        signal: timeoutSignal(),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to refresh token. Please reconnect HubSpot.');
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token as string;
      await saveCredentials(ctx.integration.id, {
        ...credentials,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
      });
      logger.debug('HubSpot token refreshed successfully');

      response = await fetchDeals(accessToken);
    }

    if (!response.ok) {
      const hint =
        response.status === 401
          ? ' The access token was rejected (expired or revoked). Please reconnect HubSpot.'
          : '';
      throw new Error(`HubSpot API error: ${response.statusText}.${hint}`);
    }

    const data = (await response.json()) as { results?: HubspotDeal[] };
    const deals = data.results || [];

    if (deals.length === 0) {
      return successResult(0, { message: 'No deals found in HubSpot', dealsProcessed: 0, proposalsCreated: 0 });
    }

    const existing = await importedIds(ctx.userId, 'dealId');
    const newDeals = deals.filter((deal) => !existing.has(String(deal.id)));

    if (newDeals.length === 0) {
      return successResult(0, {
        message: 'No new deals to sync. All deals have already been imported.',
        dealsProcessed: deals.length,
        dealsAlreadyImported: deals.length,
        proposalsCreated: 0,
      });
    }

    const created = await insertProposals(
      newDeals.map((deal) => ({
        id: crypto.randomUUID(),
        title: deal.properties.dealname || 'Untitled Deal',
        content:
          deal.properties.description ||
          `Deal imported from HubSpot\n\nAmount: $${deal.properties.amount || '0'}\nStage: ${deal.properties.dealstage || 'Unknown'}`,
        ...baseProposal(ctx),
        createdAt: deal.properties.createdate || new Date().toISOString(),
        metadata: {
          clientName: deal.properties.dealname,
          dealSize: parseMoney(deal.properties.amount),
          source: 'hubspot',
          dealId: deal.id,
          dealStage: deal.properties.dealstage,
          pipeline: deal.properties.pipeline,
          closeDate: deal.properties.closedate,
          importedAt: new Date().toISOString(),
        },
      }))
    );

    return successResult(created, {
      message: `Successfully synced ${created} new deals from HubSpot`,
      dealsProcessed: deals.length,
      dealsAlreadyImported: deals.length - newDeals.length,
      proposalsCreated: created,
    });
  } catch (err) {
    logger.error('HubSpot sync error:', err);
    return failureResult(err, 'Failed to sync with HubSpot');
  }
}
