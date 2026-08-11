import { memo, useState, useEffect, useCallback } from "react";
import { apiUrl } from "../lib/api";

// ─── Types ───────────────────────────────────────────────────────────
export interface ServiceHealth {
  name: string;
  port: number;
  online: boolean;
  latencyMs: number | null;
  checkedAt: string;
}

export interface SystemHealthData {
  services: ServiceHealth[];
  total: number;
  online: number;
  offline: number;
  checkedAt: string;
}

export interface SystemHealthWidgetProps {
  className?: string;
  autoRefreshIntervalMs?: number;
}

export const SystemHealthWidget = memo(function SystemHealthWidget({
  className = "",
  autoRefreshIntervalMs = 30_000,
}: SystemHealthWidgetProps) {
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [mutedSet, setMutedSet] = useState<Set<string>>(() => new Set());

  const fetchHealth = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const url = apiUrl(`/api/system/health${isManual ? "?refresh=1" : ""}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SystemHealthData = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to fetch system health");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const toggleMute = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMutedSet((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(() => fetchHealth(), autoRefreshIntervalMs);
    return () => clearInterval(timer);
  }, [fetchHealth, autoRefreshIntervalMs]);

  if (loading && !data) {
    return (
      <div className={`rounded-xl border border-white/10 bg-[#0a0a14] p-4 text-white/50 ${className}`}>
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-amber-400 font-bold">⚡ SYSTEM SERVICES</span>
          <span>Checking status...</span>
        </div>
      </div>
    );
  }

  const services = data?.services || [];
  const onlineCount = services.filter((s) => s.online).length;
  const totalCount = services.length;
  const allOnline = onlineCount === totalCount && totalCount > 0;

  return (
    <div className={`rounded-xl border border-white/10 bg-[#0a0a14] p-4 shadow-xl text-white ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-amber-400 tracking-wider">⚡ SYSTEM SERVICES</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              allOnline
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
            }`}
          >
            {onlineCount}/{totalCount} ONLINE
          </span>
        </div>

        <button
          onClick={() => fetchHealth(true)}
          disabled={refreshing}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-white/15 bg-white/5 text-[11px] font-mono text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
        >
          <span className={refreshing ? "animate-spin text-amber-400" : ""}>↻</span>
          <span>{refreshing ? "Checking..." : "Refresh"}</span>
        </button>
      </div>

      {/* Rows List (5 Services) */}
      <div className="space-y-2 mt-3">
        {services.map((s) => {
          const isOnline = s.online;
          const isMuted = mutedSet.has(s.name);

          return (
            <div
              key={s.name}
              className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                isMuted
                  ? "bg-white/[0.02] border-white/5 opacity-50"
                  : isOnline
                  ? "bg-emerald-500/[0.03] border-emerald-500/20"
                  : "bg-red-500/[0.03] border-red-500/20"
              }`}
            >
              {/* Left: Circle Dot + Service Name + Port */}
              <div className="flex items-center gap-3 min-w-0">
                {/* Genuine CSS Circle Dot */}
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: isMuted ? "#64748b" : isOnline ? "#22c55e" : "#ef4444",
                    boxShadow: isMuted
                      ? "none"
                      : isOnline
                      ? "0 0 6px rgba(34, 197, 94, 0.6)"
                      : "0 0 6px rgba(239, 68, 68, 0.6)",
                  }}
                />
                <div className="flex items-center gap-2 min-w-0 font-mono">
                  <span className="text-xs font-semibold text-white/90 truncate">{s.name}</span>
                  <span className="text-[10px] text-white/40">:{s.port}</span>
                </div>
              </div>

              {/* Right: Latency + Time + Mute button */}
              <div className="flex items-center gap-3 font-mono">
                <div className="text-right">
                  <div
                    className={`text-[11px] font-bold ${
                      isMuted ? "text-white/40" : isOnline ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {isOnline && s.latencyMs !== null ? `${s.latencyMs}ms` : "OFFLINE"}
                  </div>
                  {s.checkedAt && (
                    <div className="text-[9px] text-white/30">
                      {new Date(s.checkedAt).toTimeString().split(" ")[0]}
                    </div>
                  )}
                </div>

                <button
                  onClick={(e) => toggleMute(s.name, e)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-all ${
                    isMuted
                      ? "bg-amber-400/10 text-amber-400 border-amber-400/30 font-bold"
                      : "bg-white/5 text-white/40 border-transparent hover:border-white/20 hover:text-white/80"
                  }`}
                >
                  {isMuted ? "Muted" : "Mute"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] font-mono text-white/30 pt-3 mt-3 border-t border-white/5">
        <span>Auto-polling every 30s</span>
        <span>{data?.checkedAt ? `Updated ${new Date(data.checkedAt).toTimeString().split(" ")[0]}` : ""}</span>
      </div>
    </div>
  );
});
