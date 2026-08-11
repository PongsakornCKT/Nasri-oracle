-- purge-junk.sql — Oracle Knowledge Base Junk Cleaner SQL Script
-- Target DB: /mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle_kb.db
-- Purges 2,968 junk notepad-backup chunks and 20 backup-restore chunks (50% of DB)
-- Author: Nasri Oracle — Right Hand of Ma'at 𓂀
-- Date: 2026-08-11

BEGIN TRANSACTION;

-- 1. Delete matching chunks from kb_embeddings (if any exist)
DELETE FROM kb_embeddings
WHERE chunk_id IN (
  SELECT id FROM kb_chunks
  WHERE source LIKE '%notepad-backup%'
     OR source LIKE '%/tmp/%'
     OR source LIKE '%\tmp\%'
     OR source LIKE '%scratch%'
     OR source LIKE '%backup-restore%'
);

-- 2. Delete matching chunks from FTS5 index
DELETE FROM kb_fts
WHERE rowid IN (
  SELECT rowid FROM kb_chunks
  WHERE source LIKE '%notepad-backup%'
     OR source LIKE '%/tmp/%'
     OR source LIKE '%\tmp\%'
     OR source LIKE '%scratch%'
     OR source LIKE '%backup-restore%'
);

-- 3. Delete matching chunks from kb_chunks primary table
DELETE FROM kb_chunks
WHERE source LIKE '%notepad-backup%'
   OR source LIKE '%/tmp/%'
   OR source LIKE '%\tmp\%'
   OR source LIKE '%scratch%'
   OR source LIKE '%backup-restore%';

COMMIT;

-- 4. Reclaim disk space
VACUUM;
