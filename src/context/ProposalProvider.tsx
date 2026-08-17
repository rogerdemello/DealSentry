import React, { useState, useEffect, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { proposalsApi, Proposal } from "@/lib/api-client";
import { mockProposals } from "@/data/mockData";
import { useToast } from "@/hooks/use-toast";
import { ProposalContext } from "@/context/proposal-context";

type ProposalStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";

export function ProposalProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const location = useLocation();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApiConnected, setIsApiConnected] = useState(false);
  const [hasShownOfflineWarning, setHasShownOfflineWarning] = useState(false);

  useEffect(() => {
    let retryCount = 0;
    let cancelled = false;
    const maxRetries = 10;
    const retryDelay = 2000;

    const attemptFetch = async () => {
      const outcome = await fetchProposals();
      if (cancelled) return;

      if (outcome === "ok") {
        return;
      }

      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`API connection failed, retrying... (${retryCount}/${maxRetries})`);
        setTimeout(attemptFetch, retryDelay);
      } else if (!hasShownOfflineWarning) {
        setHasShownOfflineWarning(true);
        toast({
          title: "Offline Mode",
          description:
            "Running with mock data. Ensure the API is running (e.g. npm run server).",
          variant: "destructive",
        });
      }
    };

    attemptFetch();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (isApiConnected) {
      return;
    }
    const interval = setInterval(async () => {
      console.log("Checking API connectivity...");
      const outcome = await fetchProposals(true);
      if (outcome === "ok" && !isApiConnected) {
        toast({
          title: "Connected",
          description: "API connection restored",
        });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isApiConnected, location.pathname]);

  const fetchProposals = async (silent = false): Promise<"ok" | "offline"> => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await proposalsApi.getAll();
      setProposals(data);
      setIsApiConnected(true);
      return "ok";
    } catch (err) {
      if (!silent) {
        console.warn("API not available, using mock data:", err);
      }
      setProposals(
        mockProposals.map((p) => ({
          ...p,
          riskReport: undefined,
        })) as Proposal[]
      );
      setIsApiConnected(false);
      return "offline";
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const refreshProposals = () => fetchProposals();

  const getProposal = (id: string) => {
    return proposals.find((p) => p.id === id);
  };

  const updateProposalStatus = async (id: string, status: ProposalStatus) => {
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
        console.error("Failed to update status:", err);
        toast({
          title: "Error",
          description: "Failed to update proposal status",
          variant: "destructive",
        });
        await fetchProposals();
      }
    }
  };

  const addProposal = async (
    proposalData: Omit<Proposal, "id" | "createdAt" | "updatedAt">
  ): Promise<Proposal | null> => {
    if (isApiConnected) {
      let createdProposal: Proposal | null = null;
      try {
        const newProposal = await proposalsApi.create({
          title: proposalData.title,
          content: proposalData.content,
          metadata: proposalData.metadata,
        });
        createdProposal = newProposal;
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
        console.error("Create/analyze proposal error:", err);
        if (createdProposal) {
          await fetchProposals();
          toast({
            title: "Proposal created",
            description:
              "Analysis could not be completed. You can run it from the review page.",
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
    setProposals((prev) => prev.filter((p) => p.id !== id));

    if (isApiConnected) {
      try {
        await proposalsApi.delete(id);
        toast({
          title: "Success",
          description: "Proposal deleted successfully",
        });
      } catch (err) {
        console.error("Failed to delete proposal:", err);
        toast({
          title: "Error",
          description: "Failed to delete proposal",
          variant: "destructive",
        });
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
      await proposalsApi.analyze(id);
      const updatedProposal = await proposalsApi.getById(id);
      setProposals((prev) => prev.map((p) => (p.id === id ? updatedProposal : p)));
    } catch (err) {
      throw err;
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
