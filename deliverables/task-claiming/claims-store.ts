/**
 * claims-store.ts — Task Claiming & Lock Manager for MAW Office
 *
 * Standalone TypeScript module with zero external dependencies.
 * Stores task claims in data/task-claims.json with atomic file writes (.tmp -> rename).
 * Implements lazy 30-minute auto-release for inactive locks.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Interfaces ──────────────────────────────────────────────────────
export type ClaimStatus = "open" | "claimed" | "done" | "released";

export interface TaskClaim {
  taskId: string;
  title: string;
  claimedBy: string;
  claimedAt: string;
  updatedAt: string;
  status: ClaimStatus;
}

export interface ClaimResult {
  ok: boolean;
  claim?: TaskClaim;
  holder?: string;
  error?: string;
}

// ─── File Resolution & Storage ───────────────────────────────────────
// Default storage path: data/task-claims.json
const DATA_DIR = join(import.meta.dir, "../data");
const CLAIMS_FILE_PATH = join(DATA_DIR, "task-claims.json");
const AUTO_RELEASE_MS = 30 * 60 * 1000; // 30 minutes TTL

/** Atomic write helper: writes to .tmp file then renames to avoid corruption */
function atomicWriteJson(filePath: string, data: any): void {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    const content = JSON.stringify(data, null, 2);
    writeFileSync(tmpPath, content, "utf-8");
    renameSync(tmpPath, filePath);
  } catch (err: any) {
    console.error("[claims-store] Atomic write failed:", err.message);
  }
}

/** Read claims list from disk */
function readClaimsFromDisk(): TaskClaim[] {
  try {
    if (!existsSync(CLAIMS_FILE_PATH)) return [];
    const raw = readFileSync(CLAIMS_FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ─── Core Service Functions ──────────────────────────────────────────

/**
 * List all claims with lazy 30-minute auto-release check.
 * Any claim with status "claimed" older than 30m is automatically marked "released".
 */
export function listClaims(): TaskClaim[] {
  const claims = readClaimsFromDisk();
  const now = Date.now();
  let modified = false;

  for (const claim of claims) {
    if (claim.status === "claimed") {
      const claimedTs = Date.parse(claim.claimedAt);
      if (!isNaN(claimedTs) && now - claimedTs > AUTO_RELEASE_MS) {
        claim.status = "released";
        claim.updatedAt = new Date(now).toISOString();
        modified = true;
      }
    }
  }

  if (modified) {
    atomicWriteJson(CLAIMS_FILE_PATH, claims);
  }

  return claims;
}

/**
 * Claim or lock a task for an agent.
 * Rejects with { ok: false, holder: string } if already claimed by someone else and not expired.
 */
export function claimTask(taskId: string, title: string, agent: string): ClaimResult {
  const claims = listClaims(); // run lazy auto-release first
  const now = new Date().toISOString();
  const existingIndex = claims.findIndex((c) => c.taskId === taskId);

  if (existingIndex !== -1) {
    const existing = claims[existingIndex];
    if (existing.status === "claimed" && existing.claimedBy !== agent) {
      return {
        ok: false,
        holder: existing.claimedBy,
        error: `Task ${taskId} is currently locked by ${existing.claimedBy}`,
      };
    }
    // Update existing claim
    existing.claimedBy = agent;
    existing.claimedAt = now;
    existing.updatedAt = now;
    existing.status = "claimed";
    if (title) existing.title = title;
    atomicWriteJson(CLAIMS_FILE_PATH, claims);
    return { ok: true, claim: existing };
  }

  // Create new claim
  const newClaim: TaskClaim = {
    taskId,
    title: title || `Task #${taskId}`,
    claimedBy: agent,
    claimedAt: now,
    updatedAt: now,
    status: "claimed",
  };

  claims.push(newClaim);
  atomicWriteJson(CLAIMS_FILE_PATH, claims);
  return { ok: true, claim: newClaim };
}

/** Release a task lock */
export function releaseTask(taskId: string, agent: string): ClaimResult {
  const claims = listClaims();
  const claim = claims.find((c) => c.taskId === taskId);
  if (!claim) return { ok: false, error: "Claim not found" };

  const now = new Date().toISOString();
  claim.status = "released";
  claim.updatedAt = now;
  atomicWriteJson(CLAIMS_FILE_PATH, claims);
  return { ok: true, claim };
}

/** Mark a task as complete */
export function completeTask(taskId: string, agent: string): ClaimResult {
  const claims = listClaims();
  const claim = claims.find((c) => c.taskId === taskId);
  if (!claim) return { ok: false, error: "Claim not found" };

  const now = new Date().toISOString();
  claim.status = "done";
  claim.updatedAt = now;
  atomicWriteJson(CLAIMS_FILE_PATH, claims);
  return { ok: true, claim };
}

// ─── Hono Routes Integration Example ──────────────────────────────────
/*
  In maw-js-server/src/server.ts:

  import { listClaims, claimTask, releaseTask, completeTask } from "./claims-store";

  app.get("/api/claims", (c) => {
    return c.json(listClaims());
  });

  app.post("/api/claims/claim", async (c) => {
    const { taskId, title, agent } = await c.req.json().catch(() => ({}));
    if (!taskId || !agent) return c.json({ error: "taskId and agent required" }, 400);
    const res = claimTask(taskId, title, agent);
    if (!res.ok) return c.json(res, 409); // 409 Conflict
    return c.json(res);
  });

  app.post("/api/claims/release", async (c) => {
    const { taskId, agent } = await c.req.json().catch(() => ({}));
    if (!taskId || !agent) return c.json({ error: "taskId and agent required" }, 400);
    return c.json(releaseTask(taskId, agent));
  });

  app.post("/api/claims/complete", async (c) => {
    const { taskId, agent } = await c.req.json().catch(() => ({}));
    if (!taskId || !agent) return c.json({ error: "taskId and agent required" }, 400);
    return c.json(completeTask(taskId, agent));
  });
*/

// ─── Standalone CLI & Collision Test Execution ────────────────────────
if (import.meta.main) {
  console.log("====================================================");
  console.log("   Task Claims Store — Chunk A Collision Test      ");
  console.log("====================================================");

  const testTaskId = "T-101";

  console.log("\n[TEST 1] Agent 1 ('nasri-oracle') claims task T-101...");
  const res1 = claimTask(testTaskId, "Phase 5 Task Claiming (#27)", "nasri-oracle");
  console.log("Result 1:", JSON.stringify(res1, null, 2));

  console.log("\n[TEST 2] Agent 2 ('pa-oracle') attempts to claim same task T-101...");
  const res2 = claimTask(testTaskId, "Phase 5 Task Claiming (#27)", "pa-oracle");
  console.log("Result 2 (Collision Expected):", JSON.stringify(res2, null, 2));

  if (!res2.ok && res2.holder === "nasri-oracle") {
    console.log("\n✅ Claim Collision Test PASSED! Correctly rejected with holder: 'nasri-oracle'");
  } else {
    console.log("\n❌ Claim Collision Test FAILED!");
  }
}
