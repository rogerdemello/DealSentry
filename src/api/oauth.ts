import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { resolveSessionUser } from './middleware/auth';
import { logger } from './lib/logger';

const router = Router();

// Frontend URL for OAuth redirects
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

/**
 * Auth for OAuth redirects. These are top-level browser navigations, so no
 * Authorization header is available — the token (when there is one) rides in the
 * query string. With login removed there usually isn't one, and the request
 * falls back to the default user, same as every other route.
 */
const requireAuthFromQuery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = await resolveSessionUser(req.query.token as string | undefined);
    if (!user) {
      return res.redirect(`${FRONTEND_URL}/integrations?error=unauthorized`);
    }
    req.user = user;
    next();
  } catch (error) {
    logger.error('OAuth session lookup failed', error as Error);
    return res.redirect(`${FRONTEND_URL}/integrations?error=unauthorized`);
  }
};

// Salesforce OAuth flow
router.get('/salesforce/authorize', requireAuthFromQuery, async (req: Request, res: Response) => {
  const isDemoMode = process.env.SALESFORCE_DEMO_MODE === 'true';
  const userId = req.user?.id;

  if (!userId) {
    return res.redirect(`${FRONTEND_URL}/integrations?error=not_authenticated`);
  }
  
  if (isDemoMode) {
    try {
      const { data: existing } = await supabase
        .from('Integration')
        .select('*')
        .eq('type', 'SALESFORCE')
        .eq('userId', userId)
        // Tolerate duplicate rows from before this upsert existed: .single()
        // errors on >1 rows, which made every reconnect insert another copy.
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();

      const credentials = { demo: true, accessToken: 'demo_token' };

      if (existing) {
        await supabase
          .from('Integration')
          .update({ 
            name: 'Salesforce',
            credentials, 
            isActive: true, 
            updatedAt: new Date().toISOString() 
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('Integration').insert({
          id: (crypto as any).randomUUID(),
          type: 'SALESFORCE',
          name: 'Salesforce',
          credentials,
          config: {},
          isActive: true,
          userId: userId,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Failed to create Salesforce demo integration:', err);
    }

    res.redirect(`${FRONTEND_URL}/integrations?salesforce=demo&success=true`);
    return;
  }

  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const redirectUri = process.env.SALESFORCE_REDIRECT_URI || 'http://localhost:3001/api/oauth/salesforce/callback';
  const isSandbox = process.env.SALESFORCE_SANDBOX === 'true';
  
  const state = userId; // Use userId as state to identify the user on callback
  const baseUrl = isSandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
  let authUrl = `${baseUrl}/services/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=api%20refresh_token`;
  if (state) authUrl += `&state=${encodeURIComponent(state)}`;
  res.redirect(authUrl);
});

router.get('/salesforce/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.redirect(`${FRONTEND_URL}/integrations?error=no_code`);
    }

    const userId = state as string; // userId passed from authorize
    if (!userId) {
      return res.redirect(`${FRONTEND_URL}/integrations?error=not_authenticated`);
    }

    // Exchange code for token
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
    const redirectUri = process.env.SALESFORCE_REDIRECT_URI || 'http://localhost:3001/api/oauth/salesforce/callback';
    const isSandbox = process.env.SALESFORCE_SANDBOX === 'true';
    
    const baseUrl = isSandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
    const tokenUrl = `${baseUrl}/services/oauth2/token`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Salesforce token exchange failed:', errorText);
      return res.redirect(`${FRONTEND_URL}/integrations?error=token_exchange_failed`);
    }

    const data = await response.json();

    if (data.access_token) {
      try {
        const credentials = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in,
          instanceUrl: data.instance_url,
        };

        const { data: existing } = await supabase
          .from('Integration')
          .select('id')
          .eq('type', 'SALESFORCE')
          .eq('userId', userId)
          .order('createdAt', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('Integration')
            .update({
              credentials,
              isActive: true,
              updatedAt: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('Integration').insert({
            id: (crypto as any).randomUUID(),
            type: 'SALESFORCE',
            name: 'Salesforce',
            credentials,
            config: {},
            isActive: true,
            userId: userId,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Failed to upsert Salesforce integration:', err);
      }

      res.redirect(`${FRONTEND_URL}/integrations?salesforce=connected&success=true`);
    } else {
      res.redirect(`${FRONTEND_URL}/integrations?error=token_exchange_failed`);
    }
  } catch (error) {
    console.error('Salesforce OAuth error:', error);
    res.redirect(`${FRONTEND_URL}/integrations?error=oauth_failed`);
  }
});

// HubSpot OAuth flow
router.get('/hubspot/authorize', requireAuthFromQuery, async (req: Request, res: Response) => {
  const isDemoMode = process.env.HUBSPOT_DEMO_MODE === 'true';
  const userId = req.user?.id;

  if (!userId) {
    return res.redirect(`${FRONTEND_URL}/integrations?error=not_authenticated`);
  }
  
  if (isDemoMode) {
    try {
      const { data: existing } = await supabase
        .from('Integration')
        .select('*')
        .eq('type', 'HUBSPOT')
        .eq('userId', userId)
        // Tolerate duplicate rows from before this upsert existed: .single()
        // errors on >1 rows, which made every reconnect insert another copy.
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();

      const credentials = { demo: true, accessToken: 'demo_token' };

      if (existing) {
        await supabase
          .from('Integration')
          .update({ 
            name: 'HubSpot',
            credentials, 
            isActive: true, 
            updatedAt: new Date().toISOString() 
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('Integration').insert({
          id: (crypto as any).randomUUID(),
          type: 'HUBSPOT',
          name: 'HubSpot',
          credentials,
          config: {},
          isActive: true,
          userId: userId,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Failed to create HubSpot demo integration:', err);
    }

    res.redirect(`${FRONTEND_URL}/integrations?hubspot=demo&success=true`);
    return;
  }

  // Check if using Private App (access token) instead of OAuth
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (accessToken) {
    try {
      // Upsert Integration record into Supabase
      const { data: existing } = await supabase
        .from('Integration')
        .select('*')
        .eq('type', 'HUBSPOT')
        .eq('userId', userId)
        // Tolerate duplicate rows from before this upsert existed: .single()
        // errors on >1 rows, which made every reconnect insert another copy.
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('Integration')
          .update({ credentials: { accessToken }, isActive: true, updatedAt: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase.from('Integration').insert({
          id: (crypto as any).randomUUID(),
          type: 'HUBSPOT',
          name: 'HubSpot',
          credentials: { accessToken },
          config: {},
          isActive: true,
          userId: userId,
        });
      }
    } catch (err) {
      console.error('Failed to upsert HubSpot integration:', err);
    }

    // Private App - directly mark as connected
    res.redirect(`${FRONTEND_URL}/integrations?hubspot=connected&success=true&type=private`);
    return;
  }

  // OAuth flow for Public Apps
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) {
    res.redirect(`${FRONTEND_URL}/integrations?error=no_client_id`);
    return;
  }

  const redirectUri = process.env.HUBSPOT_REDIRECT_URI || 'http://localhost:3001/api/oauth/hubspot/callback';
  const state = userId; // Use userId as state
  const scopes = 'crm.objects.contacts.read crm.objects.deals.read';
  let authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
  if (state) authUrl += `&state=${encodeURIComponent(state)}`;
  res.redirect(authUrl);
});

router.get('/hubspot/callback', async (req: Request, res: Response) => {
  try {
    const { code, error: hubspotError, state } = req.query;

    if (hubspotError) {
      console.error('HubSpot OAuth denied or error:', hubspotError);
      return res.redirect(`${FRONTEND_URL}/integrations?error=${encodeURIComponent(String(hubspotError))}`);
    }

    if (!code) {
      return res.redirect(`${FRONTEND_URL}/integrations?error=no_code`);
    }

    const userId = state as string;
    if (!userId) {
      return res.redirect(`${FRONTEND_URL}/integrations?error=not_authenticated`);
    }
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI || 'http://localhost:3001/api/oauth/hubspot/callback';
    
    const tokenUrl = 'https://api.hubapi.com/oauth/v1/token';
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HubSpot token exchange failed:', errorText);
      return res.redirect(`${FRONTEND_URL}/integrations?error=token_exchange_failed`);
    }

    const data = await response.json();

    if (data.access_token) {
      try {
        const credentials = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in,
        };

        const { data: existing } = await supabase
          .from('Integration')
          .select('*')
          .eq('type', 'HUBSPOT')
          .eq('userId', userId)
          .order('createdAt', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          logger.debug('Updating existing HubSpot integration:', existing.id);
          
          const { error: updateError } = await supabase
            .from('Integration')
            .update({
              credentials,
              isActive: true,
              updatedAt: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .select()
            .single();
          
          if (updateError) throw updateError;
          logger.debug('HubSpot integration updated successfully');
        } else {
          logger.debug('Creating new HubSpot integration for user:', userId);
          
          await supabase.from('Integration').insert({
            id: (crypto as any).randomUUID(),
            type: 'HUBSPOT',
            name: 'HubSpot',
            credentials,
            config: {},
            isActive: true,
            userId: userId,
            updatedAt: new Date().toISOString(),
          });
          
          logger.debug('HubSpot integration created successfully');
        }
      } catch (err) {
        console.error('Failed to upsert HubSpot integration:', err);
        return res.redirect(`${FRONTEND_URL}/integrations?error=hubspot_save_failed`);
      }

      res.redirect(`${FRONTEND_URL}/integrations?hubspot=connected&success=true`);
    } else {
      res.redirect(`${FRONTEND_URL}/integrations?error=token_exchange_failed`);
    }
  } catch (error) {
    console.error('HubSpot OAuth error:', error);
    res.redirect(`${FRONTEND_URL}/integrations?error=oauth_failed`);
  }
});

// Gmail OAuth flow
router.get('/gmail/authorize', requireAuthFromQuery, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.redirect(`${FRONTEND_URL}/integrations?error=unauthorized`);
  }

  const isDemoMode = process.env.GMAIL_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    try {
      const { data: existing } = await supabase
        .from('Integration')
        .select('*')
        .eq('type', 'GMAIL')
        .eq('userId', userId)
        // Tolerate duplicate rows from before this upsert existed: .single()
        // errors on >1 rows, which made every reconnect insert another copy.
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();

      const credentials = { demo: true, accessToken: 'demo_token' };

      if (existing) {
        await supabase
          .from('Integration')
          .update({ 
            name: 'Gmail',
            credentials, 
            isActive: true, 
            updatedAt: new Date().toISOString() 
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('Integration').insert({
          id: (crypto as any).randomUUID(),
          type: 'GMAIL',
          name: 'Gmail',
          userId,
          credentials,
          config: {},
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Failed to create Gmail demo integration:', err);
    }

    res.redirect(`${FRONTEND_URL}/integrations?gmail=demo&success=true`);
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/oauth/gmail/callback';
  const scopes = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${encodeURIComponent(userId)}`;
  res.redirect(authUrl);
});

router.get('/gmail/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    const userId = state as string;
    
    if (!code) {
      return res.redirect(`${FRONTEND_URL}/integrations?error=no_code`);
    }

    if (!userId) {
      return res.redirect(`${FRONTEND_URL}/integrations?error=unauthorized`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/oauth/gmail/callback';
    
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gmail token exchange failed:', errorText);
      return res.redirect(`${FRONTEND_URL}/integrations?error=token_exchange_failed`);
    }

    const data = await response.json();

    if (data.access_token) {
      try {
        const { data: existing } = await supabase
          .from('Integration')
          .select('*')
          .eq('type', 'GMAIL')
          .eq('userId', userId)
          .order('createdAt', { ascending: false })
          .limit(1)
          .maybeSingle();

        const prevCreds = (existing?.credentials || {}) as Record<string, unknown>;
        const credentials = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || prevCreds.refreshToken || prevCreds.refresh_token,
          expiresIn: data.expires_in,
        };

        if (existing) {
          await supabase
            .from('Integration')
            .update({ 
              credentials, 
              isActive: true, 
              updatedAt: new Date().toISOString() 
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('Integration').insert({
            id: (crypto as any).randomUUID(),
            type: 'GMAIL',
            name: 'Gmail',
            userId,
            credentials,
            config: {},
            isActive: true,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Failed to upsert Gmail integration:', err);
      }

      res.redirect(`${FRONTEND_URL}/integrations?gmail=connected&success=true`);
    } else {
      res.redirect(`${FRONTEND_URL}/integrations?error=token_exchange_failed`);
    }
  } catch (error) {
    console.error('Gmail OAuth error:', error);
    res.redirect(`${FRONTEND_URL}/integrations?error=oauth_failed`);
  }
});

export default router;
