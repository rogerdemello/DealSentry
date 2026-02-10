import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Link2Off, Check, Loader2, Link2, ExternalLink, Cloud, Mail, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mockIntegrations } from "@/data/mockData";
import { Integration } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { useProposals } from "@/context/ProposalContext";
import { formatDistanceToNowIST } from "@/lib/utils";

const integrationConfig = {
  SALESFORCE: {
    icon: Cloud,
    color: "#0176D3",
    description: "Sync opportunities and accounts",
    features: ["Auto-sync opportunities", "Push proposals to Salesforce", "Bi-directional updates"],
  },
  GMAIL: {
    icon: Mail,
    color: "#EA4335",
    description: "Send proposals via Gmail",
    features: ["Send proposals directly", "Email templates", "Track opens"],
  },
  HUBSPOT: {
    icon: Target,
    color: "#FF7A59",
    description: "Sync deals and contacts",
    features: ["Auto-sync deals", "Contact management", "Activity tracking"],
  },
};

// Load integration status from localStorage
const loadIntegrationStatus = (): Record<string, boolean> => {
  const stored = localStorage.getItem('integrationStatus');
  return stored ? JSON.parse(stored) : {};
};

// Save integration status to localStorage
const saveIntegrationStatus = (status: Record<string, boolean>) => {
  localStorage.setItem('integrationStatus', JSON.stringify(status));
};

export default function Integrations() {
  const { toast } = useToast();
  const { refreshProposals } = useProposals();
  const [integrations, setIntegrations] = useState<Integration[]>(() => {
    // Start with mock data for immediate render; real data will replace it after fetch
    // Don't use localStorage here - wait for database fetch to determine actual status
    return mockIntegrations.map(i => ({
      ...i,
      isActive: false, // Start as inactive until database confirms
      lastSyncAt: null,
    }));
  });
  const [syncing, setSyncing] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  // Fetch integrations from API
  const fetchIntegrations = async () => {
    try {
      const apiOrigin = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiOrigin}/api/integrations`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to load integrations');
      const data = await res.json();

      // Map DB records to UI shape - use database as source of truth
      const dbIntegrations = data.map((d: any) => {
        const hasCredentials = d.credentials && typeof d.credentials === 'object' && Object.keys(d.credentials).length > 0;
        const isActive = d.isActive && hasCredentials;
        
        return {
          id: d.id,
          type: d.type,
          name: d.name,
          isActive,
          lastSyncAt: d.lastSyncAt || null,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          credentials: d.credentials || {},
          config: d.config || {},
        };
      });

      // Ensure we always show one card per type (Salesforce, HubSpot, Gmail) so users can Connect
      const types: Array<Integration['type']> = ['SALESFORCE', 'HUBSPOT', 'GMAIL'];
      
      // Group integrations by type, preferring active ones
      const byType = new Map<string, Integration>();
      dbIntegrations.forEach((i: Integration) => {
        const existing = byType.get(i.type);
        if (!existing) {
          byType.set(i.type, i);
        } else {
          // Prefer active integrations, or most recent if both have same status
          if (i.isActive && !existing.isActive) {
            byType.set(i.type, i);
          } else if (i.isActive === existing.isActive) {
            // Both same status: prefer most recent
            const iDate = new Date(i.updatedAt || i.createdAt || 0).getTime();
            const existingDate = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
            if (iDate > existingDate) {
              byType.set(i.type, i);
            }
          }
        }
      });
      
      const merged = types.map((type) => {
        const existing = byType.get(type);
        if (existing) {
          return existing;
        }
        return {
          id: `placeholder-${type}`,
          type,
          name: type.charAt(0) + type.slice(1).toLowerCase().replace('_', ' '),
          isActive: false,
          lastSyncAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          credentials: {},
          config: {},
        } as Integration;
      });

      setIntegrations(merged);

      const status: Record<string, boolean> = {};
      merged.forEach((int: Integration) => {
        status[int.type] = int.isActive;
      });
      saveIntegrationStatus(status);
    } catch (err) {
      console.warn('Could not fetch integrations:', err);
    }
  };

  // Check URL params for OAuth success and refetch to show connected status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hubspotSuccess = params.get('hubspot') === 'connected' || params.get('hubspot') === 'demo';
    const salesforceSuccess = params.get('salesforce') === 'connected' || params.get('salesforce') === 'demo';
    const gmailSuccess = params.get('gmail') === 'connected' || params.get('gmail') === 'demo';
    const error = params.get('error');

    if (error) {
      const message =
        error === 'no_code'
          ? 'Authorization was cancelled or no code was returned.'
          : error === 'token_exchange_failed'
            ? 'Could not get access token. Check redirect URI and app credentials.'
            : error === 'hubspot_save_failed'
              ? 'Connected but failed to save. Try again or check the Integration table has required columns.'
              : error === 'no_client_id'
                ? 'HubSpot client ID is not configured.'
                : `Error: ${error}`;
      toast({
        title: "Connection failed",
        description: message,
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/integrations');
      return;
    }

    if (hubspotSuccess || salesforceSuccess || gmailSuccess) {
      const type = hubspotSuccess ? 'HUBSPOT' : salesforceSuccess ? 'SALESFORCE' : 'GMAIL';
      toast({
        title: `${type === 'HUBSPOT' ? 'HubSpot' : type === 'SALESFORCE' ? 'Salesforce' : 'Gmail'} connected!`,
        description: "Your integration is now active",
      });
      
      window.history.replaceState({}, '', '/integrations');
      
      // Refetch from API to show the real connected status from database
      // Use longer delay to ensure DB save is committed
      setTimeout(() => {
        fetchIntegrations();
      }, 1000);
    }
  }, [toast]);

  // Load integrations from backend API on mount
  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleConnect = async (integration: Integration) => {
    setConnecting(integration.id);

    const oauthUrls: Record<string, string> = {
      SALESFORCE: '/api/oauth/salesforce/authorize',
      HUBSPOT: '/api/oauth/hubspot/authorize',
      GMAIL: '/api/oauth/gmail/authorize',
    };

    const apiOrigin = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001';
    const url = oauthUrls[integration.type];
    if (url) {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        toast({
          title: "Authentication Required",
          description: "Please login to connect integrations",
          variant: "destructive",
        });
        setConnecting(null);
        return;
      }
      window.location.href = `${apiOrigin}${url}?token=${encodeURIComponent(token)}`;
    } else {
      setConnecting(null);
    }
  };

  const handleDisconnect = (integration: Integration) => {
    if (!confirm(`Disconnect ${integration.name}? You can reconnect anytime.`)) return;
    // Optimistic UI update
    setIntegrations(integrations.map((i) =>
      i.id === integration.id
        ? { ...i, isActive: false, lastSyncAt: null }
        : i
    ));

    // Update server-side Integration record
    (async () => {
      try {
        const apiOrigin = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001';
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${apiOrigin}/api/integrations/${integration.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ isActive: false, credentials: {} }),
        });
        if (!res.ok) throw new Error('Failed to disconnect');

        // update localStorage cache as well
        const status = loadIntegrationStatus();
        status[integration.type] = false;
        saveIntegrationStatus(status);

        toast({ title: `${integration.name} disconnected` });
      } catch (err) {
        toast({ title: 'Disconnect failed', description: String(err), variant: 'destructive' });
      }
    })();
  };

  const handleSync = async (integration: Integration) => {
    setSyncing(integration.id);

    try {
      const apiOrigin = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiOrigin}/api/integrations/${integration.id}/sync`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        // If sync failed due to missing credentials, mark integration as inactive
        if (result.error?.includes('No access token') || result.error?.includes('expired') || result.error?.includes('revoked')) {
          setIntegrations(integrations.map((i) =>
            i.id === integration.id
              ? { ...i, isActive: false, lastSyncAt: null }
              : i
          ));
          
          // Update localStorage
          const status = loadIntegrationStatus();
          status[integration.type] = false;
          saveIntegrationStatus(status);
          
          // Update database
          try {
            await fetch(`${apiOrigin}/api/integrations/${integration.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isActive: false }),
            });
          } catch (updateErr) {
            console.error('Failed to update integration status:', updateErr);
          }
          
          toast({
            title: "Sync failed - Reconnection required",
            description: result.error || "Please reconnect Gmail in Integrations.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(result.error || 'Sync failed');
      }
      
      // Update last sync time
      setIntegrations(integrations.map((i) =>
        i.id === integration.id
          ? { ...i, lastSyncAt: new Date().toISOString() }
          : i
      ));
      
      toast({
        title: "Sync complete",
        description: result.message || `${integration.name} data has been synchronized`,
      });
      
      // Refresh proposals to show newly synced data
      if (result.recordsAffected > 0) {
        await refreshProposals();
      }
      
      // If HubSpot sync was successful, suggest checking proposals
      if (integration.type === 'HUBSPOT' && result.recordsAffected > 0) {
        setTimeout(() => {
          toast({
            title: `${result.recordsAffected} deals imported`,
            description: "Check the Proposals tab to see your HubSpot deals",
          });
        }, 1500);
      }
    } catch (err) {
      toast({
        title: "Sync failed",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setSyncing(null);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  const connectedCount = integrations.filter(i => i.isActive).length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground">
            Integrations
          </h1>
        </div>
        <p className="text-muted-foreground text-[15px] ml-[52px]">
          {connectedCount} connected • Connect tools to streamline workflows
        </p>
      </motion.div>

      {/* Integration Cards */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        {integrations.map((integration) => {
          const config = integrationConfig[integration.type];
          const Icon = config.icon;
          const isConnecting = connecting === integration.id;
          const isSyncing = syncing === integration.id;

          return (
            <motion.div
              key={integration.id}
              variants={itemVariants}
              className={`glass-panel overflow-hidden ${integration.isActive ? `border-l-[3px]` : ""}`}
              style={{ borderLeftColor: integration.isActive ? config.color : undefined }}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-5">
                {/* Logo & Info */}
                <div className="flex items-start gap-4 flex-1">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${config.color}12` }}
                  >
                    <Icon className="w-6 h-6" style={{ color: config.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 mb-1">
                      <h3 className="font-heading font-semibold text-lg text-foreground">
                        {integration.name}
                      </h3>
                      {integration.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-success/10 text-success">
                          <Check className="w-2.5 h-2.5" />
                          Connected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-muted text-muted-foreground">
                          Not Connected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {config.description}
                    </p>
                  </div>
                </div>

                {/* Features */}
                <div className="flex-1 hidden lg:block">
                  <ul className="space-y-1.5">
                    {config.features.map((feature, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full" style={{ backgroundColor: config.color }} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 min-w-[140px]">
                  {integration.isActive ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleSync(integration)}
                        disabled={isSyncing}
                      >
                        {isSyncing ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2" />
                        )}
                        {isSyncing ? "Syncing..." : "Sync Now"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDisconnect(integration)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/8"
                      >
                        <Link2Off className="w-3.5 h-3.5" />
                      </Button>
                      {integration.lastSyncAt && (
                        <p className="text-[11px] text-muted-foreground text-center">
                          Synced {formatDistanceToNowIST(new Date(integration.lastSyncAt), { addSuffix: true })}
                        </p>
                      )}
                    </>
                  ) : (
                    <Button
                      onClick={() => handleConnect(integration)}
                      disabled={isConnecting}
                    >
                      {isConnecting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4 mr-2" />
                      )}
                      {isConnecting ? "Connecting..." : "Connect"}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}