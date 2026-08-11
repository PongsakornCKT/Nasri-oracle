/**
 * worktree-drift.ts — Active Worktree Drift & Uncommitted Changes Monitor
 *
 * Standalone TypeScript module with zero external dependencies.
 * Scans active worktrees to measure git drift, uncommitted file counts,
 * and last commit timestamp.
 *
 * Includes a 10s In-memory Cache TTL to prevent WSL I/O slowdowns.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { execSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

// ─── Interfaces ──────────────────────────────────────────────────────
export interface WorktreeDriftInfo {
  name: string;
  path: string;
  branch: string;
  repo: string;
  status: "active" | "stale" | "orphan";
  uncommittedCount: number;
  uncommittedFiles: string[];
  lastCommitTime: string | null;
  lastCommitAgeSec: number | null;
  hasDrift: boolean;
}

export interface FleetWorktreeDriftSummary {
  worktrees: WorktreeDriftInfo[];
  total: number;
  cleanCount: number;
  driftCount: number;
  totalUncommittedFiles: number;
  checkedAt: string;
}

// ─── Git Helper Functions ─────────────────────────────────────────────
/** Run git command in specified directory safely */
function runGitCmd(cwd: string, cmd: string): string {
  try {
    if (!existsSync(cwd)) return "";
    return execSync(`git -C "${cwd}" ${cmd}`, {
      encoding: "utf-8",
      timeout: 3000,
      stderr: "ignore",
    }).trim();
  } catch {
    return "";
  }
}

/** Probe uncommitted changes count and list in a worktree */
export function getWorktreeDriftStatus(wtPath: string, name = "", repo = "", branch = ""): WorktreeDriftInfo {
  const dirName = name || wtPath.split("/").pop() || "unknown";

  // 1. Get git status --porcelain
  const porcelain = runGitCmd(wtPath, "status --porcelain");
  const uncommittedFiles = porcelain ? porcelain.split("\n").filter(Boolean) : [];
  const uncommittedCount = uncommittedFiles.length;

  // 2. Get last commit ISO timestamp
  const lastCommitStr = runGitCmd(wtPath, "log -1 --format=%cd --date=iso-strict");
  let lastCommitTime: string | null = null;
  let lastCommitAgeSec: number | null = null;

  if (lastCommitStr) {
    const ts = Date.parse(lastCommitStr);
    if (!isNaN(ts)) {
      lastCommitTime = new Date(ts).toISOString();
      lastCommitAgeSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    }
  }

  // 3. Get branch if not provided
  if (!branch) {
    branch = runGitCmd(wtPath, "rev-parse --abbrev-ref HEAD") || "unknown";
  }

  const hasDrift = uncommittedCount > 0;

  return {
    name: dirName,
    path: wtPath,
    branch,
    repo: repo || dirName,
    status: existsSync(join(wtPath, ".git")) ? "active" : "stale",
    uncommittedCount,
    uncommittedFiles,
    lastCommitTime,
    lastCommitAgeSec,
    hasDrift,
  };
}

// ─── Scan All Worktrees ───────────────────────────────────────────────
export function scanFleetWorktreesDrift(ghqRoot = "/home/po-ch/ghq"): FleetWorktreeDriftSummary {
  const worktreeList: WorktreeDriftInfo[] = [];

  // Default scan paths including known worktrees on this machine
  const knownPaths = [
    "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-oracle-wt-tracker-exec",
    "/mnt/c/Users/pO-Ch/Documents/GitHub/nasri-oracle",
  ];

  // Try finding .wt- directories under ghq or github
  try {
    const findOutput = execSync(`find /home/po-ch/ghq /mnt/c/Users/pO-Ch/Documents/GitHub -maxdepth 3 -name "*.wt-*" -type d 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 4000,
    });
    const paths = findOutput.split("\n").filter(Boolean);
    for (const p of paths) {
      if (!knownPaths.includes(p)) knownPaths.push(p);
    }
  } catch {}

  for (const p of knownPaths) {
    if (existsSync(p)) {
      worktreeList.push(getWorktreeDriftStatus(p));
    }
  }

  const driftCount = worktreeList.filter((w) => w.hasDrift).length;
  const cleanCount = worktreeList.length - driftCount;
  const totalUncommittedFiles = worktreeList.reduce((acc, w) => acc + w.uncommittedCount, 0);

  return {
    worktrees: worktreeList,
    total: worktreeList.length,
    cleanCount,
    driftCount,
    totalUncommittedFiles,
    checkedAt: new Date().toISOString(),
  };
}

// ─── In-Memory Cache with 10s TTL ────────────────────────────────────
let cachedDrift: FleetWorktreeDriftSummary | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 10_000; // 10s TTL

export function getWorktreeDriftCached(forceRefresh = false): FleetWorktreeDriftSummary {
  const now = Date.now();
  if (!forceRefresh && cachedDrift && now < cacheExpiresAt) {
    return cachedDrift;
  }
  cachedDrift = scanFleetWorktreesDrift();
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedDrift;
}

// ─── Standalone CLI Execution Block ───────────────────────────────────
if (import.meta.main) {
  const data = getWorktreeDriftCached(true);
  console.log(JSON.stringify(data, null, 2));
}
