import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FileEdit, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProposals } from "@/context/ProposalContext";
import { useToast } from "@/hooks/use-toast";

export default function CreateProposal() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { addProposal, isApiConnected } = useProposals();
  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName?.trim()) {
      toast({
        title: "Company name required",
        description: "Please enter the company name",
        variant: "destructive",
      });
      return;
    }

    if (!title?.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a proposal title",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const newProposal = await addProposal({
        title: title.trim(),
        content: content.trim() || "(No content yet)",
        status: "PENDING",
        metadata: {
          clientName: companyName.trim(),
          region: "North America",
          currency: "USD",
          industry: "General",
        },
        userId: "current-user",
        readinessScore: 0,
      });

      if (newProposal) {
        if (isApiConnected) {
          toast({
            title: "Proposal created",
            description: "Analysis will run automatically.",
          });
        }
        navigate(`/proposals/${newProposal.id}/review`);
      }
    } catch (err) {
      toast({
        title: "Failed to create proposal",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <Link
        to="/proposals"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Proposals
      </Link>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <h1 className="font-heading text-2xl font-semibold text-foreground mb-1.5">
          Custom new proposal
        </h1>
        <p className="text-muted-foreground text-[15px]">
          Create a new proposal from scratch
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        onSubmit={handleSubmit}
        className="glass-panel space-y-5"
      >
        <div>
          <Label htmlFor="companyName" className="text-sm font-medium">
            Company name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="companyName"
            placeholder="e.g., Acme Corporation"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1.5"
            required
          />
        </div>

        <div>
          <Label htmlFor="title" className="text-sm font-medium">
            Proposal title <span className="text-destructive">*</span>
          </Label>
          <Input
            id="title"
            placeholder="e.g., Cloud Migration Proposal"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1.5"
            required
          />
        </div>

        <div>
          <Label htmlFor="content" className="text-sm font-medium">
            Content <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="content"
            placeholder="Add proposal content here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-1.5 min-h-[120px] resize-y"
            rows={5}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            className="flex-1"
            disabled={isSubmitting || !companyName?.trim() || !title?.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <FileEdit className="w-4 h-4 mr-2" />
                Create proposal
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/proposals")}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </motion.form>
    </div>
  );
}
