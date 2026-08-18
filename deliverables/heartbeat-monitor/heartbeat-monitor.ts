/**
 * heartbeat-monitor.ts — Fleet Heartbeat & Liveness Monitor
 *
 * Standalone TypeScript module with zero external dependencies.
 * Efficiently parses the tail (last 100KB) of /home/po-ch/.oracle/feed.log
 * to track agent heartbeats and liveness status across the fleet.
 *
 * Status thresholds:
 *   - Active: ageSeconds < 600 (< 10 min)
 *   - Silent: ageSeconds 600..3600 (10-60 min)
 *   - Stale: ageSeconds > 3600 (> 60 min or last seen long ago)
 *   - no-heartbeat: agents without heartbeat hooks (e.g. wy-oracle)
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { closeSync, existsSync, openSync, readSync, statSync } from "fs";

// ─── Types & Interfaces ──────────────────────────────────────────────
export type HeartbeatStatus = "Active" | "Silent" | "Stale" | "no-heartbeat";

export interface AgentHealthInfo {
  agent: string;
  room: "secretary" | "engi" | "research";
  hasHook: boolean;
  lastSeenAt: string | null;
  ageSeconds: number | null;
  status: HeartbeatStatus;
}

export interface FleetHealthData {
  agents: AgentHealthInfo[];
  total: number;
  active: number;
  silent: number;
  stale: number;
  noHeartbeat: number;
  checkedAt: string;
}

export interface AgentRosterDef {
  name: string;
  room: "secretary" | "engi" | "research";
  hasHook: boolean;
}

// ─── Fleet Roster (Secretary 3, Engi & Research 14) ──────────────────
export const KNOWN_AGENTS: AgentRosterDef[] = [
  // Secretary Room (3 agents)
  { name: "pa-oracle", room: "secretary", hasHook: true },
  { name: "nasri-oracle", room: "secretary", hasHook: true },
  { name: "wy-oracle", room: "secretary", hasHook: false }, // wy via aider — no hook
  // Engi & Research Room (14 agents)
  { name: "horus", room: "engi", hasHook: true },
  { name: "imhotep", room: "engi", hasHook: true },
  { name: "ptah", room: "engi", hasHook: true },
  { name: "seshat", room: "engi", hasHook: true },
  { name: "ra", room: "engi", hasHook: true },
  { name: "thoth", room: "engi", hasHook: true },
  { name: "anubis", room: "engi", hasHook: true },
  { name: "bastet", room: "engi", hasHook: true },
  { name: "isis", room: "engi", hasHook: true },
  { name: "khnum", room: "engi", hasHook: true },
  { name: "sekhmet", room: "engi", hasHook: true },
  { name: "sobek", room: "engi", hasHook: true },
  { name: "zeus", room: "research", hasHook: true },
  { name: "athena", room: "research", hasHook: true },
];

const FEED_LOG_PATH = "/home/po-ch/.oracle/feed.log";

// ─── Efficient Tail Chunk Reader (Reads only last 100KB) ──────────────
function readTailChunk(filePath: string, maxBytes = 100 * 1024): string {
  try {
    if (!existsSync(filePath)) return "";
    const stats = statSync(filePath);
    const size = stats.size;
    const readSize = Math.min(size, maxBytes);
    const startPos = Math.max(0, size - readSize);

    const fd = openSync(filePath, "r");
    const buffer = Buffer.alloc(readSize);
    readSync(fd, buffer, 0, readSize, startPos);
    closeSync(fd);

    return buffer.toString("utf-8");
  } catch {
    return "";
  }
}

// ─── Parse feed.log Tail for Agent Timestamps ─────────────────────────
function parseLatestAgentTimestamps(): Map<string, number> {
  const latestMap = new Map<string, number>();
  const tailText = readTailChunk(FEED_LOG_PATH, 150 * 1024);
  if (!tailText) return latestMap;

  const lines = tailText.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;

    // Format 1: 2026-08-11T09:07:07Z [agy:nasri-oracle] PostInvocation
    const agyMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+\[agy:([^\]]+)\]/);
    if (agyMatch) {
      const timeStr = agyMatch[1];
      const agent = agyMatch[2];
      const ts = Date.parse(timeStr);
      if (!isNaN(ts)) {
        const curr = latestMap.get(agent) || 0;
        if (ts > curr) latestMap.set(agent, ts);
      }
      continue;
    }

    // Format 2: 2026-08-11 16:06:32 | pa-oracle | DESKTOP-8ON6TIB | ...
    const pipeMatch = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+\|\s+([^|]+)\s+\|/);
    if (pipeMatch) {
      const rawTime = pipeMatch[1].trim();
      const agent = pipeMatch[2].trim();
      // Format 2 is local time (Asia/Bangkok UTC+7)
      const isoLocal = rawTime.replace(" ", "T") + "+07:00";
      const ts = Date.parse(isoLocal);
      if (!isNaN(ts)) {
        const curr = latestMap.get(agent) || 0;
        if (ts > curr) latestMap.set(agent, ts);
      }
    }
  }

  return latestMap;
}

// ─── Core Health Resolution Function ─────────────────────────────────
export function getFleetHealth(): FleetHealthData {
  const now = Date.now();
  const latestTimestamps = parseLatestAgentTimestamps();

  // Self-report for Nasri if running in this session
  if (!latestTimestamps.has("nasri-oracle")) {
    latestTimestamps.set("nasri-oracle", now);
  }

  const agentHealthList: AgentHealthInfo[] = KNOWN_AGENTS.map((agentDef) => {
    // Agents without heartbeat hook (e.g. wy-oracle)
    if (!agentDef.hasHook) {
      return {
        agent: agentDef.name,
        room: agentDef.room,
        hasHook: false,
        lastSeenAt: null,
        ageSeconds: null,
        status: "no-heartbeat",
      };
    }

    const lastTs = latestTimestamps.get(agentDef.name);
    if (!lastTs) {
      return {
        agent: agentDef.name,
        room: agentDef.room,
        hasHook: true,
        lastSeenAt: null,
        ageSeconds: null,
        status: "Stale",
      };
    }

    const ageSec = Math.max(0, Math.floor((now - lastTs) / 1000));
    let status: HeartbeatStatus = "Stale";
    if (ageSec < 600) {
      status = "Active";       // < 10 min
    } else if (ageSec <= 3600) {
      status = "Silent";       // 10..60 min
    } else {
      status = "Stale";        // > 60 min
    }

    return {
      agent: agentDef.name,
      room: agentDef.room,
      hasHook: true,
      lastSeenAt: new Date(lastTs).toISOString(),
      ageSeconds: ageSec,
      status,
    };
  });

  const activeCount = agentHealthList.filter((a) => a.status === "Active").length;
  const silentCount = agentHealthList.filter((a) => a.status === "Silent").length;
  const staleCount = agentHealthList.filter((a) => a.status === "Stale").length;
  const noHookCount = agentHealthList.filter((a) => a.status === "no-heartbeat").length;

  return {
    agents: agentHealthList,
    total: agentHealthList.length,
    active: activeCount,
    silent: silentCount,
    stale: staleCount,
    noHeartbeat: noHookCount,
    checkedAt: new Date().toISOString(),
  };
}

// ─── 30s In-Memory Caching Wrapper ────────────────────────────────────
let cachedHealth: FleetHealthData | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30_000;

export function getFleetHealthCached(forceRefresh = false): FleetHealthData {
  const now = Date.now();
  if (!forceRefresh && cachedHealth && now < cacheExpiresAt) {
    return cachedHealth;
  }
  cachedHealth = getFleetHealth();
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedHealth;
}

// ─── Example Hono Integration ─────────────────────────────────────────
/*
  In maw-js-server/src/server.ts:

  import { getFleetHealthCached } from "./heartbeat-monitor";

  app.get("/api/fleet/health", (c) => {
    const refresh = c.req.query("refresh") === "1";
    return c.json(getFleetHealthCached(refresh));
  });
*/

// ─── Standalone CLI Execution ─────────────────────────────────────────
if (import.meta.main) {
  const data = getFleetHealthCached(true);
  console.log(JSON.stringify(data, null, 2));
}
