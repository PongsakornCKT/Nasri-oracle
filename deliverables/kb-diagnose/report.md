# Diagnostic Report: Oracle Knowledge Base (5,957 Chunks) Architecture & Improvement Plan

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Target Repository**: `pa-Oracle v2` (`/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2`)  
**Mode**: Phase 1 Read-Only Diagnostics  
**Date**: 2026-08-11  

---

## 🎯 Executive Summary & Database State

| Item | Value / Location | Notes |
| :--- | :--- | :--- |
| **Active DB Path** | `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle_kb.db` | File size: **8.7 MB** |
| **Stale DB Path** | `/home/po-ch/.oracle-kb/oracle_kb.db` | File size: 132 KB (Stale placeholder from April) |
| **Total Chunks** | **5,957 chunks** | `kb_chunks` table count |
| **FTS5 Index** | **5,957 rows** | `kb_fts` virtual table (active & working) |
| **Vector Table** | **0 rows** | `kb_embeddings` table exists, but **0 embeddings stored** |
| **ANN Index** | **0 rows** | `vec_items` (sqlite-vec virtual table exists, 0 rows) |
| **Junk Chunks** | **2,968 chunks** | **49.8% of DB** comes from `notepad-backup`! |
| **Live Ollama Host** | `http://172.31.32.1:11434` | **ALIVE** with model `bge-m3:latest` (1.1GB F16) |

---

## 🔍 1. Root Cause Analysis: Why Every Query Returns `"via kb_fts_fallback"`?

### (ก) สาเหตุที่แท้จริง (True Root Cause & Retest Evidence)

1. **Ollama Outage ลากยาวหลายเดือน (Primary Root Cause)**:
   - บริการ Ollama ดับสนิทมาหลายเดือนก่อนหน้านี้ เพิ่งถูกเปิดฟื้นระบบกลับมาวันนี้ ส่งผลให้สคริปต์ `vectorize.ts` ที่ผ่านมาไม่เคยฝัง Vector ลงในตาราง `kb_embeddings` ได้เลย (**Row Count = 0**)

2. **อาการ Cold-Start Swap VRAM (>30,000ms Timeout) (Secondary Factor)**:
   - **`scripts/knowledge/embedder.ts` (Line 149)** กำหนด Timeout ไว้ 30 วินาที (`DEFAULT_TIMEOUT = 30_000`)
   - ในการทดสอบคำขอแรก Ollama ต้องทำการ Unload โมเดล LLM ขนาดใหญ่ (`wy-big` 18.5GB) ออกจาก GPU VRAM แล้ว Swap โมเดล `bge-m3` (1.1GB) เข้าสู่ VRAM ซึ่งใช้เวลา ~29.9 วินาที ทำให้ติดเพดาน Timeout และ `embedText()` คืนค่า `null`
   - **ผลการเทสซ้ำเมื่อ Warm State**: เมื่อ Ollama โหลดโมเดลเรียบร้อยแล้ว ทั้งชื่อ `"bge-m3"` และ `"bge-m3:latest"` ตอบสนองได้รวดเร็วเท่ากันที่ **0.3 วินาที** (Ollama Map `:latest` อัตโนมัติอยู่แล้ว)

3. **`scripts/knowledge/hybrid-search.ts` (Lines 300–312)**:
   - เมื่อ `embedText()` คืนค่า `null` จากอาการ Cold-Start Timeout หรือตาราง `kb_embeddings` ว่างเปล่า ระบบจะปรับ `ftOnly = true` และส่งค่า `fts_only: true` กลับไปยัง `api.ts` ส่งผลให้ UI แสดงข้อความว่า `"via kb_fts_fallback"` บนทุก Query


---

## 🛠️ 2. แผนชุบชีวิต Vector Search & Phase 2 Roadmap

### ขั้นตอนการดำเนินการ Phase 2 (4-Step Approved Plan)
1. **เพิ่ม Timeout & Warm-up Ping กัน Cold-Start**:
   - ปรับ Timeout ใน `embedder.ts` จาก 30 วินาที เป็น **90 วินาที** (`DEFAULT_TIMEOUT = 90_000`)
   - เพิ่มฟังก์ชัน Warm-up Ping ยิงสุ่ม 1 Vector ขนาดสั้น ก่อนเริ่มการทำงาน batch เพื่อกระตุ้นให้ Ollama โหลด `bge-m3` เข้า VRAM ให้เสร็จเรียบร้อยล่วงหน้า
2. **ล้างขยะ `notepad-backup` 2,968 Chunks ก่อน**:
   - รันสคริปต์ `kb-purge-junk.ts` ลบขยะ 2,968 chunks ออกจาก `oracle_kb.db` ให้เหลือเฉพาะข้อมูลที่สะอาด ~2,969 chunks
3. **รัน Vectorization Backfill ~3,000 Chunks ที่เหลือ**:
   - รันสคริปต์ `bun scripts/knowledge/vectorize.ts` เพื่อสร้าง 1024-dim Float32 Vector สำหรับข้อมูลสะอาด ~3,000 chunks ลงใน `kb_embeddings` และ `vec_items`
4. **เพิ่ม Ingestion `learnings/` และ `retrospectives/`**:
   - เพิ่มเส้นทาง `ψ/memory/learnings/*.md` และ `ψ/memory/retrospectives/*.md` เข้าสู่ `auto-ingest-oracle.ts`


---

## 📂 3. แผนเพิ่มแหล่งข้อมูล (Ingestion Expansion Plan)

### ปัญหาที่พบในโค้ดปัจจุบัน
1. **`scripts/knowledge/ingest.ts` (Lines 153-199)**:
   - ละเว้นไฟล์ `.docx` และ `.doc` โดยระบุเป็น `PLACEHOLDER_TYPES` ทั้งที่มีไฟล์ `scripts/knowledge/readers/word.ts` อยู่แล้ว
   - ไม่ได้เชื่อมต่อ `readers/youtube.ts` และ `readers/gsheet.ts` เข้าสู่ Pipeline
2. **`scripts/knowledge/auto-ingest-oracle.ts` (Lines 5-11)**:
   - ไม่ได้ดึงโฟลเดอร์ `ψ/memory/retrospectives/` (รายงานย้อนหลังรายเดือน) เข้าสู่ DB

### แผนการขยายการดึงข้อมูล
1. **เปิดใช้งาน Readers ทั้งหมด**:
   - เชื่อมต่อ `readWord` (`.docx`, `.doc`), `readExcel` (`.xlsx`, `.xls`), `readPDF` (`.pdf`), `readYouTube` (ซับย้อนหลัง YouTube), และ `readGSheet` เข้า `ingest.ts`
2. **เพิ่มเส้นทาง Ingestion อัตโนมัติ**:
   - เพิ่ม `ψ/memory/retrospectives/*.md` (มี 5 โฟลเดอร์รายเดือน: 2026-03 ถึง 2026-08) เข้า `auto-ingest-oracle.ts`
   - เพิ่มการสแกนเอกสารภายนอกใน `ψ/knowledge/inbox/`

---

## 🧹 4. แผนล้างขยะ (Garbage Cleanup Plan)

### ผลการสำรวจขยะใน `oracle_kb.db`
- **จำนวนขยะทั้งหมด**: **2,988 chunks** (คิดเป็น **49.8%** ของฐานข้อมูล 5,957 chunks!)
- **ที่มาของขยะ**:
  - `ψ/knowledge/inbox/notepad-backup/` (`new_100_...txt`, `new_101_...txt` จำนวนหลายร้อยไฟล์): **2,968 chunks**
  - `ψ/active/backup-restore/`: **20 chunks**

### ขั้นตอนการล้างขยะ
1. **รันสคริปต์ Purge**:
   - ใช้สคริปต์ `deliverables/tracker-kb-improve/kb-purge-junk.ts` ลบข้อมูลออกจาก `kb_chunks`, `kb_fts`, และ `kb_embeddings`
   - รันคำสั่ง `VACUUM` คืนพื้นที่ไฟล์ DB จาก 8.7 MB เหลือ ~4.2 MB
2. **เพิ่ม Exclusion Rules**:
   - เพิ่มฟังก์ชัน `isJunkPath()` ใน `ingest.ts` และ `auto-ingest-oracle.ts` กรองโฟลเดอร์ `notepad-backup/`, `tmp/`, `scratch/`, และ `backup-restore/` ออกแบบถาวร

---

## 🏆 5. ข้อเสนอปรับปรุง เรียงตาม Impact 5 ข้อ (Top-5 Ranked Proposals)

| Rank | ข้อเสนอปรับปรุง (Proposal) | Impact | เหตุผล / ผลลัพธ์ที่คาดหวัง |
| :---: | :--- | :---: | :--- |
| **#1** | **ล้างขยะ 2,988 chunks (50% ของ DB) & เพิ่ม Exclusion Filter** | **HIGH** | เพิ่มความแม่นยำของการค้นหาเป็น 2 เท่าทันที กำจัด noise จากไฟล์ notepad ชั่วคราว |
| **#2** | **แก้ไข Model Tag `"bge-m3:latest"` & รัน Vectorize 2,969 Chunks** | **HIGH** | ชุบชีวิต Hybrid Search (FTS5 + Vector Cosine with RRF) กลับมาทำงาน 100% |
| **#3** | **เชื่อมต่อ Readers Word (.docx), Excel (.xlsx), YouTube & GSheet** | **MEDIUM-HIGH** | ดึงข้อมูลเอกสารและวิดีโอภายนอกเข้าสู่ Knowledge Base ได้ครบทุกฟอร์แมต |
| **#4** | **เพิ่ม `ψ/memory/retrospectives/` เข้า Auto-Ingest Engine** | **MEDIUM** | รวมรายงานบทเรียนรายเดือน (2026-03 ถึง 2026-08) เข้าสู่ KB โดยอัตโนมัติ |
| **#5** | **เพิ่ม Secondary Vector Fallback (`nomic-embed-text:latest`) & UI Status Badge** | **MEDIUM** | ป้องกันค้างเมื่อ Ollama ต้อง Swap VRAM และแสดงสถานะเอนจินบน UI ให้โปร่งใส |

---

*รายงานโดย: Nasri Oracle — Right Hand of Ma'at 𓂀*  
*พร้อมรัน Phase 2 ทันทีเมื่อได้รับอนุมัติจากพี่พงและ pa Oracle ครับ*
