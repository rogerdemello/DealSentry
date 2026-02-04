import { cn } from "@/lib/utils";

interface ScoreBarProps {
  score: number;
  label?: string;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ScoreBar({ 
  score, 
  label = "Readiness Score", 
  showPercentage = true,
  size = "md",
  className 
}: ScoreBarProps) {
  const getScoreClass = (score: number): string => {
    if (score >= 76) return "score-bar-success";
    if (score >= 51) return "score-bar-warning";
    return "score-bar-danger";
  };

  const getScoreColor = (score: number): string => {
    if (score >= 76) return "text-success";
    if (score >= 51) return "text-warning";
    return "text-risk-high";
  };

  const heights = {
    sm: "h-1.5",
    md: "h-2",
    lg: "h-2.5",
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        {showPercentage && (
          <span className={cn("text-sm font-semibold", getScoreColor(score))}>
            {score}%
          </span>
        )}
      </div>
      <div className={cn("bg-muted rounded-full overflow-hidden", heights[size])}>
        <div
          className={cn("h-full transition-all duration-700 ease-out", getScoreClass(score))}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}