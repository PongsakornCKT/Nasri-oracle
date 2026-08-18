/**
 * worktree-drift.ts — Active Worktree Drift & Uncommitted Changes Monitor
 *
 * Standalone TypeScript module with zero external dependencies.
 * Enumerates worktrees for configured main repos (pa-Oracle v2, enervia-survey, nasri-oracle)
 * using `git worktree list --porcelain`.
 *
 * Filters CRLF line-ending noise on /mnt/c/ using `git -c core.autocrlf=true status --short`.
 * Includes 60s In-memory Cache TTL and 10s per-command timeout.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { execSync } from "child_process";
import { existsSync } from "fs";

// ─── Interfaces ──────────────────────────────────────────────────────
export interface TargetRepoConfig {
  name: string;
  path: string;
}

export interface WorktreeDriftItem {
  repo: string;
  path: string;
  branch: string;
  uncommittedCount: number;
  lastCommitAt: string | null;
  ageDays: number | null;
}

export interface FleetWorktreeDriftReport {
  worktrees: WorktreeDriftItem[];
  totalWorktrees: number;
  cleanCount: number;
  driftCount: number;
  totalUncommittedFiles: number;
  checkedAt: string;
}

// ─── Configured Repos Roster ──────────────────────────────────────────
export const TARGET_REPOS: TargetRepoConfig[] = [
  { name: "pa-Oracle v2", path: "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2" },
  { name: "enervia-survey", path: "/mnt/c/Users/pO-Ch/Documents/GitHub/enervia-survey" },
  { name: "nasri-oracle", path: "/mnt/c/Users/pO-Ch/Documents/GitHub/nasri-oracle" },
];

// ─── Git Helper with 10s Timeout ──────────────────────────────────────
function safeGitCmd(cwd: string, cmd: string, timeoutMs = 10000): string {
  try {
    if (!existsSync(cwd)) return "";
    return execSync(`git -C "${cwd}" ${cmd}`, {
      encoding: "utf-8",
      timeout: timeoutMs,
      stderr: "ignore",
    }).trim();
  } catch {
    return "";
  }
}

// ─── Parse Worktrees via git worktree list --porcelain ────────────────
interface RawWorktreeInfo {
  path: string;
  branch: string;
}

function listWorktreesPorcelain(mainRepoPath: string): RawWorktreeInfo[] {
  const raw = safeGitCmd(mainRepoPath, "worktree list --porcelain");
  if (!raw) return [{ path: mainRepoPath, branch: "unknown" }];

  const worktrees: RawWorktreeInfo[] = [];
  const blocks = raw.split("\n\n");

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    let wtPath = "";
    let branch = "unknown";

    for (const l of lines) {
      if (l.startsWith("worktree ")) {
        wtPath = l.replace("worktree ", "").trim();
      } else if (l.startsWith("branch ")) {
        branch = l.replace("branch refs/heads/", "").trim();
      }
    }

    if (wtPath) {
      worktrees.push({ path: wtPath, branch });
    }
  }

  return worktrees.length > 0 ? worktrees : [{ path: mainRepoPath, branch: "unknown" }];
}

// ─── Probe Single Worktree ────────────────────────────────────────────
export function inspectWorktree(repoName: string, wtPath: string, defaultBranch = ""): WorktreeDriftItem {
  // 1. CRLF-filtered status count
  // git -c core.autocrlf=true status --short filters out CRLF line-ending noise
  const statusRaw = safeGitCmd(wtPath, "-c core.autocrlf=true status --short");
  const uncommittedLines = statusRaw ? statusRaw.split("\n").filter((l) => l.trim().length > 0) : [];
  const uncommittedCount = uncommittedLines.length;

  // 2. Get Branch name if unknown
  let branch = defaultBranch;
  if (!branch || branch === "unknown") {
    branch = safeGitCmd(wtPath, "rev-parse --abbrev-ref HEAD") || "unknown";
  }

  // 3. Get last commit timestamp ISO
  const lastCommitIso = safeGitCmd(wtPath, "log -1 --format=%cd --date=iso-strict");
  let lastCommitAt: string | null = null;
  let ageDays: number | null = null;

  if (lastCommitIso) {
    const ts = Date.parse(lastCommitIso);
    if (!isNaN(ts)) {
      lastCommitAt = new Date(ts).toISOString();
      const diffMs = Date.now() - ts;
      ageDays = Math.max(0, Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10);
    }
  }

  return {
    repo: repoName,
    path: wtPath,
    branch,
    uncommittedCount,
    lastCommitAt,
    ageDays,
  };
}

// ─── Main Fleet Worktree Drift Scanner ────────────────────────────────
export function getWorktreeDrift(): FleetWorktreeDriftReport {
  const worktreeItems: WorktreeDriftItem[] = [];

  for (const repoConfig of TARGET_REPOS) {
    if (!existsSync(repoConfig.path)) continue;

    // List all worktrees associated with this main repo
    const rawWts = listWorktreesPorcelain(repoConfig.path);
    for (const wt of rawWts) {
      if (existsSync(wt.path)) {
        const item = inspectWorktree(repoConfig.name, wt.path, wt.branch);
        worktreeItems.push(item);
      }
    }
  }

  const cleanCount = worktreeItems.filter((w) => w.uncommittedCount === 0).length;
  const driftCount = worktreeItems.filter((w) => w.uncommittedCount > 0).length;
  const totalUncommittedFiles = worktreeItems.reduce((sum, w) => sum + w.uncommittedCount, 0);

  return {
    worktrees: worktreeItems,
    totalWorktrees: worktreeItems.length,
    cleanCount,
    driftCount,
    totalUncommittedFiles,
    checkedAt: new Date().toISOString(),
  };
}

// ─── 60s In-Memory Cache Wrapper ─────────────────────────────────────
let cachedReport: FleetWorktreeDriftReport | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000; // 60s Cache TTL

export function getWorktreeDriftCached(forceRefresh = false): FleetWorktreeDriftReport {
  const now = Date.now();
  if (!forceRefresh && cachedReport && now < cacheExpiresAt) {
    return cachedReport;
  }
  cachedReport = getWorktreeDrift();
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedReport;
}

// ─── Example Hono Route ───────────────────────────────────────────────
/*
  In maw-js-server/src/server.ts:

  import { getWorktreeDriftCached } from "./worktree-drift";

  app.get("/api/worktrees/drift", (c) => {
    const refresh = c.req.query("refresh") === "1";
    return c.json(getWorktreeDriftCached(refresh));
  });
*/

// ─── Standalone CLI Execution ─────────────────────────────────────────
if (import.meta.main) {
  const report = getWorktreeDriftCached(true);
  console.log(JSON.stringify(report, null, 2));
}
