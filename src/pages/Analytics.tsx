import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { FileText, Clock, BarChart3, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { analyticsApi, type AnalyticsSummary, type AnalyticsDelta } from "@/lib/api-client";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  IN_REVIEW: "#3b82f6",
  APPROVED: "#22c55e",
  REJECTED: "#ef4444",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact" }).format(n);

function DeltaBadge({ delta, suffix = "" }: { delta: AnalyticsDelta; suffix?: string }) {
  const Icon = delta.up ? TrendingUp : TrendingDown;
  const positive = delta.up;
  const text = delta.changePct !== 0 ? `${delta.up ? "+" : ""}${delta.changePct}%` : `${delta.change >= 0 ? "+" : ""}${delta.change}${suffix}`;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
        positive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
      }`}
    >
      <Icon className="w-3 h-3" />
      {text}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel p-5">
      <h3 className="font-heading text-sm font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    analyticsApi
      .getSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load analytics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="max-w-7xl mx-auto py-20 text-center text-muted-foreground">Loading analytics…</div>;
  }
  if (error) {
    return <div className="max-w-7xl mx-auto py-20 text-center text-red-600">{error}</div>;
  }
  if (!summary) return null;

  const { headline, statusBreakdown, riskAverages, createdPerWeek, discountDistribution, dealValueByRegion } = summary;

  const cards = [
    { label: "Total Proposals", value: headline.total.value, delta: headline.total.delta, icon: FileText, color: "text-primary", bg: "bg-primary/8", border: "border-l-primary" },
    { label: "Pending Review", value: headline.pending.value, delta: headline.pending.delta, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", border: "border-l-amber-500" },
    { label: "Avg. Readiness", value: `${headline.avgReadiness.value}%`, delta: headline.avgReadiness.delta, icon: BarChart3, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-l-emerald-500" },
    { label: "Needs Attention", value: headline.needsAttention.value, delta: headline.needsAttention.delta, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", border: "border-l-red-500" },
  ];

  const riskBars = [
    { name: "Legal", value: riskAverages.legal },
    { name: "Pricing", value: riskAverages.pricing },
    { name: "Structural", value: riskAverages.structural },
  ];

  const hasRegions = dealValueByRegion.length > 0;

  return (
    <div className="max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground mb-1.5">Analytics</h1>
        <p className="text-muted-foreground text-[15px]">Proposal activity, risk, and pricing trends across your team.</p>
      </motion.div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`glass-panel p-5 border-l-[3px] ${c.border}`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${c.color}`} />
                </div>
                <DeltaBadge delta={c.delta} />
              </div>
              <div className="text-2xl md:text-3xl font-semibold text-foreground mb-1 tracking-tight">{c.value}</div>
              <div className="text-sm text-muted-foreground">{c.label}</div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="Proposals created (last 12 weeks)">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={createdPerWeek} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="created" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="weekStart" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#created)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Status breakdown">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusBreakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label>
                {statusBreakdown.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Discount distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={discountDistribution} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Average risk by category">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={riskBars} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Deal value by region">
          {hasRegions ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dealValueByRegion} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
                <YAxis type="category" dataKey="region" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="total" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
              No deal value data yet.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
