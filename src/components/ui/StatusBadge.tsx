import { ProposalStatus } from "@/types";
import { cn } from "@/lib/utils";
import { Clock, CheckCircle, XCircle, Eye } from "lucide-react";

interface StatusBadgeProps {
  status: ProposalStatus;
  className?: string;
  showIcon?: boolean;
}

const statusConfig: Record<ProposalStatus, { 
  className: string; 
  label: string;
  icon: React.ElementType;
}> = {
  PENDING: { className: "badge-pending", label: "Pending", icon: Clock },
  APPROVED: { className: "badge-approved", label: "Approved", icon: CheckCircle },
  REJECTED: { className: "badge-rejected", label: "Rejected", icon: XCircle },
  IN_REVIEW: { className: "badge-review", label: "In Review", icon: Eye },
};

export function StatusBadge({ status, className, showIcon = false }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.PENDING;
  const Icon = config.icon;
  
  return (
    <span className={cn("inline-flex items-center gap-1.5", config.className, className)}>
      {showIcon && <Icon className="w-3 h-3" />}
      {config.label}
    </span>
  );
}