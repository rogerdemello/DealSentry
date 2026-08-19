import { Link } from "react-router-dom";
import { Calendar, Building2, Eye, DollarSign, Percent, Trash2, Sparkles } from "lucide-react";
import { Proposal } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useProposals } from "@/context/useProposals";
import { formatDistanceToNowIST } from "@/lib/utils";
import { useState } from "react";
import { proposalsApi } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";

interface ProposalCardProps {
  proposal: Proposal;
  index?: number;
  isSelected?: boolean;
  onSelect?: (checked: boolean) => void;
}

export function ProposalCard({ proposal, isSelected = false, onSelect }: ProposalCardProps) {
  const { deleteProposal, refreshProposals } = useProposals();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const formattedDate = formatDistanceToNowIST(new Date(proposal.createdAt), {
    addSuffix: true,
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteProposal(proposal.id);
    setIsDeleting(false);
  };

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      await proposalsApi.analyze(proposal.id);
      toast({
        title: "Analysis Complete",
        description: "The proposal has been analyzed successfully.",
      });
      await refreshProposals();
    } catch {
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze the proposal. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="glass-panel group relative">
      {/* Checkbox */}
      {onSelect && (
        <div className="absolute top-4 left-4 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      
      {/* Header */}
      <div className={`flex items-center justify-between mb-4 ${onSelect ? 'ml-8' : ''}`}>
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
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleRunAnalysis}
          disabled={isAnalyzing}
        >
          <Sparkles className="w-4 h-4 mr-1.5" />
          {isAnalyzing ? "Analyzing..." : "Run Analysis"}
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