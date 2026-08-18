# Vectorization Backfill Execution Guide (#VectorizeRun)

**Target Script**: `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/vectorize.ts`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11  

---

## 🎯 สรุปขั้นตอนการทำ Vector Backfill

หลังจากรันสคริปต์ `cleanup.sql` เพื่อล้างขยะ 2,988 รายการเรียบร้อยแล้ว ฐานข้อมูลจะมี chunks ข้อมูลสะอาดคงเหลือประมาณ **2,969 chunks** ขั้นตอนนี้คือการรัน `vectorize.ts` เพื่อสร้าง 1024-dim Float32 Vectors ด้วยโมเดล `bge-m3` และบันทึกลงในตาราง `kb_embeddings` และ `vec_items`

---

## 1. คำสั่งการทำงานจริง (CLI Commands)

```bash
cd "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2"

# 1. ตรวจสอบความพร้อมของ Ollama และ bge-m3 model
bun scripts/knowledge/vectorize.ts --check
# Expected: reachable: ✅, bge-m3: ✅

# 2. ตรวจสอบสถิติสแกนเริ่มต้นก่อนรัน
bun scripts/knowledge/vectorize.ts --stats

# 3. รัน Vectorization สำหรับทุก Chunks ที่ยังไม่มี Embedding (แนะนำ)
bun scripts/knowledge/vectorize.ts

# หรือหากต้องการทดสอบเป็น Batch สั้นๆ (เช่น 100 chunks แรก)
bun scripts/knowledge/vectorize.ts --limit 100
```

---

## ⏱️ 2. การประมาณเวลาทำงาน (Time Estimation)

- **จำนวน Chunks ข้อมูลสะอาด**: ~2,969 chunks
- **ความเร็วในการประมวลผลต่อ Chunk**: ~0.3 - 0.5 วินาที / chunk (ประมวลผลบน GPU VRAM ด้วย `bge-m3`)
- **ประมาณเวลาทำงานรวม**: **15 - 25 นาที** สำหรับการฝังข้อมูลครบ 100% (2,969 chunks)

---

## 🔍 3. จุดเปิดตรวจดูความคืบหน้า (Verification Points)

### (ก) ดู Log จากหน้าจอ Terminal
สคริปต์จะพิมพ์รายงานความคืบหน้าทุกๆ 10 chunks (`BATCH_LOG_INTERVAL = 10`):
```text
[vectorize] 10/2969 (0.3%) — embedded: 10, skipped: 0
[vectorize] 20/2969 (0.7%) — embedded: 20, skipped: 0
...
[vectorize] 2969/2969 (100.0%) — embedded: 2969, skipped: 0
```

### (ข) ตรวจสอบผ่าน SQL Query
สามารถเปิดอีกหน้าต่าง Terminal เช็คจำนวนแถวที่บันทึกแล้วได้ตลอดเวลา:
```bash
sqlite3 "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle_kb.db" "SELECT COUNT(*) FROM kb_embeddings;"
```

### (ค) ตรวจสอบด้วยคำสั่ง `--stats`
```bash
bun scripts/knowledge/vectorize.ts --stats

# Expected Final Output:
# 𓂀 KB Vector Coverage:
#   Total chunks    : 2969
#   Embedded chunks : 2969 (100.0%)
#   Pending         : 0
```

---

## ⚠️ 4. คำเตือนเรื่องการแชร์ทรัพยากร GPU กับ wy Agent

> **IMPORTANT WARNING**:  
> ในระหว่างที่ `vectorize.ts` กำลังทำงานประมวลผล Vector batch อย่างต่อเนื่อง Ollama จะใช้ทรัพยากร GPU VRAM ร่วมกับเอเจนต์ wy (`wy-oracle`)  
> **ผลกระทบ**: ในช่วงที่ Vectorization กำลังรัน การตอบสนองคำถามของเอเจนต์ wy อาจจะช้าลงเล็กน้อย (+1 ถึง 3 วินาทีต่อคำถาม) เนื่องจากต้องแบ่งรอบคำนวณบน GPU  
> **แนวทางปฏิบัติ**: การรัน vectorize เป็นกระบวนการที่ปลอดภัย (Safe Batching) และเมื่อรันครบ 100% แล้ว ความเร็วการตอบของ wy จะกลับเข้าสู่ระดับปกติทันที
