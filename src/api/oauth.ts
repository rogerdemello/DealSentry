import { Router, Request, Response, NextFunction } from 'express';
import { loadUserById, requireAuth, resolveSessionUser } from './middleware/auth';
import { isLoginMode } from './lib/authConfig';
import { upsertIntegration, type OAuthProvider } from './lib/integrationStore';
import { signOAuthStart, signOAuthState, verifyOAuthStart, verifyOAuthState } from './lib/oauthState';
import { logger } from './lib/logger';

const router = Router();

// Frontend URL for OAuth redirects
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

const redirectToIntegrations = (res: Response, query: string) =>
  res.redirect(`${FRONTEND_URL}/integrations?${query}`);

// The SPA calls this (with its normal Authorization header) just before it
// navigates the browser to an /authorize endpoint, which cannot carry a header.
// The token is good for two minutes and only for the /authorize redirects.
router.post('/start-token', requireAuth, (req: Request, res: Response) => {
  res.json({ token: signOAuthStart(req.user!.id) });
});

/**
 * Auth for the /authorize redirects (top-level browser navigations, so no header).
 * The identity is a short-lived start token from POST /start-token. In demo mode —
 * where there are no sessions — a request without one is served as the default
 * user, as before. In login mode a start token is required.
 */
const requireAuthFromQuery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : undefined;

    const startUserId = verifyOAuthStart(token);
    let user = startUserId ? (await loadUserById(startUserId)).user : null;

    if (!user && !isLoginMode()) {
      user = (await resolveSessionUser(token)).user;
    }

    if (!user) {
      return redirectToIntegrations(res, 'error=unauthorized');
    }
    req.user = user;
    next();
  } catch (error) {
    logger.error('OAuth session lookup failed', error as Error);
    return redirectToIntegrations(res, 'error=unauthorized');
  }
};

/** Store (or refresh) the connection, or redirect with an error. Returns true on success. */
async function saveConnection(
  res: Response,
  opts: Parameters<typeof upsertIntegration>[0]
): Promise<boolean> {
  try {
    await upsertIntegration(opts);
    return true;
  } catch (err) {
    logger.error(`Failed to save ${opts.type} integration:`, err);
    redirectToIntegrations(res, 'error=integration_save_failed');
    return false;
  }
}

const DEMO_CREDENTIALS = { demo: true, accessToken: 'demo_token' };

/** Demo-mode connect: store `{demo: true}` credentials and return to the SPA. */
async function connectDemo(res: Response, userId: string, type: OAuthProvider, name: string, param: string) {
  const saved = await saveConnection(res, {
    userId,
    type,
    name,
    credentials: () => DEMO_CREDENTIALS,
    resetName: true,
  });
  if (saved) redirectToIntegrations(res, `${param}=demo&success=true`);
}

/** The fields of an OAuth token response this app uses. */
interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  instance_url?: string;
}

/** POST to a provider's token endpoint with the authorization code. */
async function exchangeCode(
  tokenUrl: string,
  params: Record<string, string>,
  provider: string
): Promise<TokenResponse | null> {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    logger.error(`${provider} token exchange failed:`, response.status, await response.text());
    return null;
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Salesforce
// ---------------------------------------------------------------------------

const salesforceBase = () =>
  process.env.SALESFORCE_SANDBOX === 'true' ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
const salesforceRedirectUri = () =>
  process.env.SALESFORCE_REDIRECT_URI || 'http://localhost:3001/api/oauth/salesforce/callback';

router.get('/salesforce/authorize', requireAuthFromQuery, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return redirectToIntegrations(res, 'error=not_authenticated');
  }

  if (process.env.SALESFORCE_DEMO_MODE === 'true') {
    return connectDemo(res, userId, 'SALESFORCE', 'Salesforce', 'salesforce');
  }

  const authUrl =
    `${salesforceBase()}/services/oauth2/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(process.env.SALESFORCE_CLIENT_ID ?? '')}` +
    `&redirect_uri=${encodeURIComponent(salesforceRedirectUri())}` +
    `&scope=api%20refresh_token&state=${encodeURIComponent(signOAuthState(userId))}`;
  res.redirect(authUrl);
});

router.get('/salesforce/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return redirectToIntegrations(res, 'error=no_code');
    }
    const userId = verifyOAuthState(state);
    if (!userId) {
      return redirectToIntegrations(res, 'error=invalid_state');
    }

    const data = await exchangeCode(
      `${salesforceBase()}/services/oauth2/token`,
      {
        grant_type: 'authorization_code',
        code: code as string,
        client_id: process.env.SALESFORCE_CLIENT_ID ?? '',
        client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? '',
        redirect_uri: salesforceRedirectUri(),
      },
      'Salesforce'
    );

    if (!data?.access_token) {
      return redirectToIntegrations(res, 'error=token_exchange_failed');
    }

    const saved = await saveConnection(res, {
      userId,
      type: 'SALESFORCE',
      name: 'Salesforce',
      credentials: () => ({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        instanceUrl: data.instance_url,
      }),
    });
    if (saved) redirectToIntegrations(res, 'salesforce=connected&success=true');
  } catch (error) {
    logger.error('Salesforce OAuth error:', error);
    redirectToIntegrations(res, 'error=oauth_failed');
  }
});

// ---------------------------------------------------------------------------
// HubSpot
// ---------------------------------------------------------------------------

const hubspotRedirectUri = () =>
  process.env.HUBSPOT_REDIRECT_URI || 'http://localhost:3001/api/oauth/hubspot/callback';

router.get('/hubspot/authorize', requireAuthFromQuery, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return redirectToIntegrations(res, 'error=not_authenticated');
  }

  if (process.env.HUBSPOT_DEMO_MODE === 'true') {
    return connectDemo(res, userId, 'HUBSPOT', 'HubSpot', 'hubspot');
  }

  // Private App: one server-wide access token instead of per-user OAuth. In
  // login mode that token is shared company access, so only admins may attach it.
  const privateAppToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (privateAppToken) {
    if (isLoginMode() && req.user?.role !== 'ADMIN') {
      return redirectToIntegrations(res, 'error=forbidden');
    }
    const saved = await saveConnection(res, {
      userId,
      type: 'HUBSPOT',
      name: 'HubSpot',
      credentials: () => ({ accessToken: privateAppToken }),
    });
    if (saved) redirectToIntegrations(res, 'hubspot=connected&success=true&type=private');
    return;
  }

  // OAuth flow for Public Apps
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) {
    return redirectToIntegrations(res, 'error=no_client_id');
  }

  const scopes = 'crm.objects.contacts.read crm.objects.deals.read';
  const authUrl =
    `https://app.hubspot.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(hubspotRedirectUri())}` +
    `&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(signOAuthState(userId))}`;
  res.redirect(authUrl);
});

router.get('/hubspot/callback', async (req: Request, res: Response) => {
  try {
    const { code, error: hubspotError, state } = req.query;

    if (hubspotError) {
      logger.error('HubSpot OAuth denied or error:', hubspotError);
      return redirectToIntegrations(res, `error=${encodeURIComponent(String(hubspotError))}`);
    }
    if (!code) {
      return redirectToIntegrations(res, 'error=no_code');
    }
    const userId = verifyOAuthState(state);
    if (!userId) {
      return redirectToIntegrations(res, 'error=invalid_state');
    }

    const data = await exchangeCode(
      'https://api.hubapi.com/oauth/v1/token',
      {
        grant_type: 'authorization_code',
        code: code as string,
        client_id: process.env.HUBSPOT_CLIENT_ID ?? '',
        client_secret: process.env.HUBSPOT_CLIENT_SECRET ?? '',
        redirect_uri: hubspotRedirectUri(),
      },
      'HubSpot'
    );

    if (!data?.access_token) {
      return redirectToIntegrations(res, 'error=token_exchange_failed');
    }

    const saved = await saveConnection(res, {
      userId,
      type: 'HUBSPOT',
      name: 'HubSpot',
      credentials: () => ({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      }),
    });
    if (saved) redirectToIntegrations(res, 'hubspot=connected&success=true');
  } catch (error) {
    logger.error('HubSpot OAuth error:', error);
    redirectToIntegrations(res, 'error=oauth_failed');
  }
});

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

const gmailRedirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/oauth/gmail/callback';

router.get('/gmail/authorize', requireAuthFromQuery, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return redirectToIntegrations(res, 'error=unauthorized');
  }

  if (process.env.GMAIL_DEMO_MODE === 'true') {
    return connectDemo(res, userId, 'GMAIL', 'Gmail', 'gmail');
  }

  const scopes = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(process.env.GOOGLE_CLIENT_ID ?? '')}` +
    `&redirect_uri=${encodeURIComponent(gmailRedirectUri())}&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent` +
    `&state=${encodeURIComponent(signOAuthState(userId))}`;
  res.redirect(authUrl);
});

router.get('/gmail/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return redirectToIntegrations(res, 'error=no_code');
    }
    const userId = verifyOAuthState(state);
    if (!userId) {
      return redirectToIntegrations(res, 'error=invalid_state');
    }

    const data = await exchangeCode(
      'https://oauth2.googleapis.com/token',
      {
        grant_type: 'authorization_code',
        code: code as string,
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: gmailRedirectUri(),
      },
      'Gmail'
    );

    if (!data?.access_token) {
      return redirectToIntegrations(res, 'error=token_exchange_failed');
    }

    const saved = await saveConnection(res, {
      userId,
      type: 'GMAIL',
      name: 'Gmail',
      // Google only sends a refresh token on first consent; keep the one we already have.
      credentials: (existing) => ({
        accessToken: data.access_token,
        refreshToken: data.refresh_token || existing.refreshToken || existing.refresh_token,
        expiresIn: data.expires_in,
      }),
    });
    if (saved) redirectToIntegrations(res, 'gmail=connected&success=true');
  } catch (error) {
    logger.error('Gmail OAuth error:', error);
    redirectToIntegrations(res, 'error=oauth_failed');
  }
});

export default router;
