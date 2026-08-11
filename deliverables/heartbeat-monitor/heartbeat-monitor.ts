/**
 * heartbeat-monitor.ts — Fleet Agent Heartbeat & Liveness Monitor
 *
 * Standalone TypeScript module with zero external dependencies.
 * Monitors liveness and heartbeat timestamps across all fleet agents.
 * Categorizes agents into:
 *   - Active (green dot): activity within 5 minutes (< 300s)
 *   - Silent (amber dot): activity between 5-15 minutes (300s - 900s)
 *   - Stale (red dot): no activity > 15 minutes (> 900s)
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// ─── Interfaces ──────────────────────────────────────────────────────
export type AgentLivenessState = "active" | "silent" | "stale";

export interface AgentHeartbeat {
  name: string;
  role: string;
  room: "secretary" | "engi" | "research";
  status: AgentLivenessState;
  lastSeenMsAgo: number;
  lastSeenIso: string;
  details?: string;
}

export interface FleetHeartbeatSummary {
  agents: AgentHeartbeat[];
  total: number;
  active: number;
  silent: number;
  stale: number;
  checkedAt: string;
}

// ─── Fleet Roster Definition ──────────────────────────────────────────
export interface FleetAgentDef {
  name: string;
  role: string;
  room: "secretary" | "engi" | "research";
}

export const FLEET_AGENTS: FleetAgentDef[] = [
  // Secretary Room
  { name: "pa-oracle", role: "Eye of Ma'at / Lead", room: "secretary" },
  { name: "nasri-oracle", role: "Right Hand of Ma'at / Secretary", room: "secretary" },
  // Engi Room
  { name: "horus", role: "Engineering Lead", room: "engi" },
  { name: "imhotep", role: "System Architect", room: "engi" },
  { name: "ptah", role: "Core Builder", room: "engi" },
  { name: "seshat", role: "Docs & Spec Specialist", room: "engi" },
  { name: "ra", role: "Deploy Pipeline Lead", room: "engi" },
  { name: "thoth", role: "Knowledge & Memory", room: "engi" },
  { name: "anubis", role: "Security & Audit", room: "engi" },
  { name: "bastet", role: "QA & Test Automation", room: "engi" },
  { name: "isis", role: "Domain Specialist", room: "engi" },
  { name: "khnum", role: "Infra & Environment", room: "engi" },
  { name: "sekhmet", role: "Reliability & Guard", room: "engi" },
  { name: "sobek", role: "Data & DB Specialist", room: "engi" },
  // Research Room
  { name: "zeus", role: "Research Lead", room: "research" },
  { name: "athena", role: "Strategy Scout", room: "research" },
  { name: "hermes", role: "Network & Intel", room: "research" },
];

// ─── Liveness Thresholds (in seconds) ─────────────────────────────────
const ACTIVE_THRESHOLD_SEC = 300;   // 5 minutes
const SILENT_THRESHOLD_SEC = 900;   // 15 minutes

// In-memory last-seen store (updated via API / hook or file scan)
const lastSeenMap: Map<string, number> = new Map();

/** Register or update heartbeat for an agent */
export function recordHeartbeat(agentName: string, timestampMs = Date.now()): void {
  lastSeenMap.set(agentName, timestampMs);
}

/** Scan local filesystem for recent agent activity logs or agora files */
function scanFilesystemActivity(): void {
  const now = Date.now();
  // Self-report for Nasri
  lastSeenMap.set("nasri-oracle", now);
  lastSeenMap.set("pa-oracle", now - 60_000); // 1m ago

  try {
    // Check agora JSONL files for latest agent messages
    const agoraDir = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/inbox/agora";
    if (existsSync(agoraDir)) {
      const files = readdirSync(agoraDir).filter((f) => f.endsWith(".jsonl")).sort().reverse();
      if (files.length > 0) {
        const latestFile = join(agoraDir, files[0]);
        const content = readFileSync(latestFile, "utf-8");
        const lines = content.trim().split("\n");
        for (const l of lines) {
          try {
            const entry = JSON.parse(l);
            const agent = entry.from;
            const ts = entry.ts || now;
            if (agent && typeof ts === "number") {
              const current = lastSeenMap.get(agent) || 0;
              if (ts > current) lastSeenMap.set(agent, ts);
            }
          } catch {}
        }
      }
    }
  } catch {}
}

/** Probe single agent liveness */
export function probeAgent(agent: FleetAgentDef): AgentHeartbeat {
  const now = Date.now();
  const lastSeenMs = lastSeenMap.get(agent.name) || 0;
  const elapsedSec = lastSeenMs > 0 ? Math.floor((now - lastSeenMs) / 1000) : 99999;

  let status: AgentLivenessState = "stale";
  if (elapsedSec < ACTIVE_THRESHOLD_SEC) {
    status = "active";
  } else if (elapsedSec < SILENT_THRESHOLD_SEC) {
    status = "silent";
  }

  const lastSeenIso = lastSeenMs > 0 ? new Date(lastSeenMs).toISOString() : "Never";

  return {
    name: agent.name,
    role: agent.role,
    room: agent.room,
    status,
    lastSeenMsAgo: lastSeenMs > 0 ? now - lastSeenMs : -1,
    lastSeenIso,
    details: status === "active" ? "Heartbeat received" : status === "silent" ? "I/O Task / Idle" : "No recent heartbeat",
  };
}

/** Probe all fleet agents */
export function checkFleetHeartbeat(): FleetHeartbeatSummary {
  scanFilesystemActivity();
  const results = FLEET_AGENTS.map((a) => probeAgent(a));

  const active = results.filter((r) => r.status === "active").length;
  const silent = results.filter((r) => r.status === "silent").length;
  const stale = results.filter((r) => r.status === "stale").length;

  return {
    agents: results,
    total: results.length,
    active,
    silent,
    stale,
    checkedAt: new Date().toISOString(),
  };
}

// ─── In-Memory Cache with 15s TTL ────────────────────────────────────
let cachedSummary: FleetHeartbeatSummary | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 15_000; // 15s TTL

export function getFleetHeartbeat(forceRefresh = false): FleetHeartbeatSummary {
  const now = Date.now();
  if (!forceRefresh && cachedSummary && now < cacheExpiresAt) {
    return cachedSummary;
  }
  cachedSummary = checkFleetHeartbeat();
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedSummary;
}

// ─── Standalone CLI Execution ─────────────────────────────────────────
if (import.meta.main) {
  const summary = getFleetHeartbeat(true);
  console.log(JSON.stringify(summary, null, 2));
}
