import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FileEdit, ArrowLeft, Loader2, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProposals } from "@/context/ProposalContext";
import { useToast } from "@/hooks/use-toast";
import { proposalsApi } from "@/lib/api-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CreateProposal() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { addProposal, isApiConnected, refreshProposals } = useProposals();
  
  // Manual form fields
  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  
  // AI generation field
  const [aiQuery, setAiQuery] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("ai");

  const handleAiGenerate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!aiQuery?.trim()) {
      toast({
        title: "Query required",
        description: "Please describe the proposal you want to create",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const newProposal = await proposalsApi.generateFromNaturalLanguage(aiQuery.trim());

      if (newProposal) {
        // Refresh proposals to ensure the new proposal is in the context
        await refreshProposals();
        
        toast({
          title: "Proposal generated",
          description: "AI has created your proposal successfully!",
        });
        navigate(`/proposals/${newProposal.id}/review`);
      }
    } catch (err) {
      toast({
        title: "Failed to generate proposal",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
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
        // Ensure the context is refreshed before navigation
        await refreshProposals();
        
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
    <div className="max-w-2xl mx-auto">
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

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="glass-panel"
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Generation
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Manual Entry
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai">
            <form onSubmit={handleAiGenerate} className="space-y-5">
              <div>
                <Label htmlFor="aiQuery" className="text-sm font-medium">
                  Describe your proposal <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Example: "Make a proposal for company named 'ASW' for a cloud migration project worth $150,000 with a 15% discount. Include sections on project timeline, deliverables, and support."
                </p>
                <Textarea
                  id="aiQuery"
                  placeholder="Make a proposal for company named 'Company XYZ' where the content is as follows..."
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  className="min-h-[180px] resize-y"
                  rows={8}
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSubmitting || !aiQuery?.trim()}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate proposal
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
            </form>
          </TabsContent>

          <TabsContent value="manual">
            <form onSubmit={handleManualSubmit} className="space-y-5">
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
            </form>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
