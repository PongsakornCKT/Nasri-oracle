/**
 * handlePlay-new.ts — Replacement function for handlePlay in scripts/tracker-api.ts (#OptionA)
 *
 * Keeps: updateMilestoneStatus to ACTIVE + reading PLAN.md snippet (<= 500 chars).
 * Removes: resolveTarget, Bun.spawn with maw hey, and maw wake retries.
 * Adds: Agora event appending with topic_id "pa-dispatch" & category "dispatch".
 * Returns: { ok: true, status: "ACTIVE", queued: true, delegated: ["pa-oracle (dispatch-queue)"] }
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { appendFile } from "fs/promises";
import { join } from "path";

export interface PlayMilestonePayload {
  projectId: string;
  phase: string;
  name?: string;
  owner?: string;
}

/** Complete drop-in replacement for handlePlay */
export async function handlePlay(req: Request): Promise<Response> {
  const body: PlayMilestonePayload = await req.json().catch(() => null);
  if (!body || !body.projectId || !body.phase) {
    return new Response(JSON.stringify({ ok: false, error: "projectId and phase required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 1. Update status to ACTIVE
  const result = await updateMilestoneStatus(body.projectId, body.phase, "ACTIVE");
  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, error: result.error || "Failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 2. Read PLAN.md for detail snippet (<= 500 chars)
  let planDetail = "";
  for (const dir of ACTIVE_DIRS) {
    for (const sub of [`phase-${body.phase}`, `phase-${body.phase.toLowerCase()}`]) {
      const c = await safeReadFile(join(dir, body.projectId, sub, "PLAN.md"));
      if (c) { planDetail = c; break; }
    }
    if (planDetail) break;
  }

  const planSnippet = planDetail ? ` | PLAN: ${planDetail.replace(/[\r\n]+/g, " ").substring(0, 500)}` : "";
  const taskContent = `[tracker] PLAY: Phase ${body.phase} — ${body.name || ""} | project: ${body.projectId} | suggested-owner: ${body.owner || ""}${planSnippet}`;

  // 3. Write event to Agora JSONL (same mechanism as handleExecute)
  const today = todayString();
  const entry = {
    from: "tracker-ui",
    to: "pa-oracle",
    topic_id: "pa-dispatch",
    category: "dispatch",
    title: "TRACKER PLAY",
    type: "event",
    ts: Date.now(),
    content: taskContent,
  };

  for (const agoraDir of AGORA_DIRS) {
    try {
      await appendFile(join(agoraDir, `${today}.jsonl`), JSON.stringify(entry) + "\n");
      break;
    } catch {}
  }

  const delegated = ["pa-oracle (dispatch-queue)"];
  return new Response(JSON.stringify({
    ok: true,
    status: "ACTIVE",
    queued: true,
    delegated,
    message: `Phase ${body.phase} queued to pa-dispatch`
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

// ── Mock stubs for standalone execution test ──
const ACTIVE_DIRS = ["/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2"];
const AGORA_DIRS = ["/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/inbox/agora"];
function todayString() { return new Date().toISOString().slice(0, 10); }
async function safeReadFile(p: string) { return null; }
async function updateMilestoneStatus(p: string, ph: string, st: string) { return { ok: true }; }

// ── Standalone Test Execution ──
if (import.meta.main) {
  console.log("====================================================");
  console.log("   handlePlay Replacement Function — Standalone Test ");
  console.log("====================================================");

  const mockReq = new Request("http://localhost/api/tracker/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: "p-maw-office",
      phase: "02",
      name: "Fleet Heartbeat Probe",
      owner: "nasri-oracle"
    })
  });

  handlePlay(mockReq).then(async (res) => {
    console.log("Response status:", res.status);
    console.log("Response body:", await res.json());
  });
}
