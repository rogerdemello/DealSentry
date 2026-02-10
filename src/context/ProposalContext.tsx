import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { proposalsApi, Proposal } from "@/lib/api-client";
import { mockProposals } from "@/data/mockData";
import { useToast } from "@/hooks/use-toast";

type ProposalStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

interface ProposalContextType {
  proposals: Proposal[];
  loading: boolean;
  error: string | null;
  getProposal: (id: string) => Proposal | undefined;
  updateProposalStatus: (id: string, status: ProposalStatus) => Promise<void>;
  addProposal: (proposal: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Proposal | null>;
  deleteProposal: (id: string) => Promise<void>;
  analyzeProposal: (id: string) => Promise<void>;
  refreshProposals: () => Promise<void>;
  isApiConnected: boolean;
}

const ProposalContext = createContext<ProposalContextType | undefined>(undefined);

export function ProposalProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApiConnected, setIsApiConnected] = useState(false);
  const [hasShownOfflineWarning, setHasShownOfflineWarning] = useState(false);

  // Fetch proposals on mount with retry logic
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 10;
    const retryDelay = 2000; // 2 seconds

    const attemptFetch = async () => {
      const success = await fetchProposals();
      
      if (!success && retryCount < maxRetries) {
        retryCount++;
        console.log(`API connection failed, retrying... (${retryCount}/${maxRetries})`);
        setTimeout(attemptFetch, retryDelay);
      } else if (!success && retryCount >= maxRetries && !hasShownOfflineWarning) {
        setHasShownOfflineWarning(true);
        toast({
          title: "Offline Mode",
          description: "Running with mock data. Please check your API server.",
          variant: "destructive",
        });
      }
    };

    attemptFetch();
  }, []);

  // Periodic API connectivity check (every 30 seconds)
  useEffect(() => {
    if (!isApiConnected) {
      const interval = setInterval(async () => {
        console.log('Checking API connectivity...');
        const connected = await fetchProposals(true); // Silent retry
        if (connected && !isApiConnected) {
          toast({
            title: "Connected",
            description: "API connection restored",
          });
        }
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [isApiConnected]);

  const fetchProposals = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    
    try {
      const data = await proposalsApi.getAll();
      setProposals(data);
      setIsApiConnected(true);
      return true;
    } catch (err) {
      if (!silent) {
        console.warn('API not available, using mock data:', err);
      }
      // Fall back to mock data if API is not available
      setProposals(mockProposals.map(p => ({
        ...p,
        riskReport: undefined,
      })) as Proposal[]);
      setIsApiConnected(false);
      return false;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const refreshProposals = async () => {
    return await fetchProposals();
  };

  const getProposal = (id: string) => {
    return proposals.find((p) => p.id === id);
  };

  const updateProposalStatus = async (id: string, status: ProposalStatus) => {
    // Optimistic update
    setProposals((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, status, updatedAt: new Date().toISOString() }
          : p
      )
    );

    if (isApiConnected) {
      try {
        await proposalsApi.updateStatus(id, status);
      } catch (err) {
        console.error('Failed to update status:', err);
        toast({
          title: "Error",
          description: "Failed to update proposal status",
          variant: "destructive",
        });
        // Revert on error
        await fetchProposals();
      }
    }
  };

  const addProposal = async (proposalData: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt'>): Promise<Proposal | null> => {
    if (isApiConnected) {
      let createdProposal: Proposal | null = null;
      try {
        const newProposal = await proposalsApi.create({
          title: proposalData.title,
          content: proposalData.content,
          metadata: proposalData.metadata,
        });
        createdProposal = newProposal;
        // Add to list immediately so the proposal is visible even if analysis fails
        setProposals((prev) => [newProposal, ...prev]);

        toast({
          title: "Analyzing Proposal",
          description: "AI is evaluating compliance and risk...",
        });
        await analyzeProposal(newProposal.id);

        await fetchProposals();
        const updatedProposal = await proposalsApi.getById(newProposal.id);
        toast({
          title: "Analysis Complete",
          description: "Proposal has been analyzed successfully",
        });
        return updatedProposal;
      } catch (err) {
        console.error('Create/analyze proposal error:', err);
        if (createdProposal) {
          // Proposal was created; ensure list is in sync and still allow navigation to review
          await fetchProposals();
          toast({
            title: "Proposal created",
            description: "Analysis could not be completed. You can run it from the review page.",
            variant: "destructive",
          });
          return await proposalsApi.getById(createdProposal.id).catch(() => createdProposal);
        }
        toast({
          title: "Error",
          description: "Failed to create proposal",
          variant: "destructive",
        });
        return null;
      }
    } else {
      // Fallback for offline mode
      const newProposal: Proposal = {
        id: Date.now().toString(),
        ...proposalData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setProposals((prev) => [newProposal, ...prev]);
      return newProposal;
    }
  };

  const deleteProposal = async (id: string) => {
    // Optimistic update
    setProposals((prev) => prev.filter((p) => p.id !== id));

    if (isApiConnected) {
      try {
        await proposalsApi.delete(id);
        toast({
          title: "Success",
          description: "Proposal deleted successfully",
        });
      } catch (err) {
        console.error('Failed to delete proposal:', err);
        toast({
          title: "Error",
          description: "Failed to delete proposal",
          variant: "destructive",
        });
        // Revert on error
        await fetchProposals();
      }
    } else {
      toast({
        title: "Success",
        description: "Proposal deleted successfully",
      });
    }
  };

  const analyzeProposal = async (id: string) => {
    if (!isApiConnected) {
      return;
    }
    
    try {
      const result = await proposalsApi.analyze(id);
      
      // Fetch the updated proposal from API to get all fields
      const updatedProposal = await proposalsApi.getById(id);
      
      // Update the local proposal with fresh data
      setProposals((prev) =>
        prev.map((p) =>
          p.id === id ? updatedProposal : p
        )
      );
    } catch (err) {
      throw err; // Re-throw to allow UI to handle error
    }
  };

  return (
    <ProposalContext.Provider
      value={{ 
        proposals, 
        loading, 
        error,
        getProposal, 
        updateProposalStatus, 
        addProposal,
        deleteProposal,
        analyzeProposal,
        refreshProposals,
        isApiConnected,
      }}
    >
      {children}
    </ProposalContext.Provider>
  );
}

export function useProposals() {
  const context = useContext(ProposalContext);
  if (context === undefined) {
    throw new Error("useProposals must be used within a ProposalProvider");
  }
  return context;
}
