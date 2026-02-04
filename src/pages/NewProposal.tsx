import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileEdit, LayoutTemplate, Plus, FileText, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mockTemplates } from "@/data/mockData";
import { Template, TemplateType } from "@/types";
import { useToast } from "@/hooks/use-toast";

const templateTypeLabels: Record<TemplateType, string> = {
  SALES_PROPOSAL: "Sales Proposal",
  MSA: "MSA",
  SOW: "Statement of Work",
  NDA: "NDA",
  OTHER: "Other",
};

const templateTypeColors: Record<TemplateType, string> = {
  SALES_PROPOSAL: "bg-primary/10 text-primary",
  MSA: "bg-info/10 text-info",
  SOW: "bg-success/10 text-success",
  NDA: "bg-warning/10 text-warning",
  OTHER: "bg-muted text-muted-foreground",
};

export default function NewProposal() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>(mockTemplates);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<TemplateType>("SALES_PROPOSAL");
  const [formContent, setFormContent] = useState("");

  const handleCreateTemplate = () => {
    const newTemplate: Template = {
      id: Date.now().toString(),
      name: formName,
      description: formDescription,
      type: formType,
      content: formContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setTemplates([...templates, newTemplate]);
    setIsModalOpen(false);
    setFormName("");
    setFormDescription("");
    setFormContent("");
    
    toast({ title: "Template created successfully" });
  };

  const handleUseTemplate = (template: Template) => {
    setSelectedTemplateId(template.id);
    toast({
      title: "Template selected",
      description: `Creating proposal from "${template.name}"`,
    });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        to="/proposals"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Proposals
      </Link>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-10"
      >
        <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground mb-1.5">
          Create New Proposal
        </h1>
        <p className="text-muted-foreground text-[15px]">
          Create from scratch or use a template
        </p>
      </motion.div>

      {/* Action Cards: Custom new proposal, Use template */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="grid md:grid-cols-2 gap-5 mb-10"
      >
        {/* Custom new proposal */}
        <Link to="/proposals/create" className="block">
          <div className="glass-panel text-center group cursor-pointer h-full">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:scale-105 transition-transform">
              <FileEdit className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
              Custom new proposal
            </h3>
            <p className="text-muted-foreground text-sm mb-5">
              Create a new proposal from scratch
            </p>
            <Button variant="outline" className="w-full">
              Create from scratch
            </Button>
          </div>
        </Link>

        {/* Use template */}
        <div 
          className="glass-panel text-center group cursor-pointer h-full"
          onClick={() => setShowTemplates(!showTemplates)}
        >
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-accent/10 flex items-center justify-center group-hover:scale-105 transition-transform">
            <LayoutTemplate className="w-7 h-7 text-accent" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
            Use template
          </h3>
          <p className="text-muted-foreground text-sm mb-5">
            Start from a professional template
          </p>
          <Button variant="outline" className="w-full">
            {showTemplates ? "Hide Templates" : "Browse Templates"}
          </Button>
        </div>
      </motion.div>

      {/* Template Library */}
      {showTemplates && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Template Library
            </h2>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Create Template
            </Button>
          </div>

          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid md:grid-cols-2 gap-4"
          >
            {templates.map((template) => {
              const isSelected = selectedTemplateId === template.id;
              
              return (
                <motion.div
                  key={template.id}
                  variants={itemVariants}
                  className={`glass-panel cursor-pointer transition-all ${
                    isSelected ? "ring-2 ring-primary ring-offset-2" : ""
                  }`}
                  onClick={() => handleUseTemplate(template)}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading font-semibold text-foreground truncate">
                          {template.name}
                        </h3>
                        {isSelected && (
                          <Check className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </div>
                      <span className={`inline-block px-2 py-0.5 mt-1 text-[11px] rounded font-medium ${templateTypeColors[template.type]}`}>
                        {templateTypeLabels[template.type]}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {template.description}
                  </p>
                  <Button
                    size="sm"
                    className="w-full"
                    variant={isSelected ? "default" : "outline"}
                  >
                    {isSelected ? "Selected" : "Use Template"}
                  </Button>
                </motion.div>
              );
            })}
          </motion.div>
        </motion.div>
      )}

      {/* Create Template Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">Create New Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="templateName" className="text-sm font-medium">Template Name</Label>
              <Input
                id="templateName"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Enterprise Sales Proposal"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="templateDescription" className="text-sm font-medium">Description</Label>
              <Input
                id="templateDescription"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description of the template..."
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="templateType" className="text-sm font-medium">Type</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as TemplateType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(templateTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="templateContent" className="text-sm font-medium">Content</Label>
              <Textarea
                id="templateContent"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Enter your template content here..."
                rows={8}
                className="mt-1.5 font-mono text-sm"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button onClick={handleCreateTemplate} className="flex-1">
                Save Template
              </Button>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}