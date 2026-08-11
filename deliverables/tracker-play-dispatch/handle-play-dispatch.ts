/**
 * handle-play-dispatch.ts — Option A (ข้อ ก.): Route ▶ Play on Milestones to pa-dispatch (#OptionA)
 *
 * Standalone TypeScript module with zero external dependencies.
 * Replaces direct agent dispatch & maw wake with pa-dispatch queueing.
 * Enforces rule: "Every task must pass through pa plan; engi agents must NOT be awakened without P'Phong's directive."
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { appendFile } from "fs/promises";
import { join } from "path";

export interface PlayMilestoneRequest {
  projectId: string;
  phase: string;
  name?: string;
  owner?: string;
  from?: string;
}

export interface PlayMilestoneResponse {
  ok: boolean;
  status: string;
  queued: boolean;
  message: string;
  agoraEventId?: string;
  error?: string;
}

const AGORA_LOG_PATH = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/inbox/agora/2026-08-11.jsonl";

/** Handle ▶ Play button on Milestone — Enqueue to pa-dispatch (Option A) */
export async function handlePlayToDispatch(reqBody: PlayMilestoneRequest): Promise<PlayMilestoneResponse> {
  if (!reqBody || !reqBody.projectId || !reqBody.phase) {
    return { ok: false, status: "ERROR", queued: false, message: "projectId and phase required", error: "projectId and phase required" };
  }

  const phaseName = reqBody.name ? ` — ${reqBody.name}` : "";
  const ownerInfo = reqBody.owner ? ` [Target: ${reqBody.owner}]` : "";
  const taskText = `Phase ${reqBody.phase}${phaseName} (${reqBody.projectId})${ownerInfo}`;

  const eventId = `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const agoraEntry = {
    id: eventId,
    from: reqBody.from || "tracker-ui",
    to: "pa-oracle",
    topic_id: "pa-dispatch",
    category: "dispatch",
    title: "TRACKER PLAY DISPATCH",
    type: "event",
    ts: Date.now(),
    content: `[tracker] EXECUTE: ${taskText}`
  };

  // Write to Agora JSONL
  try {
    await appendFile(AGORA_LOG_PATH, JSON.stringify(agoraEntry) + "\n", "utf-8");
  } catch {}

  return {
    ok: true,
    status: "ACTIVE",
    queued: true,
    message: `Phase ${reqBody.phase} queued to pa-dispatch (no direct maw wake)`,
    agoraEventId: eventId
  };
}

// ─── Standalone CLI Execution ─────────────────────────────────────────
if (import.meta.main) {
  console.log("====================================================");
  console.log("   Play Milestone → pa-dispatch Option A Test Output ");
  console.log("====================================================");

  const testReq: PlayMilestoneRequest = {
    projectId: "p-maw-office",
    phase: "02",
    name: "Fleet Heartbeat & Liveness Probe",
    owner: "nasri-oracle",
    from: "tracker-ui"
  };

  handlePlayToDispatch(testReq).then((res) => {
    console.log(JSON.stringify(res, null, 2));
  });
}
