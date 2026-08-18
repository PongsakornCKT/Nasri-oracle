/**
 * handleFleetHealth-new.ts — Single Source of Truth for Fleet Health & Agents (#FleetHealthSingleSource)
 *
 * Standalone TypeScript module with zero external dependencies.
 * Points to MAW Office live endpoint: http://localhost:4000/api/fleet/health (3s timeout).
 * Maps Office heartbeat statuses to Tracker UI schemas:
 *   - Active → state: "alive", status: "alive"
 *   - Silent → state: "alive", status: "alive" (or "idle")
 *   - no-heartbeat → state: "alive", status: "alive"
 *   - Stale / Unbooted → state: "dead", status: "dead", task: "standby (not booted)"
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { readFile } from "fs/promises";
import { join } from "path";

export interface OfficeAgentHeartbeat {
  agent: string;
  room: "secretary" | "engi" | "research";
  hasHook: boolean;
  lastSeenAt: string | null;
  ageSeconds: number | null;
  status: "Active" | "Silent" | "Stale" | "no-heartbeat";
}

export interface OfficeFleetResponse {
  agents: OfficeAgentHeartbeat[];
  total: number;
  active: number;
  silent: number;
  stale: number;
  noHeartbeat: number;
  checkedAt: string;
}

const OFFICE_HEALTH_URL = "http://localhost:4000/api/fleet/health";
const ROOT = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2";
const FLEET_STATE_PATH = join(ROOT, "ψ", "inbox", "health", "fleet-state.json");

// Static metadata fallback for icons, roles, models
const METADATA_MAP: Record<string, { icon: string; role: string; model: string }> = {
  "pa-oracle": { icon: "𓂀", role: "Secretary / Lead Orchestrator", model: "opus-4-6" },
  "nasri-oracle": { icon: "𓁹", role: "Executive Secretary", model: "gemini-2.5-pro" },
  "wy-oracle": { icon: "𓃠", role: "Junior Secretary", model: "aider" },
  "horus": { icon: "𓅃", role: "Engi Team Lead", model: "sonnet-4-6" },
  "ptah": { icon: "𓌀", role: "Backend Architect", model: "sonnet-4-6" },
  "seshat": { icon: "𓋇", role: "Frontend Engineer", model: "sonnet-4-6" },
  "imhotep": { icon: "𓊽", role: "System Architect", model: "sonnet-4-6" },
  "khnum": { icon: "𓃭", role: "DevOps Engineer", model: "sonnet-4-6" },
  "sobek": { icon: "𓆊", role: "Security Engineer", model: "sonnet-4-6" },
  "thoth": { icon: "𓅝", role: "Scribe / Knowledge", model: "sonnet-4-6" },
  "nile": { icon: "𓈖", role: "Data Engineer", model: "sonnet-4-6" },
  "anubis": { icon: "𓃣", role: "Git Workflow Master", model: "sonnet-4-6" },
  "sekhmet": { icon: "𓁦", role: "Incident Commander", model: "sonnet-4-6" },
  "ra": { icon: "𓇳", role: "AI / ML Engineer", model: "sonnet-4-6" },
  "isis": { icon: "𓊨", role: "UI/UX Designer", model: "sonnet-4-6" },
  "maat": { icon: "𓁦", role: "Quality Principles", model: "sonnet-4-6" },
  "bastet": { icon: "𓃠", role: "QA Engineer", model: "sonnet-4-6" },
  "zeus": { icon: "⚡", role: "Research Lead", model: "sonnet-4-6" },
  "athena": { icon: "🦉", role: "Research Analyst", model: "sonnet-4-6" },
  "hermes": { icon: "🪽", role: "Research Scout", model: "sonnet-4-6" }
};

/** Fetch live fleet health from Office endpoint (3s timeout) with fallback */
export async function fetchOfficeFleetHealth(): Promise<any> {
  try {
    const res = await fetch(OFFICE_HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const officeData: OfficeFleetResponse = await res.json();

    const mappedAgents = (officeData.agents || []).map(a => {
      const meta = METADATA_MAP[a.agent] || { icon: "🤖", role: a.room || "agent", model: "claude" };
      const isAlive = a.status === "Active" || a.status === "Silent" || a.status === "no-heartbeat";
      const stateStr = isAlive ? "alive" : "dead";
      const ageMin = a.ageSeconds != null ? Math.round((a.ageSeconds / 60) * 10) / 10 : null;

      return {
        agent: a.agent,
        name: a.agent,
        icon: meta.icon,
        role: meta.role,
        model: meta.model,
        state: stateStr,
        status: stateStr,
        task: isAlive ? meta.role : "standby (not booted)",
        current_task: isAlive ? meta.role : null,
        session: a.room,
        detection_method: "maw-office /api/fleet/health",
        last_update: a.lastSeenAt,
        heartbeat_age_min: ageMin
      };
    });

    const aliveCount = mappedAgents.filter(a => a.state === "alive").length;
    const deadCount = mappedAgents.length - aliveCount;

    return {
      agent_count: mappedAgents.length,
      summary: {
        alive: aliveCount,
        idle: 0,
        busy: 0,
        dead: deadCount,
        stuck: 0,
        unknown: 0
      },
      agents: mappedAgents,
      generated_at: officeData.checkedAt || new Date().toISOString()
    };
  } catch (err) {
    // Fallback: try fleet-state.json if Office endpoint unavailable
    try {
      const raw = await readFile(FLEET_STATE_PATH, "utf-8");
      return JSON.parse(raw);
    } catch {
      return { error: "Office API and fleet-state.json unavailable", agents: [], agent_count: 0, summary: { alive: 0, dead: 0 } };
    }
  }
}

/** Route handler for GET /api/tracker/fleet-health */
export async function handleFleetHealth(): Promise<Response> {
  const data = await fetchOfficeFleetHealth();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

/** Route handler for GET /api/tracker/agents */
export async function handleAgents(): Promise<Response> {
  const data = await fetchOfficeFleetHealth();
  return new Response(JSON.stringify(data.agents || []), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

// ── Standalone Test Execution ──
if (import.meta.main) {
  console.log("====================================================");
  console.log("   Single Source Fleet Health — Standalone Test     ");
  console.log("====================================================");

  fetchOfficeFleetHealth().then(data => {
    console.log("Summary:", data.summary);
    console.log("Total agents:", data.agent_count);
    console.log("First 4 mapped agents:", JSON.stringify(data.agents.slice(0, 4), null, 2));
  });
}
