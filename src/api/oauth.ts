import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// Frontend URL for OAuth redirects
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// Salesforce OAuth flow
router.get('/salesforce/authorize', async (req: Request, res: Response) => {
  const isDemoMode = process.env.SALESFORCE_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    try {
      const { data: existing } = await supabase
        .from('Integration')
        .select('*')
        .eq('type', 'SALESFORCE')
        .single();

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
  
  const state = (req.query.state as string) || '';
  const baseUrl = isSandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
  let authUrl = `${baseUrl}/services/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=api%20refresh_token`;
  if (state) authUrl += `&state=${encodeURIComponent(state)}`;
  res.redirect(authUrl);
});

router.get('/salesforce/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.redirect(`${FRONTEND_URL}/integrations?error=no_code`);
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
    const companyId = (req.query.state as string) || null;

    if (data.access_token) {
      try {
        const credentials = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in,
          instanceUrl: data.instance_url,
        };

        const payload: Record<string, unknown> = {
          credentials,
          isActive: true,
          updatedAt: new Date().toISOString(),
        };
        if (companyId) payload.company_id = companyId;

        const { data: existingList } = await supabase
          .from('Integration')
          .select('id, company_id')
          .eq('type', 'SALESFORCE')
          .limit(20);
        const existing = (existingList || []).find(
          (r: { company_id?: string }) => (r.company_id === companyId) || (!companyId && !r.company_id)
        );

        if (existing) {
          await supabase
            .from('Integration')
            .update(payload)
            .eq('id', existing.id);
        } else {
          await supabase.from('Integration').insert({
            id: (crypto as any).randomUUID(),
            type: 'SALESFORCE',
            name: 'Salesforce',
            credentials,
            config: {},
            isActive: true,
            updatedAt: new Date().toISOString(),
            ...(companyId ? { company_id: companyId } : {}),
          } as Record<string, unknown>);
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
router.get('/hubspot/authorize', async (req: Request, res: Response) => {
  const isDemoMode = process.env.HUBSPOT_DEMO_MODE === 'true';

  if (isDemoMode) {
    try {
      const { data: existing } = await supabase
        .from('Integration')
        .select('*')
        .eq('type', 'HUBSPOT')
        .single();

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
        .single();

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
          updatedAt: new Date().toISOString(),
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
  const state = (req.query.state as string) || '';
  const scopes = 'crm.objects.contacts.read crm.objects.deals.read';
  let authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
  if (state) authUrl += `&state=${encodeURIComponent(state)}`;
  res.redirect(authUrl);
});

router.get('/hubspot/callback', async (req: Request, res: Response) => {
  try {
    const { code, error: hubspotError } = req.query;

    if (hubspotError) {
      console.error('HubSpot OAuth denied or error:', hubspotError);
      return res.redirect(`${FRONTEND_URL}/integrations?error=${encodeURIComponent(String(hubspotError))}`);
    }

    if (!code) {
      return res.redirect(`${FRONTEND_URL}/integrations?error=no_code`);
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
    
    const companyId = (req.query.state as string) || null;

    if (data.access_token) {
      try {
        const credentials = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in,
        };
        const payload: Record<string, unknown> = { credentials, isActive: true, updatedAt: new Date().toISOString() };
        if (companyId) payload.company_id = companyId;

        // Use select('*') so missing company_id column does not break the query
        const { data: existingList } = await supabase
          .from('Integration')
          .select('*')
          .eq('type', 'HUBSPOT')
          .limit(20);
        
        // Find matching integrations (same company_id, or both null)
        const matching = (existingList || []).filter(
          (r: { company_id?: string }) => (r.company_id === companyId) || (!companyId && r.company_id == null)
        );
        
        const existing = matching[0]; // Use first match as primary

        if (existing) {
          console.log(`Found ${matching.length} existing HubSpot integration(s), updating primary:`, existing.id);
          
          // Update the primary integration
          const { data: updated, error: updateError } = await supabase
            .from('Integration')
            .update(payload)
            .eq('id', existing.id)
            .select()
            .single();
          if (updateError) throw updateError;
          console.log('HubSpot integration updated:', {
            id: updated?.id,
            type: updated?.type,
            isActive: updated?.isActive,
            hasCredentials: !!(updated?.credentials && Object.keys(updated?.credentials || {}).length > 0),
          });
          
          // Deactivate duplicates (if any)
          if (matching.length > 1) {
            const duplicateIds = matching.slice(1).map((r: any) => r.id);
            console.log(`Deactivating ${duplicateIds.length} duplicate HubSpot integration(s):`, duplicateIds);
            await supabase
              .from('Integration')
              .update({ isActive: false, updatedAt: new Date().toISOString() })
              .in('id', duplicateIds);
          }
        } else {
          const insertPayload: Record<string, unknown> = {
            id: (crypto as any).randomUUID(),
            type: 'HUBSPOT',
            name: 'HubSpot',
            credentials,
            config: {},
            isActive: true,
            updatedAt: new Date().toISOString(),
          };
          if (companyId) insertPayload.company_id = companyId;

          console.log('Inserting new HubSpot integration:', {
            type: insertPayload.type,
            isActive: insertPayload.isActive,
            hasCredentials: !!(insertPayload.credentials && Object.keys(insertPayload.credentials as any || {}).length > 0),
            companyId: insertPayload.company_id || 'null',
          });

          const { data: inserted, error: insertError } = await supabase
            .from('Integration')
            .insert(insertPayload)
            .select()
            .single();
          
          if (insertError && insertError.message?.includes('company_id')) {
            console.log('Retrying insert without company_id...');
            delete insertPayload.company_id;
            const { data: retryInserted, error: retryError } = await supabase
              .from('Integration')
              .insert(insertPayload)
              .select()
              .single();
            if (retryError) throw retryError;
            console.log('HubSpot integration inserted (without company_id):', {
              id: retryInserted?.id,
              type: retryInserted?.type,
              isActive: retryInserted?.isActive,
            });
          } else if (insertError) {
            throw insertError;
          } else {
            console.log('HubSpot integration inserted:', {
              id: inserted?.id,
              type: inserted?.type,
              isActive: inserted?.isActive,
            });
          }
        }
      } catch (err) {
        console.error('Failed to upsert HubSpot integration after OAuth:', err);
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
router.get('/gmail/authorize', async (req: Request, res: Response) => {
  const isDemoMode = process.env.GMAIL_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    try {
      const { data: existing } = await supabase
        .from('Integration')
        .select('*')
        .eq('type', 'GMAIL')
        .single();

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
  const state = (req.query.state as string) || '';
  const scopes = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';
  let authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
  if (state) authUrl += `&state=${encodeURIComponent(state)}`;
  res.redirect(authUrl);
});

router.get('/gmail/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.redirect(`${FRONTEND_URL}/integrations?error=no_code`);
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
    const companyId = (req.query.state as string) || null;

    if (data.access_token) {
      try {
        const { data: existingList } = await supabase
          .from('Integration')
          .select('*')
          .eq('type', 'GMAIL')
          .limit(20);
        const existing = (existingList || []).find(
          (r: { company_id?: string }) => r.company_id === companyId || (!companyId && !r.company_id)
        );

        const prevCreds = (existing?.credentials || {}) as Record<string, unknown>;
        const credentials = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || prevCreds.refreshToken || prevCreds.refresh_token,
          expiresIn: data.expires_in,
        };
        const payload: Record<string, unknown> = { credentials, isActive: true, updatedAt: new Date().toISOString() };
        if (companyId) payload.company_id = companyId;

        if (existing) {
          await supabase.from('Integration').update(payload).eq('id', existing.id);
        } else {
          await supabase.from('Integration').insert({
            id: (crypto as any).randomUUID(),
            type: 'GMAIL',
            name: 'Gmail',
            credentials,
            config: {},
            isActive: true,
            updatedAt: new Date().toISOString(),
            ...(companyId ? { company_id: companyId } : {}),
          } as Record<string, unknown>);
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
