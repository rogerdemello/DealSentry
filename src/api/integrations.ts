import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, isAdmin, canAccessCompany } from './middleware/auth';
import { logger } from './lib/logger';

const router = Router();

// GET all integrations (only show current user's integrations)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Fetch only integrations belonging to the current user
    const { data: integrations, error } = await supabase
      .from('Integration')
      .select('*, SyncLog(*)')
      .eq('userId', userId)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    logger.debug('GET /api/integrations - Returning:', {
      userId,
      count: integrations?.length || 0,
      integrations: integrations?.map((i: any) => ({
        id: i.id,
        type: i.type,
        name: i.name,
        isActive: i.isActive,
      })),
    });

    res.json(integrations || []);
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

// GET single integration (must belong to current user)
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { data: integration, error } = await supabase
      .from('Integration')
      .select('*, SyncLog(*)')
      .eq('id', id)
      .eq('userId', userId)
      .single();

    if (error) throw error;
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    res.json(integration);
  } catch (error) {
    console.error('Error fetching integration:', error);
    res.status(500).json({ error: 'Failed to fetch integration' });
  }
});

// POST create integration (creates for current user)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { type, name, credentials, config } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!type || !name) {
      return res.status(400).json({ error: 'Type and name are required' });
    }

    const { data: integration, error } = await supabase
      .from('Integration')
      .insert({
        id: crypto.randomUUID(),
        type,
        name,
        credentials: credentials || {},
        config: config || {},
        isActive: true,
        userId: userId,
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(integration);
  } catch (error) {
    console.error('Error creating integration:', error);
    res.status(500).json({ error: 'Failed to create integration' });
  }
});

// PATCH update integration (must belong to current user)
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, credentials, config, isActive } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Verify the integration belongs to the current user
    const { data: existing } = await supabase
      .from('Integration')
      .select('userId')
      .eq('id', id)
      .single();

    if (!existing || existing.userId !== userId) {
      return res.status(403).json({ error: 'You do not have access to this integration' });
    }

    const updates: any = { updatedAt: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (credentials !== undefined) updates.credentials = credentials;
    if (config !== undefined) updates.config = config;
    if (isActive !== undefined) updates.isActive = isActive;

    const { data: integration, error } = await supabase
      .from('Integration')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    res.json(integration);
  } catch (error) {
    console.error('Error updating integration:', error);
    res.status(500).json({ error: 'Failed to update integration' });
  }
});

// DELETE integration (must belong to current user)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Verify the integration belongs to the current user
    const { data: existing } = await supabase
      .from('Integration')
      .select('userId')
      .eq('id', id)
      .single();

    if (!existing || existing.userId !== userId) {
      return res.status(403).json({ error: 'You do not have access to this integration' });
    }

    const { error } = await supabase
      .from('Integration')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting integration:', error);
    res.status(500).json({ error: 'Failed to delete integration' });
  }
});

// POST trigger sync for integration (must belong to current user)
router.post('/:id/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    // Imported proposals inherit the integration owner's company for tenant scoping.
    const intCompanyId = req.user?.companyId ?? null;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { data: integration, error: intError } = await supabase
      .from('Integration')
      .select('*')
      .eq('id', id)
      .eq('userId', userId)
      .single();

    if (intError || !integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    let recordsAffected = 0;
    let syncDetails: any = { message: 'Manual sync triggered' };

    // Perform actual sync based on integration type
    if (integration.type === 'HUBSPOT' && integration.credentials) {
      try {
        // Fetch deals from HubSpot API directly
        const credentials = integration.credentials as any;
        let accessToken = credentials?.accessToken || credentials?.access_token;
        const refreshToken = credentials?.refreshToken || credentials?.refresh_token;

        if (!accessToken) {
          throw new Error('No access token found');
        }

        // Try API call
        let response = await fetch(
          'https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,pipeline,closedate,createdate,hs_lastmodifieddate,description',
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // If unauthorized and we have a refresh token, try to refresh
        if (response.status === 401 && refreshToken) {
          logger.debug('Access token expired, refreshing...');
          
          const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              client_id: process.env.HUBSPOT_CLIENT_ID!,
              client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
              refresh_token: refreshToken,
            }),
          });

          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            accessToken = tokenData.access_token;

            // Update credentials in database
            await supabase
              .from('Integration')
              .update({
                credentials: {
                  ...credentials,
                  accessToken: tokenData.access_token,
                  refreshToken: tokenData.refresh_token,
                  expiresIn: tokenData.expires_in,
                },
                updatedAt: new Date().toISOString(),
              })
              .eq('id', id);

            logger.debug('Token refreshed successfully');

            // Retry the API call with new token
            response = await fetch(
              'https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,pipeline,closedate,createdate,hs_lastmodifieddate,description',
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
          } else {
            throw new Error('Failed to refresh token. Please reconnect HubSpot.');
          }
        }

        if (!response.ok) {
          throw new Error(`HubSpot API error: ${response.statusText}`);
        }

        const data = await response.json();
        const deals = data.results || [];
        
        if (deals.length > 0) {
          // Check which deals already exist
          const { data: existingProposals } = await supabase
            .from('Proposal')
            .select('metadata')
            .not('metadata->dealId', 'is', null);

          const existingDealIds = new Set(
            (existingProposals || []).map((p: any) => p.metadata?.dealId).filter(Boolean)
          );

          // Only import new deals
          const newDeals = deals.filter((deal: any) => !existingDealIds.has(deal.id));

          if (newDeals.length > 0) {
            // Use the first available user
            const { data: users } = await supabase.from('User').select('id').limit(1);
            const defaultUserId = users?.[0]?.id;
            
            if (!defaultUserId) {
              throw new Error('No users found in database. Please seed the database first.');
            }

            const proposals = newDeals.map((deal: any) => ({
              id: crypto.randomUUID(),
              title: deal.properties.dealname || 'Untitled Deal',
              content: deal.properties.description || `Deal imported from HubSpot\n\nAmount: $${deal.properties.amount || '0'}\nStage: ${deal.properties.dealstage || 'Unknown'}`,
              status: 'PENDING' as const,
              userId: defaultUserId,
              lockedSections: [],
              createdAt: deal.properties.createdate || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              ...(intCompanyId ? { company_id: intCompanyId } : {}),
              metadata: {
                clientName: deal.properties.dealname,
                dealSize: parseFloat(deal.properties.amount || '0'),
                source: 'hubspot',
                dealId: deal.id,
                dealStage: deal.properties.dealstage,
                pipeline: deal.properties.pipeline,
                closeDate: deal.properties.closedate,
                importedAt: new Date().toISOString()
              }
            }));

            const { data: insertedProposals, error: insertError } = await supabase
              .from('Proposal')
              .insert(proposals)
              .select();

            if (insertError) {
              console.error('Error inserting proposals:', insertError);
              throw insertError;
            }

            recordsAffected = insertedProposals?.length || 0;
            syncDetails = {
              message: `Successfully synced ${recordsAffected} new deals from HubSpot`,
              dealsProcessed: deals.length,
              dealsAlreadyImported: deals.length - newDeals.length,
              proposalsCreated: recordsAffected
            };
          } else {
            syncDetails = {
              message: 'No new deals to sync. All deals have already been imported.',
              dealsProcessed: deals.length,
              dealsAlreadyImported: deals.length,
              proposalsCreated: 0
            };
          }
        } else {
          syncDetails = {
            message: 'No deals found in HubSpot',
            dealsProcessed: 0,
            proposalsCreated: 0
          };
        }
      } catch (syncError: any) {
        console.error('HubSpot sync error:', syncError);
        
        // If credentials are missing or invalid, mark integration as inactive
        if (syncError.message?.includes('No access token') || 
            syncError.message?.includes('expired') || 
            syncError.message?.includes('revoked')) {
          await supabase
            .from('Integration')
            .update({ 
              isActive: false,
              updatedAt: new Date().toISOString(),
            })
            .eq('id', id);
        }
        
        syncDetails = {
          error: syncError.message || 'Failed to sync with HubSpot',
          message: 'Sync failed'
        };
      }
    } else if (integration.type === 'GMAIL' && integration.credentials) {
      try {
        const credentials = integration.credentials as any;
        let accessToken = credentials?.accessToken || credentials?.access_token;
        const refreshToken = credentials?.refreshToken || credentials?.refresh_token;

        if (!accessToken) {
          throw new Error('No access token found. Please reconnect Gmail in Integrations.');
        }

        // Search for proposal-related emails in INBOX only (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const afterDate = Math.floor(thirtyDaysAgo.getTime() / 1000);

        const query = `in:inbox (proposal OR quote OR agreement OR contract) after:${afterDate}`;

        const gmailHeaders = () => ({
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        });

        let searchResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
          { headers: gmailHeaders() }
        );

        // If unauthorized, try to refresh the token (requires refresh_token + env vars)
        if (searchResponse.status === 401) {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          if (refreshToken && clientId && clientSecret) {
            logger.debug('Gmail access token expired, refreshing...');
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
              }),
            });

            const tokenBody = await tokenResponse.json();

            if (tokenResponse.ok && tokenBody.access_token) {
              accessToken = tokenBody.access_token;
              await supabase
                .from('Integration')
                .update({
                  credentials: {
                    ...credentials,
                    accessToken: tokenBody.access_token,
                    refreshToken: tokenBody.refresh_token ?? refreshToken,
                    expiresIn: tokenBody.expires_in,
                  },
                  updatedAt: new Date().toISOString(),
                })
                .eq('id', id);
              logger.debug('Gmail token refreshed successfully');
              searchResponse = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
                { headers: gmailHeaders() }
              );
            } else {
              console.error('Gmail token refresh failed:', tokenBody.error || tokenResponse.status, tokenBody);
            }
          } else if (!refreshToken) {
            console.warn('Gmail: No refresh token stored. User must disconnect and reconnect Gmail (with prompt=consent) to get one.');
          } else if (!clientId || !clientSecret) {
            console.warn('Gmail: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set. Cannot refresh token.');
          }
        }

        if (!searchResponse.ok) {
          const hint = searchResponse.status === 401
            ? ' Authorization may have expired or been revoked. Please reconnect Gmail in Integrations.'
            : '';
          throw new Error(`Gmail API error: ${searchResponse.statusText}.${hint}`);
        }

        const searchData = await searchResponse.json();
        const messages = searchData.messages || [];

        if (messages.length > 0) {
          // Fetch full message details for each email
          const emailThreads = await Promise.all(
            messages.slice(0, 10).map(async (msg: any) => { // Limit to 10 most recent
              const msgResponse = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  }
                }
              );

              if (msgResponse.ok) {
                const msgData = await msgResponse.json();
                // Only import messages that are actually in the inbox
                const labelIds = msgData.labelIds || [];
                if (!labelIds.includes('INBOX')) {
                  return null;
                }
                const headers = msgData.payload.headers;
                
                // Extract email body
                let body = '';
                if (msgData.payload.body?.data) {
                  body = Buffer.from(msgData.payload.body.data, 'base64').toString('utf-8');
                } else if (msgData.payload.parts) {
                  for (const part of msgData.payload.parts) {
                    if (part.mimeType === 'text/plain' && part.body?.data) {
                      body = Buffer.from(part.body.data, 'base64').toString('utf-8');
                      break;
                    }
                  }
                }
                
                return {
                  id: msgData.id,
                  threadId: msgData.threadId,
                  subject: headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject',
                  from: headers.find((h: any) => h.name === 'From')?.value || '',
                  to: headers.find((h: any) => h.name === 'To')?.value || '',
                  date: new Date(parseInt(msgData.internalDate)).toISOString(),
                  snippet: msgData.snippet,
                  body: body || msgData.snippet,
                };
              }
              return null;
            })
          );

          const validEmails = emailThreads.filter(e => e !== null);

          if (validEmails.length > 0) {
            // Check which email threads already exist as proposals
            const { data: existingProposals } = await supabase
              .from('Proposal')
              .select('metadata')
              .not('metadata->emailThreadId', 'is', null);

            const existingThreadIds = new Set(
              (existingProposals || []).map((p: any) => p.metadata?.emailThreadId).filter(Boolean)
            );

            // Only import new email threads
            const newEmails = validEmails.filter((email: any) => !existingThreadIds.has(email.threadId));

            if (newEmails.length > 0) {
              // Get the first available user
              const { data: users } = await supabase.from('User').select('id').limit(1);
              const defaultUserId = users?.[0]?.id;
              
              if (!defaultUserId) {
                throw new Error('No users found in database. Please seed the database first.');
              }

              // Create proposals from email threads
              const proposals = newEmails.map((email: any) => {
                // Extract deal size from email body
                const body = email.body || '';
                const dealSizeMatch = body.match(/Investment:?\s*\$?([\d,]+(?:\.\d{2})?)/i) || 
                                     body.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
                const dealSize = dealSizeMatch ? parseFloat(dealSizeMatch[1].replace(/,/g, '')) : 0;
                
                // Extract client name from "to" field or email
                const clientNameMatch = email.to.match(/([^<]+)</);
                const clientName = clientNameMatch ? clientNameMatch[1].trim() : email.to.split('@')[0];

                return {
                  id: crypto.randomUUID(),
                  title: email.subject || 'Email Proposal',
                  content: body || email.snippet,
                  status: 'PENDING' as const,
                  userId: defaultUserId,
                  lockedSections: [],
                  createdAt: email.date,
                  updatedAt: new Date().toISOString(),
                  metadata: {
                    source: 'gmail',
                    emailThreadId: email.threadId,
                    emailId: email.id,
                    from: email.from,
                    to: email.to,
                    subject: email.subject,
                    clientName: clientName,
                    dealSize: dealSize,
                    importedAt: new Date().toISOString()
                  }
                };
              });

              const { data: insertedProposals, error: insertError } = await supabase
                .from('Proposal')
                .insert(proposals)
                .select();

              if (insertError) {
                console.error('Error inserting proposals from emails:', insertError);
                throw insertError;
              }

              recordsAffected = insertedProposals?.length || 0;
              syncDetails = {
                message: `Successfully synced ${recordsAffected} new email threads as proposals`,
                emailsProcessed: messages.length,
                emailsAlreadyImported: validEmails.length - newEmails.length,
                proposalsCreated: recordsAffected,
                emailThreads: validEmails
              };
            } else {
              syncDetails = {
                message: 'No new email threads to sync. All emails have already been imported.',
                emailsProcessed: messages.length,
                emailsAlreadyImported: validEmails.length,
                proposalsCreated: 0,
                emailThreads: validEmails
              };
            }
          } else {
            syncDetails = {
              message: 'No valid email threads found',
              emailsProcessed: messages.length,
              emailThreads: []
            };
          }
        } else {
          syncDetails = {
            message: 'No proposal-related emails found in the last 30 days',
            emailsProcessed: 0,
            emailThreads: []
          };
        }
      } catch (syncError: any) {
        console.error('Gmail sync error:', syncError);
        
        // If credentials are missing or invalid, mark integration as inactive
        if (syncError.message?.includes('No access token') || 
            syncError.message?.includes('expired') || 
            syncError.message?.includes('revoked')) {
          await supabase
            .from('Integration')
            .update({ 
              isActive: false,
              updatedAt: new Date().toISOString(),
            })
            .eq('id', id);
        }
        
        syncDetails = {
          error: syncError.message || 'Failed to sync with Gmail',
          message: 'Sync failed'
        };
      }
    } else if (integration.type === 'SALESFORCE' && integration.credentials) {
      try {
        const credentials = integration.credentials as any;
        let accessToken = credentials?.accessToken || credentials?.access_token;
        const refreshToken = credentials?.refreshToken || credentials?.refresh_token;
        const instanceUrl = credentials?.instanceUrl || credentials?.instance_url;

        if (!accessToken) {
          throw new Error('No access token found. Please reconnect Salesforce.');
        }

        if (!instanceUrl) {
          throw new Error('No instance URL found. Please reconnect Salesforce.');
        }

        // Salesforce API version - use latest stable
        const apiVersion = 'v60.0';
        const query = `SELECT Id, Name, Amount, StageName, CloseDate, Description, Account.Name, CreatedDate, LastModifiedDate FROM Opportunity WHERE IsClosed = false ORDER BY LastModifiedDate DESC LIMIT 100`;

        const sfHeaders = () => ({
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        });

        let response = await fetch(
          `${instanceUrl}/services/data/${apiVersion}/query?q=${encodeURIComponent(query)}`,
          { headers: sfHeaders() }
        );

        // If unauthorized and we have a refresh token, try to refresh
        if (response.status === 401 && refreshToken) {
          const clientId = process.env.SALESFORCE_CLIENT_ID;
          const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
          const isSandbox = process.env.SALESFORCE_SANDBOX === 'true';
          const baseUrl = isSandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
          const tokenUrl = `${baseUrl}/services/oauth2/token`;

          logger.debug('Salesforce access token expired, refreshing...');
          const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: refreshToken,
              client_id: clientId!,
              client_secret: clientSecret!,
            }),
          });

          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            accessToken = tokenData.access_token;
            const newInstanceUrl = tokenData.instance_url || instanceUrl;
            await supabase
              .from('Integration')
              .update({
                credentials: {
                  ...credentials,
                  accessToken: tokenData.access_token,
                  refreshToken: tokenData.refresh_token ?? refreshToken,
                  expiresIn: tokenData.expires_in,
                  instanceUrl: newInstanceUrl,
                },
                updatedAt: new Date().toISOString(),
              })
              .eq('id', id);
            logger.debug('Salesforce token refreshed successfully');
            response = await fetch(
              `${newInstanceUrl}/services/data/${apiVersion}/query?q=${encodeURIComponent(query)}`,
              { headers: sfHeaders() }
            );
          } else {
            throw new Error('Failed to refresh token. Please reconnect Salesforce.');
          }
        }

        if (!response.ok) {
          const hint = response.status === 401
            ? ' Authorization may have expired or been revoked. Please reconnect Salesforce.'
            : '';
          throw new Error(`Salesforce API error: ${response.statusText}.${hint}`);
        }

        const data = await response.json();
        const opportunities = data.records || [];

        if (opportunities.length > 0) {
          // Check which opportunities already exist
          const { data: existingProposals } = await supabase
            .from('Proposal')
            .select('metadata')
            .not('metadata->opportunityId', 'is', null);

          const existingOppIds = new Set(
            (existingProposals || []).map((p: any) => p.metadata?.opportunityId).filter(Boolean)
          );

          // Only import new opportunities
          const newOpportunities = opportunities.filter((opp: any) => !existingOppIds.has(opp.Id));

          if (newOpportunities.length > 0) {
            const { data: users } = await supabase.from('User').select('id').limit(1);
            const defaultUserId = users?.[0]?.id || 'cmktbfc2w0000gks37adtbu7o';

            const proposals = newOpportunities.map((opp: any) => ({
              id: crypto.randomUUID(),
              title: opp.Name || 'Untitled Opportunity',
              content: opp.Description || `Opportunity imported from Salesforce\n\nAmount: $${opp.Amount || '0'}\nStage: ${opp.StageName || 'Unknown'}\nAccount: ${opp.Account?.Name || 'N/A'}`,
              status: 'PENDING' as const,
              userId: defaultUserId,
              lockedSections: [],
              createdAt: opp.CreatedDate || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              ...(intCompanyId ? { company_id: intCompanyId } : {}),
              metadata: {
                clientName: opp.Account?.Name || opp.Name,
                dealSize: opp.Amount ? parseFloat(String(opp.Amount)) : 0,
                source: 'salesforce',
                opportunityId: opp.Id,
                stageName: opp.StageName,
                closeDate: opp.CloseDate,
                accountName: opp.Account?.Name,
                importedAt: new Date().toISOString()
              }
            }));

            const { data: insertedProposals, error: insertError } = await supabase
              .from('Proposal')
              .insert(proposals)
              .select();

            if (insertError) {
              console.error('Error inserting proposals from Salesforce:', insertError);
              throw insertError;
            }

            recordsAffected = insertedProposals?.length || 0;
            syncDetails = {
              message: `Successfully synced ${recordsAffected} new opportunities from Salesforce`,
              opportunitiesProcessed: opportunities.length,
              opportunitiesAlreadyImported: opportunities.length - newOpportunities.length,
              proposalsCreated: recordsAffected
            };
          } else {
            syncDetails = {
              message: 'No new opportunities to sync. All opportunities have already been imported.',
              opportunitiesProcessed: opportunities.length,
              opportunitiesAlreadyImported: opportunities.length,
              proposalsCreated: 0
            };
          }
        } else {
          syncDetails = {
            message: 'No open opportunities found in Salesforce',
            opportunitiesProcessed: 0,
            proposalsCreated: 0
          };
        }
      } catch (syncError: any) {
        console.error('Salesforce sync error:', syncError);
        
        // If credentials are missing or invalid, mark integration as inactive
        if (syncError.message?.includes('No access token') || 
            syncError.message?.includes('No instance URL') ||
            syncError.message?.includes('expired') || 
            syncError.message?.includes('revoked')) {
          await supabase
            .from('Integration')
            .update({ 
              isActive: false,
              updatedAt: new Date().toISOString(),
            })
            .eq('id', id);
        }
        
        syncDetails = {
          error: syncError.message || 'Failed to sync with Salesforce',
          message: 'Sync failed'
        };
      }
    }

    // Log sync attempt
    const { data: syncLog, error: logError } = await supabase
      .from('SyncLog')
      .insert({
        id: crypto.randomUUID(),
        integrationId: id,
        action: 'SYNC',
        status: recordsAffected > 0 ? 'SUCCESS' : 'FAILURE',
        recordsAffected,
        details: syncDetails,
      })
      .select()
      .single();

    if (logError) throw logError;

    // Update last sync time
    await supabase
      .from('Integration')
      .update({ 
        lastSyncAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id);

    res.json({ 
      success: recordsAffected > 0, 
      message: syncDetails.message,
      recordsAffected,
      syncLog 
    });
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// GET sync logs for integration (must belong to current user)
router.get('/:id/logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Verify the integration belongs to the current user
    const { data: integration } = await supabase
      .from('Integration')
      .select('userId')
      .eq('id', id)
      .single();

    if (!integration || integration.userId !== userId) {
      return res.status(403).json({ error: 'You do not have access to this integration' });
    }

    const { data: logs, error } = await supabase
      .from('SyncLog')
      .select('*')
      .eq('integrationId', id)
      .order('createdAt', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json(logs || []);
  } catch (error) {
    console.error('Error fetching sync logs:', error);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

// GET HubSpot deals (if current user has HubSpot integration active)
router.get('/hubspot/deals', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user's HubSpot integration
    const { data: integration, error } = await supabase
      .from('Integration')
      .select('*')
      .eq('type', 'HUBSPOT')
      .eq('userId', userId)
      .eq('isActive', true)
      .single();

    if (error || !integration) {
      return res.status(404).json({ error: 'HubSpot integration not found or not active' });
    }

    const credentials = integration.credentials as any;
    const accessToken = credentials?.accessToken || credentials?.access_token;

    if (!accessToken) {
      return res.status(400).json({ error: 'No access token found' });
    }

    // Fetch deals from HubSpot API
    const response = await fetch(
      'https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,pipeline,closedate,createdate,hs_lastmodifieddate,description',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HubSpot API error:', errorText);
      return res.status(response.status).json({ error: 'Failed to fetch deals from HubSpot', details: errorText });
    }

    const data = await response.json();
    res.json(data.results || []);
  } catch (error) {
    console.error('Error fetching HubSpot deals:', error);
    res.status(500).json({ error: 'Failed to fetch HubSpot deals' });
  }
});

export default router;
