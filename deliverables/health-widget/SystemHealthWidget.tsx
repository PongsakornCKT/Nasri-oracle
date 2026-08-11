import { memo, useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────
export interface ServiceHealthStatus {
  id: string;
  name: string;
  port: number;
  url: string;
  status: "online" | "offline";
  statusCode: number | null;
  latencyMs: number;
  lastChecked: string;
  muted: boolean;
}

export interface SystemHealthSummary {
  services: ServiceHealthStatus[];
  total: number;
  online: number;
  offline: number;
  updatedAt: string;
}

// Fallback API resolver if not imported from ../lib/api
function resolveApiUrl(path: string): string {
  try {
    // Attempt relative or host-param resolution
    const params = new URLSearchParams(window.location.search);
    const hostParam = params.get("host");
    if (hostParam) return `https://${hostParam}${path}`;
  } catch {}
  return path;
}

// ─── Component Props ─────────────────────────────────────────────────
export interface SystemHealthWidgetProps {
  className?: string;
  autoRefreshIntervalMs?: number;
}

export const SystemHealthWidget = memo(function SystemHealthWidget({
  className = "",
  autoRefreshIntervalMs = 15_000,
}: SystemHealthWidgetProps) {
  const [data, setData] = useState<SystemHealthSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchHealth = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const url = resolveApiUrl(`/api/system-health${isManual ? "?refresh=1" : ""}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SystemHealthSummary = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to fetch system health");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const toggleMute = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const url = resolveApiUrl("/api/system-health/mute");
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      // Optimistic local update
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          services: prev.services.map((s) => (s.id === id ? { ...s, muted: !s.muted } : s)),
        };
      });
    } catch (err) {
      console.warn("[SystemHealthWidget] Mute toggle failed:", err);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(() => fetchHealth(), autoRefreshIntervalMs);
    return () => clearInterval(timer);
  }, [fetchHealth, autoRefreshIntervalMs]);

  if (loading && !data) {
    return (
      <div className={`rounded-xl border border-white/10 bg-[#0a0a14] p-4 text-white/50 ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-400/90">⚡ System Services Status</span>
          <span className="text-xs text-white/40">Checking ports...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-400 ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-red-400">⚠️ System Health Monitor Offline</span>
          <button
            onClick={() => fetchHealth(true)}
            className="rounded border border-red-500/30 px-2 py-1 text-[10px] hover:bg-red-500/20 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const services = data?.services || [];
  const onlineCount = data?.online || 0;
  const totalCount = data?.total || services.length;
  const allOnline = onlineCount === totalCount && totalCount > 0;

  return (
    <div
      className={`relative rounded-xl border border-white/10 bg-[#0a0a14] p-4 transition-all duration-300 ${className}`}
      style={{
        boxShadow: allOnline ? "0 0 16px rgba(34,197,94,0.06)" : "0 0 16px rgba(239,68,68,0.06)",
      }}
    >
      {/* Widget Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-amber-400 tracking-wide">⚡ SYSTEM SERVICES STATUS</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              allOnline ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
            }`}
          >
            {onlineCount}/{totalCount} ONLINE
          </span>
        </div>

        <button
          onClick={() => fetchHealth(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/15 bg-white/5 text-[11px] text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
          title="Refresh system health status"
        >
          <svg
            className={`w-3 h-3 ${refreshing ? "animate-spin text-amber-400" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>{refreshing ? "Checking..." : "Refresh"}</span>
        </button>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-3">
        {services.map((s) => {
          const isOnline = s.status === "online";
          const isMuted = s.muted;

          let statusBg = "bg-emerald-500/10 border-emerald-500/30";
          let statusDot = "bg-emerald-400 shadow-[0_0_6px_#22c55e]";
          let statusText = "text-emerald-400";

          if (!isOnline) {
            if (isMuted) {
              statusBg = "bg-white/5 border-white/10 opacity-60";
              statusDot = "bg-white/30";
              statusText = "text-white/40";
            } else {
              statusBg = "bg-red-500/10 border-red-500/30";
              statusDot = "bg-red-500 shadow-[0_0_6px_#ef4444] animate-pulse";
              statusText = "text-red-400";
            }
          }

          return (
            <div
              key={s.id}
              onClick={(e) => toggleMute(s.id, e)}
              className={`group relative rounded-lg border p-2.5 transition-all duration-200 cursor-pointer hover:border-white/30 ${statusBg}`}
              title={`Click to ${isMuted ? "unmute" : "mute"} alert for ${s.name}`}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
                  <span className="text-[11px] font-bold text-white/90 truncate">{s.name}</span>
                </div>
                <span className="text-[10px] font-mono text-white/40 group-hover:text-amber-400 transition-colors">
                  :{s.port}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-white/5">
                <span className={`font-semibold ${statusText}`}>
                  {isOnline ? "ONLINE" : isMuted ? "MUTED" : "OFFLINE"}
                </span>
                {isOnline ? (
                  <span className="text-white/50">{s.latencyMs}ms</span>
                ) : (
                  <span className="text-white/30">{s.statusCode ? `HTTP ${s.statusCode}` : "ERR"}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Meta */}
      {data?.updatedAt && (
        <div className="flex items-center justify-between text-[10px] font-mono text-white/30 pt-2.5 mt-2 border-t border-white/5">
          <span>Auto-polling every 15s • Click card to mute alert</span>
          <span>Updated {new Date(data.updatedAt).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
});
