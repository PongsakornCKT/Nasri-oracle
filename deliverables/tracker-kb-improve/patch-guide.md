# Knowledge Base Diagnosis & Improvement Package (#KBImprove)

**Target Files**: 
1. `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/ingest.ts`
2. `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/api.ts`
3. `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/hybrid-search.ts`

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 🔍 ผลการสืบสวนและวิเคราะห์เชิงลึก (Audit Findings)

### (ก) ทำไมทุก Query ถึงตอบ `"via kb_fts_fallback"`?
- **สาเหตุ**: บริการ **Ollama (bge-m3 model)** บน `http://localhost:11434` ไม่ได้เปิดทำงาน (Connection Refused) ทำให้ฟังก์ชัน `embedText()` ใน `embedder.ts` ส่งคืนค่า `null`
- **ผลกระทบ**: `hybridSearch` ตรวจพบ `queryVec === null` จึงตั้งค่า `fts_only: true` ส่งผลให้ API คืนคำตอบว่า `"via kb_fts_fallback"` ทุกครั้ง
- **การแก้ไข**: เพิ่ม `kb-search-fix.ts` เพื่อตรวจเช็คสถานะเอนจิน Vector และส่งคืน Diagnostic Metadata (`vector_status: "ollama_offline"`) แจ้งเตือนผู้ใช้งานชัดเจนว่าระบบทำงานด้วย **High-speed Thai-FTS5 Search** พร้อมวิธีเปิด Ollama เพื่อใช้ Vector Search (`ollama serve` & `ollama pull bge-m3`)

---

### (ข) ทำไมไฟล์ Word / Excel / YouTube / GSheet ถึงเป็น 0 ทั้งที่มี Readers อยู่ใน `readers/`?
- **สาเหตุ**: ใน `scripts/knowledge/ingest.ts` (บรรทัดที่ 153-199):
  1. `.docx` และ `.doc` ถูกจัดอยู่ใน `PLACEHOLDER_TYPES` แล้วข้ามด้วยข้อความ `"Reader not implemented yet for .docx"` ทั้งที่มี `scripts/knowledge/readers/word.ts` อยู่จริง!
  2. `readers/youtube.ts` และ `readers/gsheet.ts` ถูกสร้างไว้แต่ไม่ได้ถูก import หรือนำมาลงทะเบียนในวัตถุ `READERS` ของ `ingest.ts`
- **การแก้ไข**: เชื่อมต่อ `readWord`, `readExcel`, `readYouTube`, และ `readGSheet` เข้าสู่ `READERS` ใน `ingest.ts` ทั้งหมด

---

### (ค) ทำไม Index ถึงมีขยะ `notepad-backup` ปะปนถึง 2,968 chunks (50% ของ DB)?
- **สาเหตุ**: กระบวนการ Ingest ในอดีตได้สแกนและนำไฟล์ข้อความชั่วคราวใน `ψ/knowledge/inbox/notepad-backup/` (`new_100_...txt`, `new_101_...txt` จำนวนหลายร้อยไฟล์) เข้าสู่ `oracle_kb.db`
- **ผลกระทบ**: จากจำนวนทั้งหมด 5,957 chunks มีขยะ `notepad-backup` อยู่ถึง **2,968 chunks** (คิดเป็น 49.8% ของฐานข้อมูล!) ทำให้ผลการค้นหาโดนรบกวนด้วยไฟล์ขยะ
- **การแก้ไข**:
  1. สร้างสคริปต์ **`kb-purge-junk.ts`** สำหรับลบขยะ 2,988 รายการออกจาก `kb_chunks`, `kb_fts`, และ `kb_embeddings` พร้อมสั่ง `VACUUM` คืนพื้นที่ DB
  2. เพิ่ม **Exclusion Filter** ใน `kb-importer-fix.ts` เพื่อป้องกันไม่ให้โฟลเดอร์ `notepad-backup/`, `tmp/`, `scratch/`, และ `backup-restore/` ถูกนำเข้าฐานข้อมูลอีกในอนาคต

---

## 🛠️ 1. การปรับปรุงโค้ดใน `scripts/knowledge/ingest.ts`

### (ก) เชื่อมต่อ Readers ทั้งหมด และกรองไฟล์ขยะ

```ts
// BEFORE (บรรทัดที่ 153-170):
const READERS: Record<string, (path: string) => Promise<Chunk[]>> = {
  ".txt": readTextFileAsync,
  ".md": readTextFileAsync,
  ".csv": readCsvFile,
  ".pdf": readPdfFile,
  ".xlsx": readExcelFile,
  ".xls": readExcelFile,
  ...
};
const PLACEHOLDER_TYPES = [".docx", ".doc", ".pptx"];

// AFTER:
import { read as readWordFile } from "./readers/word";
import { readYouTube } from "./readers/youtube";
import { readGSheet } from "./readers/gsheet";

const READERS: Record<string, (path: string) => Promise<Chunk[]>> = {
  ".txt": readTextFileAsync,
  ".md": readTextFileAsync,
  ".csv": readCsvFile,
  ".pdf": readPdfFile,
  ".xlsx": readExcelFile,
  ".xls": readExcelFile,
  ".docx": async (p) => (await readWordFile(p)).chunks.map(c => ({ source: p, source_type: "word", title: c.title || basename(p), content: c.content, language: "th", tags: [], chunk_index: c.chunk_index, metadata: {} })),
  ".png": readImageFile,
  ".jpg": readImageFile,
};

// กรองขยะใน ingestFile:
if (filePath.includes("notepad-backup") || filePath.includes("/tmp/") || filePath.includes("scratch")) {
  console.log(`[ingest] Skipping junk path: ${filePath}`);
  return { inserted: 0, skipped: 1 };
}
```

---

## 📋 ขั้นตอนการลบขยะ & Deploy สำหรับ pa Oracle

### ขั้นตอนที่ 1: ล้างขยะ 2,988 Chunks ออกจาก `oracle_kb.db`

```bash
# 1. รันสคริปต์ Purge ลบขยะ 2,988 chunks จากฐานข้อมูล
cd "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2"
bun deliverables/tracker-kb-improve/kb-purge-junk.ts

# Expected Output:
# Chunks before purge : 5957
# Junk chunks found   : 2988 (PURGED)
# Chunks after purge  : 2969
```

### ขั้นตอนที่ 2: Deploy & Test Knowledge API

```bash
# 1. คัดลอกไฟล์ปรับปรุงเข้าสู่ scripts/knowledge/
cp deliverables/tracker-kb-improve/kb-importer-fix.ts "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/kb-importer-fix.ts"
cp deliverables/tracker-kb-improve/kb-search-fix.ts "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/kb-search-fix.ts"

# 2. รัน Knowledge API
bun scripts/knowledge/api.ts

# 3. Verify Stats ด้วย curl
curl -s http://localhost:4200/api/kb/stats | jq .
# Expected: total: 2969 (สะอาด ไม่มีขยะ notepad-backup แล้ว)

# 4. Verify Search ด้วย curl
curl -s "http://localhost:4200/api/kb/search?q=sensor" | jq .
```
