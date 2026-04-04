import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Search, Filter, SlidersHorizontal, FileText, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProposalCard } from "@/components/proposals/ProposalCard";
import { useProposals } from "@/context/useProposals";
import { ProposalStatus } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { proposalsApi } from "@/lib/api-client";

type SortOption = "date" | "score" | "title";
type StatusFilter = "ALL" | ProposalStatus;

export default function Proposals() {
  const { proposals, refreshProposals } = useProposals();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredProposals = useMemo(() => {
    let result = [...proposals];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.metadata.clientName?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Status order: PENDING first, then approved/rejected (and in-review)
    const statusOrder: Record<ProposalStatus, number> = {
      PENDING: 0,
      IN_REVIEW: 1,
      APPROVED: 2,
      REJECTED: 3,
    };

    // Sort: first by status (pending at start), then by selected sort option
    result.sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;

      switch (sortBy) {
        case "date":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "score":
          return b.readinessScore - a.readinessScore;
        case "title":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }, [proposals, searchQuery, statusFilter, sortBy]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredProposals.map(p => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectProposal = (proposalId: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(proposalId);
    } else {
      newSelected.delete(proposalId);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const confirmed = confirm(
      `Are you sure you want to delete ${selectedIds.size} proposal${selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const deletePromises = Array.from(selectedIds).map(id => 
        proposalsApi.delete(id)
      );

      await Promise.all(deletePromises);

      toast({
        title: "Proposals deleted",
        description: `Successfully deleted ${selectedIds.size} proposal${selectedIds.size > 1 ? 's' : ''}`,
      });

      setSelectedIds(new Set());
      await refreshProposals();
    } catch (error: any) {
      toast({
        title: "Failed to delete proposals",
        description: error?.message || "An error occurred while deleting",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const allSelected = filteredProposals.length > 0 && selectedIds.size === filteredProposals.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredProposals.length;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.35, ease: "easeOut" as const }
    },
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground mb-1">
            Proposals
          </h1>
          <p className="text-muted-foreground text-[15px]">
            Manage and review all your proposals
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="flex items-center gap-2"
        >
          <Button variant="outline" asChild>
            <Link to="/proposals/upload">
              <Upload className="w-4 h-4 mr-1.5" />
              Upload
            </Link>
          </Button>
          <Button asChild>
            <Link to="/proposals/new">
              <Plus className="w-4 h-4 mr-1.5" />
              Create New
            </Link>
          </Button>
        </motion.div>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35 }}
        className="glass-panel mb-6 p-4"
      >
        <div className="flex flex-col md:flex-row gap-3">
          {/* Select All Checkbox */}
          {filteredProposals.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                className={someSelected ? "data-[state=checked]:bg-primary/50" : ""}
              />
              <label className="text-sm font-medium cursor-pointer select-none" onClick={() => handleSelectAll(!allSelected)}>
                Select All ({selectedIds.size})
              </label>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  className="ml-2"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete ({selectedIds.size})
                </Button>
              )}
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground hidden md:block" />
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="IN_REVIEW">In Review</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground hidden md:block" />
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as SortOption)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date (Newest)</SelectItem>
                <SelectItem value="score">Score (Highest)</SelectItem>
                <SelectItem value="title">Title (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      {/* Results */}
      {filteredProposals.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-panel text-center py-14"
        >
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-muted flex items-center justify-center">
            <FileText className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="font-heading font-semibold text-foreground mb-1.5">
            No proposals found
          </h3>
          <p className="text-sm text-muted-foreground mb-5">
            Try adjusting your search or filters
          </p>
          <Button variant="outline" onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); }}>
            Clear filters
          </Button>
        </motion.div>
      ) : (
        <>
          <div className="text-sm text-muted-foreground mb-4">
            Showing <span className="font-medium text-foreground">{filteredProposals.length}</span> proposal{filteredProposals.length !== 1 ? "s" : ""}
          </div>
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {filteredProposals.map((proposal) => (
              <motion.div key={proposal.id} variants={itemVariants}>
                <ProposalCard 
                  proposal={proposal}
                  isSelected={selectedIds.has(proposal.id)}
                  onSelect={(checked) => handleSelectProposal(proposal.id, checked)}
                />
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </div>
  );
}