-- ============================================================================
-- cleanup.sql — Oracle Knowledge Base Junk Purger & FTS5 Rebuild Script
-- Target Database: /mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle_kb.db
-- Author: Nasri Oracle — Right Hand of Ma'at 𓂀
-- Date: 2026-08-11
--
-- Note for pa Oracle: รันสคริปต์นี้หลังจากทำการสำรองไฟล์ (backup) oracle_kb.db เรียบร้อยแล้ว
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ขั้นตอนที่ 1: SELECT นับจำนวนแถวขยะก่อนทำการลบ (Verification Count)
-- เพื่อยืนยันว่ามีขยะ 2,968 แถวจาก notepad-backup และ 20 แถวจาก backup-restore
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS junk_chunks_to_delete
FROM kb_chunks
WHERE source LIKE '%notepad-backup%'
   OR source LIKE '%/tmp/%'
   OR source LIKE '%\tmp\%'
   OR source LIKE '%scratch%'
   OR source LIKE '%backup-restore%';

-- แสดงรายละเอียดแยกตาม Pattern
SELECT 
  CASE 
    WHEN source LIKE '%notepad-backup%' THEN 'notepad-backup'
    WHEN source LIKE '%backup-restore%' THEN 'backup-restore'
    ELSE 'other-tmp'
  END AS pattern_group,
  COUNT(*) AS count
FROM kb_chunks
WHERE source LIKE '%notepad-backup%'
   OR source LIKE '%/tmp/%'
   OR source LIKE '%\tmp\%'
   OR source LIKE '%scratch%'
   OR source LIKE '%backup-restore%'
GROUP BY pattern_group;


-- ----------------------------------------------------------------------------
-- ขั้นตอนที่ 2: เริ่ม Transaction และลบขยะจากตาราง kb_embeddings (ถ้ามี FK)
-- ----------------------------------------------------------------------------
BEGIN TRANSACTION;

-- ลบข้อมูล Vector Embedding ของขยะที่ตรงกับเงื่อนไข
DELETE FROM kb_embeddings
WHERE chunk_id IN (
  SELECT id FROM kb_chunks
  WHERE source LIKE '%notepad-backup%'
     OR source LIKE '%/tmp/%'
     OR source LIKE '%\tmp\%'
     OR source LIKE '%scratch%'
     OR source LIKE '%backup-restore%'
);


-- ----------------------------------------------------------------------------
-- ขั้นตอนที่ 3: ลบขยะออกจากตารางหลัก kb_chunks
-- (คอลัมน์ source คือคอลัมน์เก็บ File Path ตาม Schema จริง)
-- ----------------------------------------------------------------------------
DELETE FROM kb_chunks
WHERE source LIKE '%notepad-backup%'
   OR source LIKE '%/tmp/%'
   OR source LIKE '%\tmp\%'
   OR source LIKE '%scratch%'
   OR source LIKE '%backup-restore%';


-- ----------------------------------------------------------------------------
-- ขั้นตอนที่ 4: รีบิลด์ FTS5 Index (Rebuild kb_fts External Content Index)
-- เนื่องจาก kb_fts ถูกสร้างแบบ External Content Table (content='kb_chunks')
-- การลบข้อมูลใน kb_chunks จะไม่ลบดรรชนีใน kb_fts_idx/kb_fts_data โดยอัตโนมัติ
-- คำสั่ง rebuild จะทำการสร้าง ดรรชนี FTS5 ใหม่ทั้งหมดให้ตรงกับ kb_chunks ที่เหลืออยู่
-- ----------------------------------------------------------------------------
INSERT INTO kb_fts(kb_fts) VALUES('rebuild');

COMMIT;


-- ----------------------------------------------------------------------------
-- ขั้นตอนที่ 5: คืนพื้นที่ดิสก์และบีบอัดฐานข้อมูล (Reclaim Disk Space)
-- ลดขนาดไฟล์ oracle_kb.db จาก 8.7 MB เหลือ ~4.2 MB
-- ----------------------------------------------------------------------------
VACUUM;


-- ----------------------------------------------------------------------------
-- ขั้นตอนที่ 6: SELECT ตรวจสอบจำนวนแถวหลังการลบ (Post-Purge Verification)
-- จำนวนแถวควรเหลือ 2,969 chunks ที่สะอาด
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS clean_chunks_remaining FROM kb_chunks;
SELECT COUNT(*) AS fts_rows_remaining FROM kb_fts;
