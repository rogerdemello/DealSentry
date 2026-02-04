export type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "IN_REVIEW";

export interface ProposalMetadata {
  clientName?: string;
  dealSize?: number;
  discount?: number;
  region?: string;
  currency?: string;
  industry?: string;
}

export interface Proposal {
  id: string;
  title: string;
  content: string;
  status: ProposalStatus;
  metadata: ProposalMetadata;
  userId: string;
  readinessScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface Finding {
  type: string;
  level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  message: string;
  location?: string;
}

export interface Recommendation {
  paragraphId?: string;
  suggestion: string;
  reason: string;
}

export interface RiskReport {
  id: string;
  proposalId: string;
  readinessScore: number;
  legalRisk: number;
  pricingRisk: number;
  structuralRisk: number;
  findings: Finding[];
  recommendations: Recommendation[];
  createdAt: string;
}

export type RuleType = "DISCOUNT" | "LEGAL_TERM" | "PRICING" | "PAYMENT" | "STRUCTURAL" | "WORKFLOW";

export interface Rule {
  id: string;
  name: string;
  type: RuleType;
  description?: string;
  logic: Record<string, any>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationType = "SALESFORCE" | "GMAIL" | "HUBSPOT";

export interface Integration {
  id: string;
  type: IntegrationType;
  name: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  timestamp: string;
  actorId: string;
  actor: {
    name: string | null;
    email: string;
    role: "ADMIN" | "EMPLOYEE";
  };
  proposalId?: string | null;
  proposal?: {
    title: string;
  } | null;
  metadata?: Record<string, any>;
}

export type TemplateType = "SALES_PROPOSAL" | "MSA" | "SOW" | "NDA" | "OTHER";

export interface Template {
  id: string;
  name: string;
  description: string;
  type: TemplateType;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "EMPLOYEE";
  createdAt: string;
  updatedAt: string;
}