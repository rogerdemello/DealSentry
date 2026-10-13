/**
 * Gmail connector: imports recent proposal-related inbox threads as proposals,
 * refreshing the access token once when Google answers 401.
 */

import { logger } from '../logger';
import {
  baseProposal,
  credentialField,
  failureResult,
  importedIds,
  insertProposals,
  saveCredentials,
  successResult,
  timeoutSignal,
  type SyncContext,
  type SyncResult,
} from './common';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Newest messages fetched in full per sync. */
const MAX_MESSAGES = 10;

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate: string;
  snippet?: string;
  payload: GmailPart & { headers: GmailHeader[]; parts?: GmailPart[] };
}

export interface EmailThread {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
}

const decode = (data: string) => Buffer.from(data, 'base64').toString('utf-8');

/** Plain-text body of a message (single-part, or the first text/plain part). */
export function extractBody(payload: GmailMessage['payload']): string {
  if (payload.body?.data) return decode(payload.body.data);
  for (const part of payload.parts || []) {
    if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data);
  }
  return '';
}

/** The figure after "Investment:", else the first dollar amount in the email (0 if none). */
export function extractDealSize(body: string): number {
  const match = body.match(/Investment:?\s*\$?([\d,]+(?:\.\d{2})?)/i) || body.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  return match ? Number.parseFloat(match[1].replace(/,/g, '')) || 0 : 0;
}

/** Display name from a "Name <addr>" header, else the address's local part. */
export function extractClientName(toHeader: string): string {
  const named = toHeader.match(/([^<]+)</);
  return named ? named[1].trim() : toHeader.split('@')[0];
}

const header = (message: GmailMessage, name: string) =>
  message.payload.headers.find((h) => h.name === name)?.value;

export async function syncGmail(ctx: SyncContext): Promise<SyncResult> {
  try {
    const credentials = ctx.integration.credentials;
    let accessToken = credentialField(credentials, 'accessToken', 'access_token');
    const refreshToken = credentialField(credentials, 'refreshToken', 'refresh_token');

    if (!accessToken) {
      throw new Error('No access token found. Please reconnect Gmail in Integrations.');
    }

    // Inbox only, last 30 days, proposal-ish subjects.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const afterDate = Math.floor(thirtyDaysAgo.getTime() / 1000);
    const query = `in:inbox (proposal OR quote OR agreement OR contract) after:${afterDate}`;
    const searchUrl = `${GMAIL_API}?q=${encodeURIComponent(query)}&maxResults=50`;

    const authHeaders = () => ({ Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' });
    let searchResponse = await fetch(searchUrl, { headers: authHeaders(), signal: timeoutSignal() });

    // Expired access token: refresh it (needs a refresh token and the Google client env).
    if (searchResponse.status === 401) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (refreshToken && clientId && clientSecret) {
        logger.debug('Gmail access token expired, refreshing...');
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
          }),
          signal: timeoutSignal(),
        });
        const tokenBody = await tokenResponse.json();

        if (tokenResponse.ok && tokenBody.access_token) {
          accessToken = tokenBody.access_token as string;
          await saveCredentials(ctx.integration.id, {
            ...credentials,
            accessToken: tokenBody.access_token,
            refreshToken: tokenBody.refresh_token ?? refreshToken,
            expiresIn: tokenBody.expires_in,
          });
          logger.debug('Gmail token refreshed successfully');
          searchResponse = await fetch(searchUrl, { headers: authHeaders(), signal: timeoutSignal() });
        } else {
          logger.error('Gmail token refresh failed:', tokenBody.error || tokenResponse.status);
        }
      } else if (!refreshToken) {
        logger.warn('Gmail: no refresh token stored. Disconnect and reconnect Gmail (with prompt=consent) to get one.');
      } else {
        logger.warn('Gmail: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set. Cannot refresh token.');
      }
    }

    if (!searchResponse.ok) {
      const hint =
        searchResponse.status === 401
          ? ' Authorization may have expired or been revoked. Please reconnect Gmail in Integrations.'
          : '';
      throw new Error(`Gmail API error: ${searchResponse.statusText}.${hint}`);
    }

    const searchData = (await searchResponse.json()) as { messages?: Array<{ id: string }> };
    const messages = searchData.messages || [];

    if (messages.length === 0) {
      return successResult(0, {
        message: 'No proposal-related emails found in the last 30 days',
        emailsProcessed: 0,
        emailThreads: [],
      });
    }

    // Fetch the newest messages in full; skip anything that is not actually in the inbox.
    const fetched = await Promise.all(
      messages.slice(0, MAX_MESSAGES).map(async (msg): Promise<EmailThread | null> => {
        const msgResponse = await fetch(`${GMAIL_API}/${msg.id}`, { headers: authHeaders(), signal: timeoutSignal() });
        if (!msgResponse.ok) return null;

        const data = (await msgResponse.json()) as GmailMessage;
        if (!(data.labelIds || []).includes('INBOX')) return null;

        return {
          id: data.id,
          threadId: data.threadId,
          subject: header(data, 'Subject') || 'No Subject',
          from: header(data, 'From') || '',
          to: header(data, 'To') || '',
          date: new Date(Number.parseInt(data.internalDate, 10)).toISOString(),
          snippet: data.snippet || '',
          body: extractBody(data.payload) || data.snippet || '',
        };
      })
    );
    const emails = fetched.filter((e): e is EmailThread => e !== null);

    // The sync log keeps the email's envelope, not its body: bodies can be large
    // and private, and the UI only needs to say what was found.
    const summaries = emails.map(({ body: _body, ...envelope }) => envelope);

    if (emails.length === 0) {
      return successResult(0, {
        message: 'No valid email threads found',
        emailsProcessed: messages.length,
        emailThreads: [],
      });
    }

    const existing = await importedIds(ctx.userId, 'emailThreadId');
    // Several messages can share a thread; import each thread once.
    const seenThreads = new Set<string>();
    const newEmails = emails.filter((email) => {
      if (existing.has(email.threadId) || seenThreads.has(email.threadId)) return false;
      seenThreads.add(email.threadId);
      return true;
    });

    if (newEmails.length === 0) {
      return successResult(0, {
        message: 'No new email threads to sync. All emails have already been imported.',
        emailsProcessed: messages.length,
        emailsAlreadyImported: emails.length,
        proposalsCreated: 0,
        emailThreads: summaries,
      });
    }

    const created = await insertProposals(
      newEmails.map((email) => ({
        id: crypto.randomUUID(),
        title: email.subject || 'Email Proposal',
        content: email.body || email.snippet,
        ...baseProposal(ctx),
        createdAt: email.date,
        metadata: {
          source: 'gmail',
          emailThreadId: email.threadId,
          emailId: email.id,
          from: email.from,
          to: email.to,
          subject: email.subject,
          clientName: extractClientName(email.to),
          dealSize: extractDealSize(email.body),
          importedAt: new Date().toISOString(),
        },
      }))
    );

    return successResult(created, {
      message: `Successfully synced ${created} new email threads as proposals`,
      emailsProcessed: messages.length,
      emailsAlreadyImported: emails.length - newEmails.length,
      proposalsCreated: created,
      emailThreads: summaries,
    });
  } catch (err) {
    logger.error('Gmail sync error:', err);
    return failureResult(err, 'Failed to sync with Gmail');
  }
}
