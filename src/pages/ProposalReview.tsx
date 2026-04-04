import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ArrowLeft, 
  Check, 
  X, 
  Download, 
  AlertCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  Building2,
  DollarSign,
  Percent,
  Calendar,
  TrendingUp,
  Trash2
} from "lucide-react";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RiskBar } from "@/components/ui/RiskBar";
import { getApiBaseUrl } from "@/lib/api-client";
import { useProposals } from "@/context/useProposals";
import { Finding, Recommendation } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { formatIST } from "@/lib/utils";
import { useState } from "react";

const severityConfig = {
  CRITICAL: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", borderColor: "border-l-red-500", label: "Critical" },
  HIGH: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", borderColor: "border-l-amber-500", label: "High" },
  MEDIUM: { icon: AlertTriangle, color: "text-blue-600", bg: "bg-blue-50", borderColor: "border-l-blue-500", label: "Medium" },
  LOW: { icon: Info, color: "text-slate-500", bg: "bg-slate-50", borderColor: "border-l-slate-400", label: "Low" },
};

export default function ProposalReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getProposal, updateProposalStatus, deleteProposal } = useProposals();
  const [isDeleting, setIsDeleting] = useState(false);
  
  const proposal = getProposal(id || "");
  
  // Use actual risk report or fallback to safe defaults
  const riskReport = proposal?.riskReport || {
    legalRisk: 0,
    pricingRisk: 0,
    structuralRisk: 0,
    findings: [],
    recommendations: [],
  };
  
  if (!proposal) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-muted flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
          Proposal not found
        </h2>
        <p className="text-muted-foreground mb-4">The proposal you're looking for doesn't exist.</p>
        <Button asChild variant="outline">
          <Link to="/proposals">Back to Proposals</Link>
        </Button>
      </div>
    );
  }

  const handleApprove = () => {
    if (proposal.status === "REJECTED") {
      if (!confirm("This proposal was previously rejected. Are you sure you want to approve it?")) {
        return;
      }
    }
    
    updateProposalStatus(proposal.id, "APPROVED");
    
    toast({ 
      title: "Proposal Approved", 
      description: `"${proposal.title}" has been marked as approved` 
    });
  };

  const handleReject = () => {
    if (!confirm("Are you sure you want to reject this proposal?")) {
      return;
    }
    
    updateProposalStatus(proposal.id, "REJECTED");
    
    toast({ 
      title: "Proposal Rejected", 
      description: `"${proposal.title}" has been marked as rejected`,
      variant: "destructive" 
    });
  };

  const handleMarkInReview = () => {
    updateProposalStatus(proposal.id, "IN_REVIEW");
    
    toast({ 
      title: "Status Updated", 
      description: `"${proposal.title}" is now in review` 
    });
  };

  const handleExportPdf = async () => {
    try {
      const base = getApiBaseUrl();
      const url = `${base}/api/proposals/${proposal.id}/export/pdf`;
      const token = localStorage.getItem('auth_token');
      
      toast({ title: 'Exporting PDF', description: 'Generating your PDF...' });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to export PDF' }));
        throw new Error(error.error || 'Failed to export PDF');
      }

      // Get the PDF blob and download it
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `proposal-${proposal.title.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      toast({ 
        title: 'PDF Downloaded', 
        description: 'Your proposal has been exported successfully.' 
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Failed to export PDF',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteProposal(proposal.id);
    toast({ 
      title: "Proposal Deleted", 
      description: `"${proposal.title}" has been deleted` 
    });
    navigate("/proposals");
  };



  const getScoreColor = (score: number) => {
    if (score >= 76) return "text-emerald-600";
    if (score >= 51) return "text-amber-600";
    return "text-red-600";
  };

  const getScoreBg = (score: number) => {
    if (score >= 76) return "border-emerald-200 bg-emerald-50";
    if (score >= 51) return "border-amber-200 bg-amber-50";
    return "border-red-200 bg-red-50";
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/proposals"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Proposals
        </Link>
        
        <motion.div 
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col lg:flex-row lg:items-start justify-between gap-4"
        >
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground mb-3">
              {proposal.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {proposal.metadata.clientName && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  {proposal.metadata.clientName}
                </span>
              )}
              {proposal.metadata.dealSize && (
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" />
                  ${proposal.metadata.dealSize.toLocaleString()}
                </span>
              )}
              {proposal.metadata.discount && (
                <span className="flex items-center gap-1.5">
                  <Percent className="w-4 h-4" />
                  {proposal.metadata.discount}% discount
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formatIST(new Date(proposal.createdAt), "MMM dd, yyyy")}
              </span>
            </div>
          </div>
          <StatusBadge status={proposal.status} showIcon className="text-sm" />
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Risk Overview */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="glass-panel"
          >
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Risk Overview
              </h2>
            </div>
            
            {/* Main Score */}
            <div className="text-center mb-8 pb-8 border-b border-border">
              <div className={`inline-flex items-center justify-center w-28 h-28 rounded-full border-4 relative mb-4 ${getScoreBg(proposal.readinessScore)}`}>
                <span className={`text-4xl font-bold ${getScoreColor(proposal.readinessScore)}`}>
                  {proposal.readinessScore}
                </span>
                <span className="text-lg text-muted-foreground">%</span>
              </div>
              <p className="text-sm text-muted-foreground font-medium">Readiness Score</p>
            </div>

            {/* Risk Breakdown */}
            <div className="space-y-4">
              <RiskBar risk={riskReport.legalRisk} label="Legal Risk" />
              <RiskBar risk={riskReport.pricingRisk} label="Pricing Risk" />
              <RiskBar risk={riskReport.structuralRisk} label="Structural Risk" />
            </div>
          </motion.div>

          {/* Findings & Recommendations (paired: one finding + its recommendation per card) */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="glass-panel"
          >
            <div className="flex items-center gap-2 mb-5">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <Lightbulb className="w-5 h-5 text-emerald-600" />
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Key Findings & Recommendations
              </h2>
              <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {Math.max(riskReport.findings.length, riskReport.recommendations.length)} items
              </span>
            </div>
            <div className="space-y-4">
              {riskReport.findings.length === 0 && riskReport.recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No issues found. Run analysis to evaluate this proposal.
                </p>
              ) : (
                Array.from({ length: Math.max(riskReport.findings.length, riskReport.recommendations.length) }).map((_, index) => {
                  const finding = riskReport.findings[index];
                  const rec = riskReport.recommendations[index];
                  const config = finding ? severityConfig[finding.level] : severityConfig.LOW;
                  const Icon = config.icon;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + index * 0.05, duration: 0.3 }}
                      className="rounded-lg border border-border overflow-hidden"
                    >
                      {finding && (
                        <div className={`flex items-start gap-3 p-4 border-l-[3px] ${config.bg} ${config.borderColor}`}>
                          <Icon className={`w-5 h-5 ${config.color} shrink-0 mt-0.5`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Key finding {index + 1}
                            </p>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-semibold ${config.color}`}>
                                {config.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {finding.type.replace(/_/g, " ")}
                              </span>
                            </div>
                            <p className="text-sm text-foreground">{finding.message}</p>
                            {finding.location && (
                              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                {finding.location}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {rec && (
                        <div className="flex items-start gap-3 p-4 bg-emerald-50/50 border-t border-border/60">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                            <Lightbulb className="w-3.5 h-3.5 text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Recommendation {index + 1}
                            </p>
                            <p className="text-sm font-medium text-foreground mb-1">
                              {rec.suggestion}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {rec.reason}
                              {rec.paragraphId && (
                                <span className="ml-2 text-primary font-medium">
                                  → Section {rec.paragraphId}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="glass-panel sticky top-8"
          >
            <h3 className="font-heading font-semibold text-foreground mb-4">
              Actions
            </h3>
            <div className="space-y-2.5">
              {(() => {
                const isAdmin = localStorage.getItem('userRole') === 'ADMIN';
                if (!isAdmin) return null;
                return (
                  <>
                    {proposal.status !== "APPROVED" && (
                      <Button 
                        className="w-full bg-emerald-600 hover:bg-emerald-700" 
                        onClick={handleApprove}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                    )}
                    {proposal.status !== "REJECTED" && (
                      <Button 
                        variant="destructive" 
                        className="w-full" 
                        onClick={handleReject}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    )}
                    {proposal.status !== "IN_REVIEW" && proposal.status !== "APPROVED" && proposal.status !== "REJECTED" && (
                      <Button 
                        variant="outline" 
                        className="w-full" 
                        onClick={handleMarkInReview}
                      >
                        Mark as In Review
                      </Button>
                    )}
                  </>
                );
              })()}
              
              <div className="border-t border-border pt-3 mt-3 space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  size="sm"
                  onClick={handleExportPdf}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20" 
                      size="sm"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Proposal</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{proposal.title}"? This action cannot be undone and will permanently remove the proposal and all associated data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting ? "Deleting..." : "Delete Proposal"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </motion.div>

          {/* Metadata */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="glass-panel"
          >
            <h3 className="font-heading font-semibold text-foreground mb-4">
              Details
            </h3>
            <dl className="space-y-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Region</dt>
                <dd className="font-medium text-foreground text-right">
                  {proposal.metadata.region || "Not specified"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Industry</dt>
                <dd className="font-medium text-foreground text-right">
                  {proposal.metadata.industry || "Not specified"}
                </dd>
              </div>
              <div className="border-t border-border pt-4 flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium text-foreground text-right">
                  {formatIST(new Date(proposal.createdAt), "MMM d, yyyy")}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Last Updated</dt>
                <dd className="font-medium text-foreground text-right">
                  {formatIST(new Date(proposal.updatedAt), "MMM d, yyyy")}
                </dd>
              </div>
            </dl>
          </motion.div>
        </div>
      </div>
    </div>
  );
}