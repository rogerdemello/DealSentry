import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";

interface RiskBarProps {
  risk: number;
  label: string;
  className?: string;
}

export function RiskBar({ risk, label, className }: RiskBarProps) {
  // Clamp risk to 0-100 range for display
  const displayRisk = Math.min(100, Math.max(0, risk));
  
  const getRiskLevel = (risk: number): { label: string; color: string; bgColor: string; icon: any } => {
    if (risk <= 20) return { 
      label: "Low Risk", 
      color: "text-emerald-600", 
      bgColor: "bg-emerald-500",
      icon: CheckCircle 
    };
    if (risk <= 50) return { 
      label: "Medium Risk", 
      color: "text-amber-600", 
      bgColor: "bg-amber-500",
      icon: AlertCircle 
    };
    if (risk <= 75) return { 
      label: "High Risk", 
      color: "text-orange-600", 
      bgColor: "bg-orange-500",
      icon: AlertTriangle 
    };
    return { 
      label: "Critical Risk", 
      color: "text-red-600", 
      bgColor: "bg-red-500",
      icon: AlertTriangle 
    };
  };

  const riskLevel = getRiskLevel(risk);
  const Icon = riskLevel.icon;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          <Icon className={cn("w-3.5 h-3.5", riskLevel.color)} />
          <span className={cn("text-xs font-semibold", riskLevel.color)}>
            {risk > 100 ? "CRITICAL" : riskLevel.label}
          </span>
        </div>
      </div>
      
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all duration-700 ease-out", riskLevel.bgColor)}
          style={{ width: `${displayRisk}%` }}
        />
        {risk > 100 && (
          <div className="absolute inset-0 bg-red-500 animate-pulse" />
        )}
      </div>
      
      <div className="text-right">
        <span className={cn("text-xs font-mono", riskLevel.color)}>
          {Math.round(risk)}%
        </span>
      </div>
    </div>
  );
}
