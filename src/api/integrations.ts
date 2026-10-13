import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth } from './middleware/auth';
import { logger } from './lib/logger';
import { HUBSPOT_DEALS_URL } from './lib/sync/hubspot';
import { runSync, type IntegrationRow } from './lib/sync';

const router = Router();

const INTEGRATION_TYPES = ['SALESFORCE', 'HUBSPOT', 'GMAIL', 'GOOGLE_DRIVE', 'DOCUSIGN', 'SHAREPOINT'];

/**
 * An integration as the browser may see it. OAuth access and refresh tokens never
 * leave the server: `credentials` is replaced by a placeholder that is non-empty
 * only when the integration is connected (older clients decide "connected" from
 * that), plus an explicit `hasCredentials` flag.
 */
function toPublicIntegration<T extends { credentials?: unknown }>(row: T) {
  const credentials = row.credentials;
  const connected =
    !!credentials && typeof credentials === 'object' && Object.keys(credentials as object).length > 0;
  const demo = connected && (credentials as { demo?: boolean }).demo === true;
  return {
    ...row,
    hasCredentials: connected,
    credentials: connected ? { connected: true, ...(demo ? { demo: true } : {}) } : {},
  };
}

/** The signed-in user's id, or a 401 response already sent (returns null). */
function currentUserId(req: Request, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return null;
  }
  return userId;
}

// GET all integrations (only show current user's integrations)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = currentUserId(req, res);
    if (!userId) return;

    const { data: integrations, error } = await supabase
      .from('Integration')
      .select('*, SyncLog(*)')
      .eq('userId', userId)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    res.json((integrations || []).map(toPublicIntegration));
  } catch (error) {
    logger.error('Error fetching integrations:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

// GET single integration (must belong to current user)
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = currentUserId(req, res);
    if (!userId) return;

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

    res.json(toPublicIntegration(integration));
  } catch (error) {
    logger.error('Error fetching integration:', error);
    res.status(500).json({ error: 'Failed to fetch integration' });
  }
});

// POST create integration (creates for current user)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { type, name, credentials, config } = req.body;
    const userId = currentUserId(req, res);
    if (!userId) return;

    if (!type || !name) {
      return res.status(400).json({ error: 'Type and name are required' });
    }
    if (!INTEGRATION_TYPES.includes(type)) {
      return res.status(400).json({ error: `Unknown integration type. Expected one of: ${INTEGRATION_TYPES.join(', ')}` });
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
        userId,
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(toPublicIntegration(integration));
  } catch (error) {
    logger.error('Error creating integration:', error);
    res.status(500).json({ error: 'Failed to create integration' });
  }
});

// PATCH update integration (must belong to current user)
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, credentials, config, isActive } = req.body;
    const userId = currentUserId(req, res);
    if (!userId) return;

    // Verify the integration belongs to the current user
    const { data: existing } = await supabase
      .from('Integration')
      .select('userId')
      .eq('id', id)
      .single();

    if (!existing || existing.userId !== userId) {
      return res.status(403).json({ error: 'You do not have access to this integration' });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
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

    res.json(toPublicIntegration(integration));
  } catch (error) {
    logger.error('Error updating integration:', error);
    res.status(500).json({ error: 'Failed to update integration' });
  }
});

// DELETE integration (must belong to current user)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = currentUserId(req, res);
    if (!userId) return;

    // Verify the integration belongs to the current user
    const { data: existing } = await supabase
      .from('Integration')
      .select('userId')
      .eq('id', id)
      .single();

    if (!existing || existing.userId !== userId) {
      return res.status(403).json({ error: 'You do not have access to this integration' });
    }

    // SyncLog rows reference this integration; without a DB-level cascade the
    // delete fails for any integration that has ever synced.
    const { error: logError } = await supabase.from('SyncLog').delete().eq('integrationId', id);
    if (logError) throw logError;

    const { error } = await supabase.from('Integration').delete().eq('id', id);
    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting integration:', error);
    res.status(500).json({ error: 'Failed to delete integration' });
  }
});

// POST trigger sync for integration (must belong to current user)
router.post('/:id/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = currentUserId(req, res);
    if (!userId) return;

    const { data: integration, error: intError } = await supabase
      .from('Integration')
      .select('*')
      .eq('id', id)
      .eq('userId', userId)
      .single();

    if (intError || !integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Imported proposals belong to the integration's owner and inherit their company.
    const result = await runSync({
      integration: integration as IntegrationRow,
      userId,
      companyId: req.user?.companyId ?? null,
    });

    // A revoked/expired connection is switched off so the UI asks the user to reconnect.
    if (result.deactivate) {
      await supabase
        .from('Integration')
        .update({ isActive: false, updatedAt: new Date().toISOString() })
        .eq('id', id);
    }

    const { data: syncLog, error: logError } = await supabase
      .from('SyncLog')
      .insert({
        id: crypto.randomUUID(),
        integrationId: id,
        action: 'SYNC',
        // A sync with nothing new to import is still a success, not a failure.
        status: result.failed ? 'FAILURE' : 'SUCCESS',
        recordsAffected: result.recordsAffected,
        details: result.details,
      })
      .select()
      .single();

    if (logError) throw logError;

    if (result.failed) {
      // 424 (not 5xx): the CRM failed, not this server, and the SPA's HTTP client
      // would otherwise retry a 502/503 and trigger the sync again.
      return res.status(424).json({
        success: false,
        error: result.details.error,
        message: result.details.message,
        needsReconnect: result.deactivate,
        code: 'SYNC_FAILED',
        recordsAffected: 0,
        syncLog,
      });
    }

    await supabase
      .from('Integration')
      .update({ lastSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .eq('id', id);

    res.json({
      success: true,
      message: result.details.message,
      recordsAffected: result.recordsAffected,
      syncLog,
    });
  } catch (error) {
    logger.error('Error triggering sync:', error);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// GET sync logs for integration (must belong to current user)
router.get('/:id/logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit as string, 10) || 50, 1), 200);
    const userId = currentUserId(req, res);
    if (!userId) return;

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
    logger.error('Error fetching sync logs:', error);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

// GET HubSpot deals (if current user has HubSpot integration active)
router.get('/hubspot/deals', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = currentUserId(req, res);
    if (!userId) return;

    // Get user's HubSpot integration
    const { data: integration, error } = await supabase
      .from('Integration')
      .select('*')
      .eq('type', 'HUBSPOT')
      .eq('userId', userId)
      .eq('isActive', true)
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !integration) {
      return res.status(404).json({ error: 'HubSpot integration not found or not active' });
    }

    const credentials = integration.credentials as { accessToken?: string; access_token?: string } | null;
    const accessToken = credentials?.accessToken || credentials?.access_token;

    if (!accessToken) {
      return res.status(400).json({ error: 'No access token found' });
    }

    // Fetch deals from HubSpot API
    const response = await fetch(HUBSPOT_DEALS_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('HubSpot API error:', errorText);
      return res.status(response.status).json({ error: 'Failed to fetch deals from HubSpot', details: errorText });
    }

    const data = await response.json();
    res.json(data.results || []);
  } catch (error) {
    logger.error('Error fetching HubSpot deals:', error);
    res.status(500).json({ error: 'Failed to fetch HubSpot deals' });
  }
});

export default router;
