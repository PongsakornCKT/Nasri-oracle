/**
 * handleAuditLog-new.ts — Auto-Update Audit Trail & Agora Writer Engine Fix
 *
 * Standalone TypeScript module with zero external dependencies.
 * Ensures ALL automatic and manual milestone status flips, daily archives, and project archives
 * correctly write structured entries to Agora JSONL logs.
 *
 * Exposes /api/tracker/audit-log with lastCheckedAt timestamp and UX fallback support.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { appendFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

export interface AuditChange {
  projectId: string;
  phase: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
}

export interface AuditLogItem {
  id: string;
  ts: number;
  projectId?: string;
  phase?: string;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  summary?: string;
  legacy?: boolean;
}

export interface AuditLogResponse {
  items: AuditLogItem[];
  lastCheckedAt: string;
  formattedCheckedTime: string;
}

const ROOT = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2";
const AGORA_LOG_DIR = join(ROOT, "ψ", "inbox", "agora");
let lastAutoUpdateCheckTs: number = Date.now();

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayString(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Record last auto-update scan timestamp */
export function recordAutoUpdateScan(): void {
  lastAutoUpdateCheckTs = Date.now();
}

/** Helper function to write structured audit event to Agora JSONL */
export async function writeAgoraAuditEvent(
  changes: AuditChange[],
  summary: string,
  from: string = "tracker-api"
): Promise<boolean> {
  if (!changes || changes.length === 0) return false;

  const now = Date.now();
  const today = todayString();
  const entry = {
    from,
    to: "pa-oracle",
    topic: "auto-update-status",
    topic_id: "auto-update-status",
    type: "system",
    ts: now,
    content: `🔄 ${summary}`,
    changes: changes.map(c => ({
      projectId: c.projectId,
      phase: c.phase,
      previousStatus: c.previousStatus,
      newStatus: c.newStatus,
      reason: c.reason,
    })),
  };

  const jsonLine = JSON.stringify(entry) + "\n";
  const logFile = join(AGORA_LOG_DIR, `${today}.jsonl`);

  try {
    await appendFile(logFile, jsonLine, "utf-8");
    return true;
  } catch (err) {
    console.warn("[AuditLog] Failed to append agora log:", err);
    return false;
  }
}

/** Enhanced handleAuditLog handler */
export async function handleAuditLogEngine(daysParam: number = 7): Promise<AuditLogResponse> {
  const days = Math.min(30, Math.max(1, daysParam));
  const out: AuditLogItem[] = [];
  const seen = new Set<string>();

  function processAuditEntry(e: Record<string, any>) {
    const isAuditTopic =
      e.topic === "auto-update-status" ||
      e.topic_id === "auto-update-status" ||
      e.topic === "archive-done-milestones" ||
      e.topic_id === "archive-done-milestones";

    if (!isAuditTopic) return;

    const ts: number = Number(e.ts) || Date.now();
    if (Array.isArray(e.changes) && e.changes.length > 0) {
      for (const c of e.changes) {
        const id = `${ts}:${c.projectId}:${c.phase}`;
        if (!seen.has(id)) {
          seen.add(id);
          out.push({
            id,
            ts,
            projectId: c.projectId,
            phase: c.phase,
            previousStatus: c.previousStatus || "ACTIVE",
            newStatus: c.newStatus || "DONE",
            reason: c.reason || "Auto-updated",
          });
        }
      }
    } else {
      const id = `${ts}:legacy:${Math.random().toString(36).slice(2, 6)}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push({
          id,
          ts,
          summary: e.content || e.title || "Auto-update event",
          legacy: true,
        });
      }
    }
  }

  // Scan JSONL files for past N days
  for (let d = 0; d < days; d++) {
    const dateStr = dayString(d);
    const filePath = join(AGORA_LOG_DIR, `${dateStr}.jsonl`);
    if (!existsSync(filePath)) continue;

    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          processAuditEntry(JSON.parse(line));
        } catch {}
      }
    } catch {}
  }

  out.sort((a, b) => b.ts - a.ts);

  const checkDate = new Date(lastAutoUpdateCheckTs);
  const hh = String(checkDate.getHours()).padStart(2, "0");
  const mm = String(checkDate.getMinutes()).padStart(2, "0");

  return {
    items: out.slice(0, 100),
    lastCheckedAt: checkDate.toISOString(),
    formattedCheckedTime: `${hh}:${mm}`,
  };
}

// ── Standalone CLI Test Execution ──
if (import.meta.main) {
  console.log("====================================================");
  console.log("   Audit Log Engine Replacement — Standalone Test   ");
  console.log("====================================================");

  recordAutoUpdateScan();
  writeAgoraAuditEvent(
    [
      { projectId: "p-maw-office", phase: "27", previousStatus: "ACTIVE", newStatus: "DONE", reason: "All checklist items verified" }
    ],
    "Auto-update 1 milestone status to DONE"
  ).then(() => {
    handleAuditLogEngine(7).then(res => {
      console.log("Last Checked Time:", res.formattedCheckedTime);
      console.log("Total Audit Items:", res.items.length);
      console.log("Sample Item:", JSON.stringify(res.items[0], null, 2));
    });
  });
}
