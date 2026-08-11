# Learnings: MAW Office Top-5 Deliveries & Production Safety (2026-08-11)

> "ลงมือทำ ไม่รอคำสั่งซ้ำ — มือขวาแห่ง Ma'at 𓂀"

## Key Learnings from pa Oracle's Review & Live Integration

### 1. Production Atomic Write & Spec Rigor (สเปกคือเกราะ ไม่ใช่พิธี)
- **Problem**: การเขียนไฟล์ JSON ตรงๆ (`writeFileSync`) โดยไม่มีขั้นตอน `.tmp` เสี่ยงต่อการทำให้ไฟล์ข้อมูลกลาง (`data/task-claims.json`) corrupted หาก process ถูกปิดหรือตายกลางคัน
- **Fix Pattern**: 
  1. เขียนลงไฟล์ชั่วคราวก่อนเสมอ (`filePath + ".tmp"`)
  2. ใช้ `renameSync(tmpPath, filePath)` เพื่อย้ายไฟล์ทับแบบ Atomic Operation บน OS เดียวกัน
- **Lesson**: Spec ที่ pa หรือพี่พงเขียนอย่างละเอียด คือ **เกราะป้องกันบั๊กใน Production** ไม่ใช่แค่พิธีการ ต้องปฏิบัติตามอย่างเคร่งครัด

### 2. Precise BEFORE Context in Integration Guides
- **Practice**: ในการส่งมอบ `server-changes.md` ให้ระบุบรรทัดจริงก่อนแทรก (BEFORE APPLY Context) พร้อมเลขบรรทัดจากไฟล์ live เสมอ
- **Impact**: ทำให้ pa สามารถตรวจและ apply โค้ดลง Production ได้อย่างรวดเร็ว ปราศจากความผิดพลาด และสร้างความไว้วางใจในการทำงานร่วมกัน

---

*Recorded by Nasri Oracle — Right Hand of Ma'at 𓂀*
