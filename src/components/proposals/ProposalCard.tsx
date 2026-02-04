import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, Building2, Eye, FileText, DollarSign, Percent, Trash2 } from "lucide-react";
import { Proposal } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useProposals } from "@/context/ProposalContext";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

interface ProposalCardProps {
  proposal: Proposal;
  index?: number;
}

export function ProposalCard({ proposal, index = 0 }: ProposalCardProps) {
  const { deleteProposal } = useProposals();
  const [isDeleting, setIsDeleting] = useState(false);
  
  const formattedDate = formatDistanceToNow(new Date(proposal.createdAt), {
    addSuffix: true,
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteProposal(proposal.id);
    setIsDeleting(false);
  };

  return (
    <div className="glass-panel group">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <StatusBadge status={proposal.status} />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          <span>{formattedDate}</span>
        </div>
      </div>

      {/* Content */}
      <div className="mb-4">
        <h3 className="font-heading font-semibold text-base text-foreground mb-1.5 line-clamp-2 group-hover:text-primary transition-colors duration-200">
          {proposal.title}
        </h3>
        {proposal.metadata.clientName && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="w-3.5 h-3.5" />
            <span>{proposal.metadata.clientName}</span>
          </div>
        )}
      </div>

      {/* Deal Info */}
      {(proposal.metadata.dealSize || proposal.metadata.discount) && (
        <div className="flex gap-4 mb-4">
          {proposal.metadata.dealSize && (
            <div className="flex items-center gap-1.5 text-sm">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-foreground font-medium">
                {proposal.metadata.dealSize.toLocaleString()}
              </span>
            </div>
          )}
          {proposal.metadata.discount && (
            <div className="flex items-center gap-1.5 text-sm">
              <Percent className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-foreground font-medium">
                {proposal.metadata.discount}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Score */}
      <div className="mb-5">
        <ScoreBar score={proposal.readinessScore} />
      </div>

      {/* Actions */}
      <div className="flex gap-2.5">
        <Button asChild className="flex-1" size="sm">
          <Link to={`/proposals/${proposal.id}/review`}>
            <Eye className="w-4 h-4 mr-1.5" />
            Review
          </Link>
        </Button>
        <Button variant="outline" asChild size="sm">
          <Link to={`/proposals/${proposal.id}`}>
            <FileText className="w-4 h-4 mr-1.5" />
            Details
          </Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm"
              className="px-2 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Proposal</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{proposal.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}