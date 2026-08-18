/**
 * health-monitor.ts — System Health Service Monitor for MAW Office
 *
 * Standalone TypeScript module with zero external dependencies.
 * Monitors 5 key local services via HTTP fetch with 3s AbortController timeout.
 * Provides in-memory caching with 30s TTL.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

// ─── Interfaces ──────────────────────────────────────────────────────
export interface ServiceTarget {
  id: string;
  name: string;
  port: number;
  url: string;
}

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

// ─── 5 Target Services Roster ────────────────────────────────────────
export const TARGET_SERVICES: ServiceTarget[] = [
  { id: "maw-office", name: "maw-office", port: 4000, url: "http://localhost:4000/" },
  { id: "tracker-api", name: "tracker-api", port: 4100, url: "http://localhost:4100/health" },
  { id: "enervia-api", name: "enervia-api", port: 4201, url: "http://localhost:4201/health" },
  { id: "api-gateway", name: "api-gateway", port: 4300, url: "http://localhost:4300/gateway/health" },
  { id: "arra-oracle", name: "arra-oracle", port: 47779, url: "http://localhost:47779/" },
];

// ─── Probe Single Service ─────────────────────────────────────────────
/**
 * Probes a single service using native fetch + AbortController with 3s timeout.
 * Note: Any HTTP response (regardless of status code) means online = true (service process is alive).
 */
export async function checkOne(target: ServiceTarget): Promise<ServiceHealth> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  const start = performance.now();
  const checkedAt = new Date().toISOString();

  try {
    const res = await fetch(target.url, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - start);
    // Any HTTP response received means process is alive
    return {
      name: target.name,
      port: target.port,
      online: true,
      latencyMs,
      checkedAt,
    };
  } catch {
    clearTimeout(timeoutId);
    return {
      name: target.name,
      port: target.port,
      online: false,
      latencyMs: null,
      checkedAt,
    };
  }
}

// ─── Probe All Services ───────────────────────────────────────────────
export async function checkAll(targets: ServiceTarget[] = TARGET_SERVICES): Promise<SystemHealthData> {
  const results = await Promise.all(targets.map((t) => checkOne(t)));
  const onlineCount = results.filter((s) => s.online).length;
  const offlineCount = results.length - onlineCount;

  return {
    services: results,
    total: results.length,
    online: onlineCount,
    offline: offlineCount,
    checkedAt: new Date().toISOString(),
  };
}

// ─── In-Memory Cache with 30s TTL ────────────────────────────────────
let cachedHealth: SystemHealthData | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30_000; // 30s cache TTL

export async function getHealth(forceRefresh = false): Promise<SystemHealthData> {
  const now = Date.now();
  if (!forceRefresh && cachedHealth && now < cacheExpiresAt) {
    return cachedHealth;
  }
  cachedHealth = await checkAll();
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedHealth;
}

// ─── Integration Example (Hono / server.ts) ──────────────────────────
/*
  Example integration in maw-js-server/src/server.ts:

  import { getHealth } from "./health-monitor";

  app.get("/api/system/health", async (c) => {
    const refresh = c.req.query("refresh") === "1";
    const health = await getHealth(refresh);
    return c.json(health);
  });
*/

// ─── Standalone CLI Execution ─────────────────────────────────────────
if (import.meta.main) {
  const healthData = await getHealth(true);
  console.log(JSON.stringify(healthData, null, 2));
}
