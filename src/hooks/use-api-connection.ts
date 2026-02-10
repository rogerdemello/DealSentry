import { useEffect, useState, useRef } from 'react';
import { checkApiHealth } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export interface ApiConnectionStatus {
  isConnected: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
}

/**
 * Hook to monitor API server connection status
 * Checks health endpoint periodically and notifies user of connection changes
 */
export function useApiConnection(
  checkInterval = 30000, // Check every 30 seconds
  retryInterval = 5000    // When disconnected, check every 5 seconds
) {
  const [status, setStatus] = useState<ApiConnectionStatus>({
    isConnected: true,
    isChecking: false,
    lastChecked: null,
  });
  
  const { toast } = useToast();
  const wasConnectedRef = useRef(true);
  const toastIdRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkConnection = async () => {
    setStatus(prev => ({ ...prev, isChecking: true }));
    
    try {
      const isHealthy = await checkApiHealth();
      const now = new Date();
      
      setStatus({
        isConnected: isHealthy,
        isChecking: false,
        lastChecked: now,
      });

      // Show notification on status change
      if (!wasConnectedRef.current && isHealthy) {
        // Connection restored
        toast({
          title: 'Connection Restored',
          description: 'API server is back online',
          variant: 'default',
        });
        toastIdRef.current = null;
      } else if (wasConnectedRef.current && !isHealthy) {
        // Connection lost
        toast({
          title: 'API Server Offline',
          description: 'Cannot connect to API server. Retrying...',
          variant: 'destructive',
          duration: 10000,
        });
      }

      wasConnectedRef.current = isHealthy;
    } catch (error) {
      console.error('Connection check failed:', error);
      setStatus(prev => ({
        ...prev,
        isConnected: false,
        isChecking: false,
      }));
      wasConnectedRef.current = false;
    }
  };

  useEffect(() => {
    // Initial check
    checkConnection();

    // Set up periodic checking
    const setupInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      const interval = status.isConnected ? checkInterval : retryInterval;
      intervalRef.current = setInterval(checkConnection, interval);
    };

    setupInterval();

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [status.isConnected, checkInterval, retryInterval]);

  // Check connection when window regains focus
  useEffect(() => {
    const handleFocus = () => {
      checkConnection();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return {
    ...status,
    checkConnection,
  };
}
