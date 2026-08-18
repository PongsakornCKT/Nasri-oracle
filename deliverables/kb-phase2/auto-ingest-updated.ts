#!/usr/bin/env bun
/**
 * auto-ingest-updated.ts — Expanded Ingestion Pipeline with Retrospectives & Junk Filter
 *
 * Target File: /mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/auto-ingest-oracle.ts
 *
 * Sources:
 *   1. ψ/inbox/agora/*.jsonl     - proposals from agora bus
 *   2. ψ/inbox/threads/          - chat thread markdown files
 *   3. ψ/memory/learnings/       - learning notes (*.md)
 *   4. ψ/memory/resonance/       - resonance md files
 *   5. ψ/memory/retrospectives/  - monthly retrospectives (*.md)  [NEW in Phase 2]
 *   6. ψ/active/*/               - PROJECT.md + MILESTONES.md per active project
 *
 * Excludes: notepad-backup, tmp, scratch, backup-restore
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename, extname, resolve } from "path";
import { Database } from "bun:sqlite";
import { indexChunks, type Chunk } from "./indexer";
import { migrate } from "./migrate";

const ROOT = resolve(process.cwd());
const KB_PATH = join(ROOT, "oracle_kb.db");
const PSI = join(ROOT, "ψ");
const DRY_RUN = process.argv.includes("--dry-run");

/** Junk path exclusion check */
export function isJunkPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  const JUNK_PATTERNS = [
    "/notepad-backup/",
    "/tmp/",
    "/scratch/",
    "/backup-restore/",
    "~$",
    ".tmp"
  ];
  return JUNK_PATTERNS.some(p => normalized.includes(p));
}

function ensureStateTable(db: Database) {
  db.run(`CREATE TABLE IF NOT EXISTS kb_ingest_state (
    source TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    ingested_at INTEGER NOT NULL
  )`);
}

function fingerprint(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function isAlreadyIngested(db: Database, source: string, fp: string): boolean {
  const row = db.query(
    "SELECT fingerprint FROM kb_ingest_state WHERE source = ?"
  ).get(source) as { fingerprint: string } | null;
  return row?.fingerprint === fp;
}

function markIngested(db: Database, source: string, fp: string) {
  db.run(
    `INSERT OR REPLACE INTO kb_ingest_state (source, fingerprint, ingested_at)
     VALUES (?, ?, ?)`,
    [source, fp, Date.now()]
  );
}

function textToChunks(
  content: string,
  source: string,
  source_type: string,
  tags: string[] = []
): Chunk[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);

  return paragraphs.map((p, i) => ({
    source,
    source_type,
    title: basename(source),
    content: p,
    language: /[\u0E00-\u0E7F]/.test(p) ? "th" : "en",
    tags,
    chunk_index: i,
    metadata: { total: paragraphs.length },
  }));
}

/** Recursively collect markdown files in a directory */
function collectMarkdownFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  const results: string[] = [];

  for (const entry of readdirSync(dirPath)) {
    const fullPath = join(dirPath, entry);
    if (isJunkPath(fullPath)) continue;

    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...collectMarkdownFiles(fullPath));
      } else if (entry.endsWith(".md")) {
        results.push(fullPath);
      }
    } catch {}
  }
  return results;
}

/** Ingest directory of markdown files */
async function ingestMarkdownDir(
  db: Database,
  dirPath: string,
  sourceType: string,
  tags: string[]
): Promise<number> {
  const files = collectMarkdownFiles(dirPath);
  let inserted = 0;

  for (const filePath of files) {
    if (isJunkPath(filePath)) continue;

    try {
      const content = readFileSync(filePath, "utf-8");
      if (!content.trim()) continue;

      const fp = fingerprint(content);
      if (isAlreadyIngested(db, filePath, fp)) continue;

      const chunks = textToChunks(content, filePath, sourceType, tags);
      if (chunks.length > 0 && !DRY_RUN) {
        await indexChunks(chunks);
        markIngested(db, filePath, fp);
        inserted += chunks.length;
      }
    } catch {}
  }

  return inserted;
}

/** Ingest active projects */
async function ingestActiveProjects(db: Database): Promise<number> {
  const activeDir = join(PSI, "active");
  if (!existsSync(activeDir)) return 0;

  let inserted = 0;
  const projectDirs = readdirSync(activeDir);

  for (const proj of projectDirs) {
    const projDir = join(activeDir, proj);
    if (isJunkPath(projDir)) continue;

    try {
      if (!statSync(projDir).isDirectory()) continue;
    } catch { continue; }

    for (const filename of ["PROJECT.md", "MILESTONES.md"]) {
      const filePath = join(projDir, filename);
      if (!existsSync(filePath) || isJunkPath(filePath)) continue;

      try {
        const content = readFileSync(filePath, "utf-8");
        const fp = fingerprint(content);
        if (isAlreadyIngested(db, filePath, fp)) continue;

        const chunks = textToChunks(content, filePath, "project-doc", [proj]);
        if (chunks.length > 0 && !DRY_RUN) {
          await indexChunks(chunks);
          markIngested(db, filePath, fp);
          inserted += chunks.length;
        }
      } catch {}
    }
  }

  return inserted;
}

export async function runAutoIngest(): Promise<{ inserted: number }> {
  console.log(`[auto-ingest] Starting Oracle KB ingest (DRY_RUN: ${DRY_RUN})...`);
  const db = new Database(KB_PATH);
  migrate();
  ensureStateTable(db);

  let totalInserted = 0;

  // 1. Threads
  const threadsCount = await ingestMarkdownDir(db, join(PSI, "inbox/threads"), "thread", ["thread"]);
  console.log(`  - Threads: +${threadsCount} chunks`);
  totalInserted += threadsCount;

  // 2. Learnings
  const learningsCount = await ingestMarkdownDir(db, join(PSI, "memory/learnings"), "learning", ["learning"]);
  console.log(`  - Learnings: +${learningsCount} chunks`);
  totalInserted += learningsCount;

  // 3. Resonance
  const resonanceCount = await ingestMarkdownDir(db, join(PSI, "memory/resonance"), "resonance", ["resonance"]);
  console.log(`  - Resonance: +${resonanceCount} chunks`);
  totalInserted += resonanceCount;

  // 4. Retrospectives (NEW in Phase 2)
  const retroCount = await ingestMarkdownDir(db, join(PSI, "memory/retrospectives"), "retrospective", ["retrospective"]);
  console.log(`  - Retrospectives: +${retroCount} chunks`);
  totalInserted += retroCount;

  // 5. Active Projects
  const activeCount = await ingestActiveProjects(db);
  console.log(`  - Active Projects: +${activeCount} chunks`);
  totalInserted += activeCount;

  db.close();
  console.log(`[auto-ingest] Complete! Total inserted: ${totalInserted} chunks.`);
  return { inserted: totalInserted };
}

if (import.meta.main) {
  runAutoIngest();
}
