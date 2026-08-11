/**
 * system-health.ts — System Health Service Monitor for MAW Office
 *
 * Monitors local services across key ports (4000, 4100, 4201, 4300, 47779).
 * Runs background health checks every 30s so GET requests return instant cached state.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { Hono } from "hono";

// ─── Interfaces ──────────────────────────────────────────────────────
export interface ServiceTarget {
  id: string;
  name: string;
  port: number;
  url: string;
  expectedStatus?: number;
}

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

// ─── Target Services Roster ──────────────────────────────────────────
export const DEFAULT_SERVICES: ServiceTarget[] = [
  { id: "maw-office", name: "MAW Office Dashboard", port: 4000, url: "http://localhost:4000/" },
  { id: "tracker-api", name: "Oracle Tracker API", port: 4100, url: "http://localhost:4100/health" },
  { id: "enervia-api", name: "Enervia API Service", port: 4201, url: "http://localhost:4201/health" },
  { id: "api-gateway", name: "Fleet API Gateway", port: 4300, url: "http://localhost:4300/gateway/health" },
  { id: "arra-oracle", name: "Arra Oracle v3 Engine", port: 47779, url: "http://localhost:47779/" },
];

// ─── Health Monitor Class ─────────────────────────────────────────────
export class SystemHealthMonitor {
  private services: ServiceTarget[];
  private cache: Map<string, ServiceHealthStatus> = new Map();
  private mutedSet: Set<string> = new Set();
  private intervalId: Timer | null = null;
  private isChecking = false;
  private updatedAt: string = new Date().toISOString();

  constructor(services: ServiceTarget[] = DEFAULT_SERVICES) {
    this.services = services;
    // Initialize cache with default offline state
    for (const s of services) {
      this.cache.set(s.id, {
        id: s.id,
        name: s.name,
        port: s.port,
        url: s.url,
        status: "offline",
        statusCode: null,
        latencyMs: 0,
        lastChecked: new Date().toISOString(),
        muted: false,
      });
    }
  }

  /** Single ping probe for a service target */
  async probeService(target: ServiceTarget): Promise<ServiceHealthStatus> {
    const start = performance.now();
    const isMuted = this.mutedSet.has(target.id);
    const nowIso = new Date().toISOString();

    try {
      const res = await fetch(target.url, {
        method: "GET",
        signal: AbortSignal.timeout(3000), // 3s timeout
      });
      const latency = Math.round(performance.now() - start);
      const isOk = res.status >= 200 && res.status < 400;

      return {
        id: target.id,
        name: target.name,
        port: target.port,
        url: target.url,
        status: isOk ? "online" : "offline",
        statusCode: res.status,
        latencyMs: latency,
        lastChecked: nowIso,
        muted: isMuted,
      };
    } catch {
      const latency = Math.round(performance.now() - start);
      return {
        id: target.id,
        name: target.name,
        port: target.port,
        url: target.url,
        status: "offline",
        statusCode: null,
        latencyMs: latency,
        lastChecked: nowIso,
        muted: isMuted,
      };
    }
  }

  /** Run health check sweep across all target services concurrently */
  async checkAll(): Promise<SystemHealthSummary> {
    if (this.isChecking) return this.getSummary();
    this.isChecking = true;

    try {
      const results = await Promise.all(this.services.map((s) => this.probeService(s)));
      for (const res of results) {
        this.cache.set(res.id, res);
      }
      this.updatedAt = new Date().toISOString();
    } finally {
      this.isChecking = false;
    }

    return this.getSummary();
  }

  /** Get instant cached summary (non-blocking) */
  getSummary(): SystemHealthSummary {
    const list = Array.from(this.cache.values());
    const online = list.filter((s) => s.status === "online").length;
    const offline = list.filter((s) => s.status === "offline").length;

    return {
      services: list,
      total: list.length,
      online,
      offline,
      updatedAt: this.updatedAt,
    };
  }

  /** Toggle mute status for a specific service ID */
  toggleMute(id: string): boolean {
    if (this.mutedSet.has(id)) {
      this.mutedSet.delete(id);
    } else {
      this.mutedSet.add(id);
    }
    const cached = this.cache.get(id);
    if (cached) {
      cached.muted = this.mutedSet.has(id);
    }
    return this.mutedSet.has(id);
  }

  /** Start background polling loop every intervalMs (default: 30s) */
  start(intervalMs = 30_000): void {
    if (this.intervalId) return;
    this.checkAll(); // initial sweep
    this.intervalId = setInterval(() => this.checkAll(), intervalMs);
  }

  /** Stop background polling loop */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// ─── Hono API Handler Creator ─────────────────────────────────────────
export function createHealthApi(monitor: SystemHealthMonitor) {
  const app = new Hono();

  // GET /api/system-health — instant cached status
  app.get("/api/system-health", (c) => {
    const refresh = c.req.query("refresh") === "1";
    if (refresh) {
      // Async trigger, return current immediately
      monitor.checkAll();
    }
    return c.json(monitor.getSummary());
  });

  // POST /api/system-health/mute — toggle mute state
  app.post("/api/system-health/mute", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const id = body.id;
    if (!id || typeof id !== "string") {
      return c.json({ error: "id is required" }, 400);
    }
    const muted = monitor.toggleMute(id);
    return c.json({ ok: true, id, muted });
  });

  return app;
}

// ─── Standalone CLI / Test Execution Block ────────────────────────────
if (import.meta.main) {
  console.log("====================================================");
  console.log("   MAW System Health Service Monitor — Standalone   ");
  console.log("====================================================");
  const monitor = new SystemHealthMonitor();
  console.log("[INFO] Running initial health check sweep across 5 ports...");
  const summary = await monitor.checkAll();
  console.log(`\nResults (${summary.online}/${summary.total} Services Online):`);
  for (const s of summary.services) {
    const statusText = s.status === "online" ? "\x1b[32mONLINE\x1b[0m" : "\x1b[31mOFFLINE\x1b[0m";
    const code = s.statusCode ? `(HTTP ${s.statusCode})` : "";
    console.log(`  - [:${s.port}] ${s.name.padEnd(25)}: ${statusText} ${code} in ${s.latencyMs}ms`);
  }
  console.log(`\nUpdated At: ${summary.updatedAt}`);
}
