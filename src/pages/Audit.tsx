import { useState, useMemo, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Search, Filter, Download, Lock, AlertCircle, AlertTriangle, Info, ClipboardList, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { auditApi } from "@/lib/api-client";
import { AuditLog } from "@/types";
import { format } from "date-fns";

type Severity = "ALL" | "CRITICAL" | "WARNING" | "INFO";

const getSeverity = (action: string): "CRITICAL" | "WARNING" | "INFO" => {
  const actionLower = action.toLowerCase();
  if (actionLower.includes("blocked") || actionLower.includes("rejected") || actionLower.includes("critical")) {
    return "CRITICAL";
  }
  if (actionLower.includes("override") || actionLower.includes("modified") || actionLower.includes("warning")) {
    return "WARNING";
  }
  return "INFO";
};

const severityConfig = {
  CRITICAL: { icon: AlertCircle, color: "text-risk-high", bg: "bg-risk-high/10", borderColor: "border-l-risk-high" },
  WARNING: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", borderColor: "border-l-warning" },
  INFO: { icon: Info, color: "text-info", bg: "bg-info/10", borderColor: "border-l-info" },
};

export default function Audit() {
  const [userRole, setUserRole] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity>("ALL");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditApi.getAll();
      setLogs(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const role = localStorage.getItem("userRole") || "";
    setUserRole(role);
  }, []);

  useEffect(() => {
    if (userRole === "ADMIN") fetchLogs();
  }, [userRole, fetchLogs]);

  // Refresh when tab becomes visible (user returns to page)
  useEffect(() => {
    if (userRole !== "ADMIN") return;
    const onFocus = () => fetchLogs();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userRole, fetchLogs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const searchableText = [
          log.action,
          log.actor.name,
          log.actor.email,
          log.proposal?.title,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!searchableText.includes(query)) return false;
      }
      
      if (severityFilter !== "ALL" && getSeverity(log.action) !== severityFilter) {
        return false;
      }
      
      return true;
    });
  }, [logs, searchQuery, severityFilter]);

  const handleExport = () => {
    const headers = ["Timestamp", "Action", "Actor Name", "Actor Email", "Actor Role", "Proposal", "Severity"];
    const rows = filteredLogs.map((log) => [
      format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss"),
      log.action,
      log.actor.name || "",
      log.actor.email,
      log.actor.role,
      log.proposal?.title || "",
      getSeverity(log.action),
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_log_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Access denied for non-admins
  if (userRole !== "ADMIN") {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
            Access Denied
          </h2>
          <p className="text-muted-foreground mb-4 text-[15px]">
            Audit logs are only available to administrators.
          </p>
          <p className="text-sm text-muted-foreground">
            Please contact your system administrator for access.
          </p>
        </motion.div>
      </div>
    );
  }

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
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground">
              Audit Trail
            </h1>
          </div>
          <p className="text-muted-foreground text-[15px] ml-[52px]">
            {filteredLogs.length} entries • Complete activity log for compliance
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="flex items-center gap-2"
        >
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchLogs()}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={handleExport} variant="outline" disabled={loading || filteredLogs.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </motion.div>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35 }}
        className="glass-panel mb-6 p-4"
      >
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by action, user, or proposal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground hidden md:block" />
            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as Severity)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Severity</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="WARNING">Warning</SelectItem>
                <SelectItem value="INFO">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
        >
          {error}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchLogs()}>
            Retry
          </Button>
        </motion.div>
      )}

      {/* Audit Log List */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-panel p-0 overflow-hidden"
      >
        {loading ? (
          <div className="py-14 text-center">
            <RefreshCw className="w-10 h-10 mx-auto mb-4 text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Loading audit logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-muted flex items-center justify-center">
              <Search className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="font-heading font-semibold text-foreground mb-1.5">
              No audit logs found
            </h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredLogs.map((log, index) => {
              const severity = getSeverity(log.action);
              const SeverityIcon = severityConfig[severity].icon;
              
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02, duration: 0.25 }}
                  className={`p-5 flex items-start gap-4 hover:bg-muted/20 transition-colors border-l-[3px] ${severityConfig[severity].borderColor}`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${severityConfig[severity].bg}`}>
                    <SeverityIcon className={`w-4 h-4 ${severityConfig[severity].color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <p className="text-sm text-foreground font-medium">
                        {log.action}
                      </p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${severityConfig[severity].bg} ${severityConfig[severity].color}`}>
                        {severity}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(log.timestamp), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                      <span>
                        by <span className="text-foreground font-medium">{log.actor.name || log.actor.email}</span>
                        <span className={`ml-1.5 px-1.5 py-0.5 rounded ${
                          log.actor.role === "ADMIN"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {log.actor.role}
                        </span>
                      </span>
                      {log.proposal?.title && (
                        <span className="text-primary">
                          → {log.proposal.title}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}