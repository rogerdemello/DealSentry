import { createContext } from "react";
import type { Proposal } from "@/lib/api-client";

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
  analyzeProposal: (id: string) => Promise<void>;
  refreshProposals: () => Promise<"ok" | "offline">;
  isApiConnected: boolean;
}

export const ProposalContext = createContext<ProposalContextType | undefined>(
  undefined
);
