import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, FileText, TrendingUp, AlertTriangle, ArrowRight, Clock, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProposalCard } from "@/components/proposals/ProposalCard";
import { useProposals } from "@/context/ProposalContext";

export default function Dashboard() {
  const { proposals } = useProposals();
  
  const recentProposals = proposals.slice(0, 3);
  const hasProposals = proposals.length > 0;

  // Stats
  const totalProposals = proposals.length;
  const pendingCount = proposals.filter(p => p.status === "PENDING").length;
  const avgScore = totalProposals > 0 
    ? Math.round(proposals.reduce((acc, p) => acc + p.readinessScore, 0) / totalProposals)
    : 0;
  const atRiskCount = proposals.filter(p => p.readinessScore < 60).length;

  const stats = [
    { 
      label: "Total Proposals", 
      value: totalProposals, 
      icon: FileText, 
      color: "text-primary",
      bgColor: "bg-primary/8",
      borderColor: "border-l-primary",
      trend: "+12%",
      trendUp: true
    },
    { 
      label: "Pending Review", 
      value: pendingCount, 
      icon: Clock, 
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      borderColor: "border-l-amber-500",
      trend: "-2",
      trendUp: false
    },
    { 
      label: "Avg. Score", 
      value: `${avgScore}%`, 
      icon: BarChart3, 
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      borderColor: "border-l-emerald-500",
      trend: "+5%",
      trendUp: true
    },
    { 
      label: "Needs Attention", 
      value: atRiskCount, 
      icon: AlertTriangle, 
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-l-red-500",
      trend: "-1",
      trendUp: false
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.4, ease: "easeOut" as const }
    },
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground mb-1.5">
          Welcome back
        </h1>
        <p className="text-muted-foreground text-[15px]">
          Here's an overview of your team's proposal activity.
        </p>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
      >
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              variants={itemVariants}
              className={`glass-panel p-5 hover-lift cursor-default group border-l-[3px] ${stat.borderColor}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-lg ${stat.bgColor} flex items-center justify-center transition-transform duration-300 group-hover:scale-105`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  stat.trendUp 
                    ? "bg-emerald-50 text-emerald-600" 
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {stat.trend}
                </span>
              </div>
              <div className="text-2xl md:text-3xl font-semibold text-foreground mb-1 tracking-tight">
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Content */}
      {!hasProposals ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="glass-panel text-center py-16 max-w-lg mx-auto"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
            No proposals yet
          </h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-[15px]">
            Upload your first proposal to get started with AI-powered compliance review.
          </p>
          <Button asChild size="lg">
            <Link to="/proposals/upload">
              <Upload className="w-5 h-5 mr-2" />
              Upload Proposal
            </Link>
          </Button>
        </motion.div>
      ) : (
        <>
          {/* Section Header */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-between mb-5"
          >
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Recent Proposals
            </h2>
            <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
              <Link to="/proposals" className="flex items-center gap-1.5">
                View all
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </motion.div>

          {/* Proposals Grid */}
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {recentProposals.map((proposal, index) => (
              <motion.div key={proposal.id} variants={itemVariants}>
                <ProposalCard proposal={proposal} index={index} />
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </div>
  );
}