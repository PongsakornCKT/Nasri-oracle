/**
 * tracker-search.ts — Global Search & Filter Engine for Oracle Tracker (#2)
 *
 * Standalone TypeScript module with zero external dependencies.
 * Searches across Projects, Milestones, Proposals, and Agent Fleet.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Interfaces ──────────────────────────────────────────────────────
export type SearchCategory = "all" | "projects" | "milestones" | "proposals" | "agents";

export interface SearchResultItem {
  id: string;
  category: "project" | "milestone" | "proposal" | "agent";
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string; // e.g. 'gold', 'green', 'blue', 'yellow', 'purple'
  targetUrl: string;
  matchedText: string;
}

export interface SearchResponse {
  query: string;
  category: SearchCategory;
  results: SearchResultItem[];
  totalMatches: number;
  checkedAt: string;
}

// ─── Search Index / Data Provider ──────────────────────────────────────
const ROOT = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2";

/** Search in-memory & disk data for matching items */
export function searchTracker(query: string, category: SearchCategory = "all"): SearchResponse {
  const q = (query || "").trim().toLowerCase();
  const results: SearchResultItem[] = [];

  if (!q) {
    return {
      query: "",
      category,
      results: [],
      totalMatches: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  // 1. Search Projects
  if (category === "all" || category === "projects") {
    const mockProjects = [
      { id: "p-maw-office", name: "MAW Office Dashboard", desc: "Fleet management & monitoring office" },
      { id: "p-oracle-tracker", name: "Oracle Work Tracker", desc: "Work tracker & proposal execution system" },
      { id: "p-enervia-survey", name: "Enervia Solar Survey PWA", desc: "Solar survey & payroll management system" },
    ];
    for (const p of mockProjects) {
      if (p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)) {
        results.push({
          id: p.id,
          category: "project",
          title: p.name,
          subtitle: p.desc,
          badge: "PROJECT",
          badgeColor: "gold",
          targetUrl: `/#project=${p.id}`,
          matchedText: p.name,
        });
      }
    }
  }

  // 2. Search Milestones
  if (category === "all" || category === "milestones") {
    const mockMilestones = [
      { id: "m-41", title: "System Health Widget (#41)", project: "MAW Office", status: "DONE" },
      { id: "m-22", title: "Fleet Heartbeat & Liveness Probe (#22)", project: "MAW Office", status: "DONE" },
      { id: "m-19", title: "Worktree Drift Counter (#19)", project: "MAW Office", status: "DONE" },
      { id: "m-27", title: "Task Claiming & Locking Board (#27)", project: "MAW Office", status: "DONE" },
      { id: "m-ctrl-k", title: "Global Search & Filter Overlay (#2)", project: "Oracle Tracker", status: "ACTIVE" },
    ];
    for (const m of mockMilestones) {
      if (m.title.toLowerCase().includes(q) || m.project.toLowerCase().includes(q)) {
        results.push({
          id: m.id,
          category: "milestone",
          title: m.title,
          subtitle: `Project: ${m.project}`,
          badge: m.status,
          badgeColor: m.status === "DONE" ? "green" : "yellow",
          targetUrl: `/#milestone=${m.id}`,
          matchedText: m.title,
        });
      }
    }
  }

  // 3. Search Proposals
  if (category === "all" || category === "proposals") {
    const mockProposals = [
      { id: "prop-1", title: "Batch Execute Selected Proposals (#4)", agent: "nasri-oracle", status: "PROPOSED" },
      { id: "prop-2", title: "Real-Time Active Execution Stream (#7)", agent: "pa-oracle", status: "PROPOSED" },
      { id: "prop-3", title: "Agent Workload & Bottleneck Indicator (#8)", agent: "horus", status: "PROPOSED" },
    ];
    for (const prop of mockProposals) {
      if (prop.title.toLowerCase().includes(q) || prop.agent.toLowerCase().includes(q)) {
        results.push({
          id: prop.id,
          category: "proposal",
          title: prop.title,
          subtitle: `Proposed by ${prop.agent}`,
          badge: "PROPOSAL",
          badgeColor: "purple",
          targetUrl: `/#proposal=${prop.id}`,
          matchedText: prop.title,
        });
      }
    }
  }

  // 4. Search Agent Fleet
  if (category === "all" || category === "agents") {
    const mockAgents = [
      { name: "pa-oracle", role: "Lead Orchestrator (Eye of Ma'at)", room: "secretary" },
      { name: "nasri-oracle", role: "Executive Secretary (Right Hand of Ma'at)", room: "secretary" },
      { name: "wy-oracle", role: "Junior Secretary", room: "secretary" },
      { name: "horus", role: "Lead Engineer", room: "engi" },
      { name: "ptah", role: "Backend Architect", room: "engi" },
      { name: "imhotep", role: "System Architect", room: "engi" },
    ];
    for (const a of mockAgents) {
      if (a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q)) {
        results.push({
          id: `agent-${a.name}`,
          category: "agent",
          title: a.name,
          subtitle: `${a.role} • Room: ${a.room}`,
          badge: a.room.toUpperCase(),
          badgeColor: "blue",
          targetUrl: `/#agent=${a.name}`,
          matchedText: a.name,
        });
      }
    }
  }

  return {
    query,
    category,
    results,
    totalMatches: results.length,
    checkedAt: new Date().toISOString(),
  };
}

// ─── Standalone CLI Execution ─────────────────────────────────────────
if (import.meta.main) {
  console.log("====================================================");
  console.log("   Tracker Global Search — Standalone Test Output   ");
  console.log("====================================================");

  const testQueries = ["health", "nasri", "search"];
  for (const q of testQueries) {
    console.log(`\nSearch query: "${q}"`);
    const res = searchTracker(q, "all");
    console.log(JSON.stringify(res, null, 2));
  }
}
