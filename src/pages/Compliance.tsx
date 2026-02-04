import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Filter, Pencil, Trash2, Power, Shield, Zap, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mockRules } from "@/data/mockData";
import { Rule, RuleType } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { rulesApi } from "@/lib/api-client";

const ruleTypeLabels: Record<RuleType, string> = {
  DISCOUNT: "Discount",
  LEGAL_TERM: "Legal Term",
  PRICING: "Pricing",
  PAYMENT: "Payment",
  STRUCTURAL: "Structural",
  WORKFLOW: "Workflow",
};

const ruleTypeColors: Record<RuleType, string> = {
  DISCOUNT: "bg-warning/10 text-warning border-l-warning",
  LEGAL_TERM: "bg-info/10 text-info border-l-info",
  PRICING: "bg-success/10 text-success border-l-success",
  PAYMENT: "bg-accent/10 text-accent border-l-accent",
  STRUCTURAL: "bg-primary/10 text-primary border-l-primary",
  WORKFLOW: "bg-muted text-muted-foreground border-l-muted-foreground",
};

const ruleTypeBadgeColors: Record<RuleType, string> = {
  DISCOUNT: "bg-warning/10 text-warning",
  LEGAL_TERM: "bg-info/10 text-info",
  PRICING: "bg-success/10 text-success",
  PAYMENT: "bg-accent/10 text-accent",
  STRUCTURAL: "bg-primary/10 text-primary",
  WORKFLOW: "bg-muted text-muted-foreground",
};

export default function Compliance() {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>(mockRules);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = localStorage.getItem("userRole") === "ADMIN";

  useEffect(() => {
    let mounted = true;
    rulesApi
      .getAll()
      .then((data) => {
        if (mounted && Array.isArray(data) && data.length > 0) setRules(data);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<RuleType>("DISCOUNT");
  const [formDescription, setFormDescription] = useState("");
  const [formLogicValue, setFormLogicValue] = useState("");

  const filteredRules = rules.filter((rule) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!rule.name.toLowerCase().includes(query) && 
          !rule.description?.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (typeFilter !== "ALL" && rule.type !== typeFilter) return false;
    if (showActiveOnly && !rule.isActive) return false;
    return true;
  });

  const activeRulesCount = rules.filter(r => r.isActive).length;

  const openCreateModal = () => {
    setEditingRule(null);
    setFormName("");
    setFormType("DISCOUNT");
    setFormDescription("");
    setFormLogicValue("");
    setIsModalOpen(true);
  };

  const openEditModal = (rule: Rule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormType(rule.type);
    setFormDescription(rule.description || "");
    setFormLogicValue(JSON.stringify(Object.values(rule.logic)[0]));
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const logic = getLogicObject();
    try {
      if (editingRule) {
        const updated = await rulesApi.update(editingRule.id, {
          name: formName,
          type: formType,
          description: formDescription,
          logic,
          isActive: true,
        });
        setRules(rules.map((r) => (r.id === editingRule.id ? updated : r)));
        toast({ title: "Rule updated successfully" });
      } else {
        const created = await rulesApi.create({
          name: formName,
          type: formType,
          description: formDescription,
          logic,
          isActive: true,
        });
        setRules([created, ...rules]);
        toast({ title: "Rule created successfully" });
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      toast({
        title: editingRule ? "Update failed" : "Create failed",
        description: err instanceof Error ? err.message : "Only administrators can create or edit rules",
        variant: "destructive",
      });
    }
  };

  const getLogicObject = () => {
    switch (formType) {
      case "DISCOUNT":
        return { maxDiscount: parseInt(formLogicValue) || 25 };
      case "PRICING":
        return { minDealSize: parseInt(formLogicValue) || 10000 };
      case "PAYMENT":
        return { maxPaymentDays: parseInt(formLogicValue) || 90 };
      case "LEGAL_TERM":
        return { requiredTerms: formLogicValue.split(",").map((t) => t.trim()) };
      case "STRUCTURAL":
        return { requiredSections: formLogicValue.split(",").map((s) => s.trim()) };
      case "WORKFLOW":
        return { approverRoles: formLogicValue.split(",").map((r) => r.trim()) };
      default:
        return {};
    }
  };

  const toggleRuleActive = async (ruleId: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;
    try {
      const updated = await rulesApi.update(ruleId, { ...rule, isActive: !rule.isActive });
      setRules(rules.map((r) => (r.id === ruleId ? updated : r)));
      toast({ title: "Rule updated" });
    } catch (err) {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    try {
      await rulesApi.delete(ruleId);
      setRules(rules.filter((r) => r.id !== ruleId));
      toast({ title: "Rule deleted" });
    } catch (err) {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.04 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground">
              Compliance Rules
            </h1>
          </div>
          <p className="text-muted-foreground text-[15px] ml-[52px]">
            {activeRulesCount} active rules
            {!isAdmin && (
              <span className="inline-flex items-center gap-1 ml-2 text-xs text-muted-foreground">
                <Lock className="w-3 h-3" />
                Read only
              </span>
            )}
          </p>
        </motion.div>
        {isAdmin && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.35 }}
          >
            <Button onClick={openCreateModal}>
              <Plus className="w-4 h-4 mr-1.5" />
              Create Rule
            </Button>
          </motion.div>
        )}
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35 }}
        className="glass-panel mb-6 p-4"
      >
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search rules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground hidden md:block" />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  {Object.entries(ruleTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Switch
                checked={showActiveOnly}
                onCheckedChange={setShowActiveOnly}
              />
              <span className="text-muted-foreground whitespace-nowrap">Active only</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Rules Grid */}
      {filteredRules.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel text-center py-14"
        >
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-muted flex items-center justify-center">
            <Shield className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="font-heading font-semibold text-foreground mb-1.5">
            No rules found
          </h3>
          <p className="text-sm text-muted-foreground mb-5">
            {searchQuery || typeFilter !== "ALL" || showActiveOnly
              ? "Try adjusting your filters"
              : isAdmin
                ? "Create your first compliance rule"
                : "No rules match your filters"}
          </p>
          {isAdmin && (
            <Button onClick={openCreateModal}>
              <Plus className="w-4 h-4 mr-1.5" />
              Create Rule
            </Button>
          )}
        </motion.div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid md:grid-cols-2 gap-4"
        >
          {filteredRules.map((rule) => (
            <motion.div
              key={rule.id}
              variants={itemVariants}
              className={`glass-panel border-l-[3px] ${ruleTypeColors[rule.type]}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-heading font-semibold text-foreground truncate">
                      {rule.name}
                    </h3>
                    {rule.isActive && (
                      <Zap className="w-3.5 h-3.5 text-success shrink-0" />
                    )}
                  </div>
                  <span className={`inline-block px-2 py-0.5 text-[11px] rounded font-medium ${ruleTypeBadgeColors[rule.type]}`}>
                    {ruleTypeLabels[rule.type]}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin ? (
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => toggleRuleActive(rule.id)}
                    />
                  ) : (
                    <span className={`text-xs font-medium ${rule.isActive ? "text-success" : "text-muted-foreground"}`}>
                      {rule.isActive ? "Active" : "Inactive"}
                    </span>
                  )}
                </div>
              </div>

              {rule.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {rule.description}
                </p>
              )}

              <div className="text-xs text-muted-foreground mb-4 font-mono bg-muted/40 p-2.5 rounded-md overflow-hidden">
                <span className="text-foreground/70">{JSON.stringify(rule.logic)}</span>
              </div>

              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(rule)}
                    className="flex-1"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteRule(rule.id)}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/8"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingRule ? "Edit Rule" : "Create New Rule"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="ruleName" className="text-sm font-medium">Rule Name</Label>
              <Input
                id="ruleName"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Maximum Discount Threshold"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="ruleType" className="text-sm font-medium">Rule Type</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as RuleType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ruleTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ruleDescription" className="text-sm font-medium">Description</Label>
              <Textarea
                id="ruleDescription"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe what this rule checks for..."
                className="mt-1.5"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="ruleLogic" className="text-sm font-medium">
                {formType === "DISCOUNT" && "Max Discount (%)"}
                {formType === "PRICING" && "Min Deal Size ($)"}
                {formType === "PAYMENT" && "Max Payment Days"}
                {formType === "LEGAL_TERM" && "Required Terms (comma-separated)"}
                {formType === "STRUCTURAL" && "Required Sections (comma-separated)"}
                {formType === "WORKFLOW" && "Approver Roles (comma-separated)"}
              </Label>
              <Input
                id="ruleLogic"
                value={formLogicValue}
                onChange={(e) => setFormLogicValue(e.target.value)}
                placeholder={
                  formType === "DISCOUNT" ? "25" :
                  formType === "PRICING" ? "10000" :
                  formType === "PAYMENT" ? "90" :
                  "item1, item2, item3"
                }
                className="mt-1.5"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button onClick={handleSave} className="flex-1">
                {editingRule ? "Update Rule" : "Create Rule"}
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