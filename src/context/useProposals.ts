import { useContext } from "react";
import { ProposalContext } from "@/context/proposal-context";

export function useProposals() {
  const context = useContext(ProposalContext);
  if (context === undefined) {
    throw new Error("useProposals must be used within a ProposalProvider");
  }
  return context;
}
