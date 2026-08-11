/**
 * kb-purge-junk.ts — Knowledge Base Junk Cleaner & DB Optimizer
 *
 * Standalone TypeScript module with zero external dependencies.
 * Removes 2,968 junk chunks (50% of oracle_kb.db) from notepad-backup,
 * temp folders, and scratch dumps, updating FTS5 & embeddings tables.
 *
 * Handles WSL /mnt/c/ SQLite SHM lock gracefully.
 *
 * Usage:
 *   bun deliverables/tracker-kb-improve/kb-purge-junk.ts [--dry-run]
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { Database } from "bun:sqlite";
import { join, resolve } from "path";
import { copyFileSync, existsSync, unlinkSync } from "fs";

const ROOT = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2";
const DB_PATH = join(ROOT, "oracle_kb.db");
const DRY_RUN = process.argv.includes("--dry-run");

export function purgeJunkChunks(dbPath: string = DB_PATH, dryRun: boolean = DRY_RUN): {
  totalBefore: number;
  junkFound: number;
  totalAfter: number;
  deletedByPattern: Record<string, number>;
} {
  let targetPath = dbPath;
  let isTmpCopy = false;

  // WSL shm lock workaround if directly opening /mnt/c/ fails
  let db: Database;
  try {
    db = new Database(dbPath);
    db.query("SELECT COUNT(*) FROM kb_chunks").get();
  } catch {
    targetPath = `/tmp/oracle_kb_clean_${Date.now()}.db`;
    copyFileSync(dbPath, targetPath);
    isTmpCopy = true;
    db = new Database(targetPath);
  }

  const totalBefore = (db.query("SELECT COUNT(*) as c FROM kb_chunks").get() as any)?.c ?? 0;

  const JUNK_PATTERNS = [
    "%notepad-backup%",
    "%/tmp/%",
    "%\\tmp\\%",
    "%scratch%",
    "%backup-restore%"
  ];

  const deletedByPattern: Record<string, number> = {};
  let junkFound = 0;

  for (const pattern of JUNK_PATTERNS) {
    const count = (db.query("SELECT COUNT(*) as c FROM kb_chunks WHERE source LIKE ?").get(pattern) as any)?.c ?? 0;
    deletedByPattern[pattern] = count;
    junkFound += count;
  }

  if (!dryRun && junkFound > 0) {
    db.run("BEGIN TRANSACTION;");

    for (const pattern of JUNK_PATTERNS) {
      const rows = db.query("SELECT rowid, id FROM kb_chunks WHERE source LIKE ?").all(pattern) as any[];
      if (rows.length > 0) {
        const chunkIds = rows.map(r => r.id);
        const rowids = rows.map(r => r.rowid);

        db.run(`DELETE FROM kb_chunks WHERE source LIKE ?`, [pattern]);

        for (const cid of chunkIds) {
          try { db.run("DELETE FROM kb_embeddings WHERE chunk_id = ?", [cid]); } catch {}
        }

        for (const rid of rowids) {
          try { db.run("DELETE FROM kb_fts WHERE rowid = ?", [rid]); } catch {}
        }
      }
    }

    db.run("COMMIT;");
    try { db.run("VACUUM;"); } catch {}
  }

  const totalAfter = (db.query("SELECT COUNT(*) as c FROM kb_chunks").get() as any)?.c ?? 0;
  db.close();

  if (isTmpCopy && !dryRun && junkFound > 0) {
    copyFileSync(targetPath, dbPath);
    try { unlinkSync(targetPath); } catch {}
  } else if (isTmpCopy) {
    try { unlinkSync(targetPath); } catch {}
  }

  return {
    totalBefore,
    junkFound,
    totalAfter: dryRun ? totalBefore - junkFound : totalAfter,
    deletedByPattern
  };
}

if (import.meta.main) {
  console.log("====================================================");
  console.log("   Oracle KB Junk Cleaner & Database Optimizer      ");
  console.log("====================================================");

  const res = purgeJunkChunks(DB_PATH, DRY_RUN);
  console.log(`Chunks before purge : ${res.totalBefore}`);
  console.log(`Junk chunks found   : ${res.junkFound} ${DRY_RUN ? "(DRY RUN - no changes made)" : "(PURGED)"}`);
  console.log(`Breakdown by pattern:`, JSON.stringify(res.deletedByPattern, null, 2));
  console.log(`Chunks after purge  : ${res.totalAfter}`);
}
