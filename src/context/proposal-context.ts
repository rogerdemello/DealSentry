import { createContext } from "react";
import type { AnalyzeResponse, Proposal } from "@/lib/api-client";

type ProposalStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";

export interface ProposalContextType {
  proposals: Proposal[];
  loading: boolean;
  error: string | null;
  getProposal: (id: string) => Proposal | undefined;
  updateProposalStatus: (id: string, status: ProposalStatus) => Promise<void>;
  addProposal: (
    proposal: Omit<Proposal, "id" | "createdAt" | "updatedAt">
  ) => Promise<Proposal | null>;
  deleteProposal: (id: string) => Promise<void>;
  /** Analyze (or re-analyze) a proposal; null when the API is offline. */
  analyzeProposal: (id: string) => Promise<AnalyzeResponse | null>;
  refreshProposals: () => Promise<"ok" | "offline">;
  isApiConnected: boolean;
}

export const ProposalContext = createContext<ProposalContextType | undefined>(
  undefined
);
