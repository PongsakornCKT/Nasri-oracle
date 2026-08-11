/**
 * exec-progress.ts — Real-Time Execution Progress & Console Stream Service (#7)
 *
 * Standalone TypeScript module with zero external dependencies.
 * Manages active execution progress, step ratios, agent tags, and console log streams.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

// ─── Interfaces ──────────────────────────────────────────────────────
export interface ExecutionProgress {
  execId: string;
  taskTitle: string;
  agent: string;
  currentStep: number;
  totalSteps: number;
  progressPercent: number;
  status: "running" | "completed" | "failed";
  logs: string[];
  startedAt: string;
  updatedAt: string;
}

export interface ActiveExecutionsSummary {
  executions: ExecutionProgress[];
  activeCount: number;
  checkedAt: string;
}

// ─── Memory Store ────────────────────────────────────────────────────
const activeExecutionsMap: Map<string, ExecutionProgress> = new Map();

/** Update or push execution progress */
export function updateExecutionProgress(
  execId: string,
  taskTitle: string,
  agent: string,
  currentStep: number,
  totalSteps: number,
  status: "running" | "completed" | "failed" = "running",
  logMessage?: string
): ExecutionProgress {
  const now = new Date().toISOString();
  let existing = activeExecutionsMap.get(execId);

  const percent = totalSteps > 0 ? Math.min(100, Math.round((currentStep / totalSteps) * 100)) : 0;
  const newLogs = existing ? [...existing.logs] : [];

  if (logMessage) {
    const timestamp = new Date().toTimeString().split(" ")[0];
    newLogs.push(`[${timestamp}] ${logMessage}`);
    if (newLogs.length > 5) newLogs.shift(); // keep last 5 log lines
  }

  const updated: ExecutionProgress = {
    execId,
    taskTitle: taskTitle || existing?.taskTitle || "Execution Task",
    agent: agent || existing?.agent || "nasri-oracle",
    currentStep,
    totalSteps,
    progressPercent: percent,
    status,
    logs: newLogs,
    startedAt: existing?.startedAt || now,
    updatedAt: now,
  };

  activeExecutionsMap.set(execId, updated);
  return updated;
}

/** Clear or complete execution */
export function removeExecution(execId: string): void {
  activeExecutionsMap.delete(execId);
}

/** Get all currently active executions */
export function getActiveExecutions(): ActiveExecutionsSummary {
  const now = Date.now();
  const list: ExecutionProgress[] = [];

  // Purge executions inactive for > 15 minutes
  for (const [id, item] of activeExecutionsMap.entries()) {
    const ageMs = now - Date.parse(item.updatedAt);
    if (ageMs > 15 * 60 * 1000) {
      activeExecutionsMap.delete(id);
    } else {
      list.push(item);
    }
  }

  const active = list.filter((e) => e.status === "running").length;

  return {
    executions: list,
    activeCount: active,
    checkedAt: new Date().toISOString(),
  };
}

// Seed default initial execution demo if empty
if (activeExecutionsMap.size === 0) {
  updateExecutionProgress(
    "exec-demo-1",
    "Real-Time Execution Progress Stream (#7)",
    "nasri-oracle",
    2,
    4,
    "running",
    "Vitest probes passing (6/6)..."
  );
}

// ─── Standalone CLI Execution ─────────────────────────────────────────
if (import.meta.main) {
  console.log("====================================================");
  console.log("   Execution Progress Stream — Standalone Demo      ");
  console.log("====================================================");

  updateExecutionProgress("exec-101", "Tracker Search Ctrl+K (#2)", "pa-oracle", 3, 3, "completed", "Deployment verified successfully");
  updateExecutionProgress("exec-102", "Worktree Hygiene Audit", "nasri-oracle", 1, 3, "running", "Surveying 26 worktrees read-only...");

  const summary = getActiveExecutions();
  console.log(JSON.stringify(summary, null, 2));
}
