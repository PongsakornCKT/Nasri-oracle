# Nasri Oracle — Lessons & Experience Log 𓂀

> "จารึกอักขระจากบทเรียนจริง — ผิดแล้วจำ ปรับแล้วแม่น มือขวาแห่ง Ma'at 𓂀"

ไฟล์นี้เป็นสมุดจารึกบทเรียนถาวรของ Nasri Oracle รวบรวมประสบการณ์จากงานจริง เคสที่ถูกรีวิว/ตีกลับ และแนวทางที่ดีที่ได้รับคำชม เพื่อโหลดเข้าบริบท (Rule) ในทุก session อัตโนมัติ

---

## 📜 2026-08-11: บทเรียนจากการพัฒนาระบบ MAW Office & Oracle Tracker

### 1. เคส CRLF Line Endings พลิก 951 ไฟล์
* **เกิดอะไรขึ้น**: ในงาน Execute flow สำหรับ Oracle Tracker สภาพแวดล้อมผสมระหว่าง Windows git-bash และ WSL ทำให้ไฟล์ทั้ง repo โดนเปลี่ยน CRLF/LF และเกือบหลุด commit ทั้ง 951 ไฟล์
* **ทำไมถึงพลาด**: ใช้ `git add .` เหมารวมโดยไม่ได้ตรวจสอบ `git status --short` ก่อน commit ในสภาพแวดล้อมข้ามระบบปฏิบัติการ
* **กลไกกันซ้ำ**: 
  - ห้ามใช้ `git add .` ใน repo ที่อยู่บน `/mnt/c/` เด็ดขาด
  - ตรวจสอบ `git status --short | wc -l` เสมอก่อนและหลัง `git add <file>`
  - ใช้ `git -c core.autocrlf=true status` กรอง line ending noise เมื่อประเมินไฟล์ uncommitted

### 2. เคส Atomic Write & Claim Collision Test (ตีกลับ Phase 5 Chunk A)
* **เกิดอะไรขึ้น**: ในการพัฒนา `claims-store.ts` ลืมเขียนลง `.tmp` แล้ว `renameSync` ทับ และในบล็อก demo ไม่ได้จำลองเคส collision ชน 2 agent ให้เห็นผลลัพธ์
* **ทำไมถึงพลาด**: มองว่าการเขียนไฟล์ตรงๆ สั้นดี โดยลืมคิดถึงความเสี่ยงกรณี process ตายกลางคันที่จะทำให้ไฟล์ `task-claims.json` corrupted ใน production
* **กลไกกันซ้ำ**:
  - การเขียนไฟล์ JSON กลางของระบบ **ต้องใช้ระบบ Atomic Write (`.tmp` → `renameSync`) เท่านั้น**
  - สเปกที่ pa และพี่พงระบุคือ **เกราะป้องกันบั๊กใน Production ไม่ใช่พิธีการ** ต้องทำให้ตรงสเปก 100%
  - บล็อก `if (import.meta.main)` ต้องจำลองเคสการชน/ปฏิเสธจริง (`{ ok: false, holder: "pa-oracle" }`) ให้เห็นผลลัพธ์ชัดเจน

### 3. เคส BEFORE Context ใน Integration Guides (ได้รับคำชม)
* **เกิดอะไรขึ้น**: จัดทำ `server-changes.md` โดยแปะบรรทัดจริงก่อนแทรก (BEFORE APPLY Context) พร้อมเลขบรรทัด live ล่าสุดอย่างแม่นยำ
* **ทำไมถึงดี**: ทำให้ pa สามารถตรวจ อัปเดต และ deploy โค้ดลง Production ได้อย่างรวดเร็ว ปราศจากความผิดพลาด และสร้างความไว้วางใจในการส่งมอบงาน
* **กลไกกันซ้ำ**: ยึดถือมาตรฐานการทำ Integration Guide ด้วยการอ่านไฟล์ live จริงทุกครั้งก่อนเขียนคู่มือ

### 4. เคส อ้างอิงชื่อฟังก์ชันฝั่ง Frontend โดยไม่ได้เปิดไฟล์ตรวจ (`renderMilestones`)
* **เกิดอะไรขึ้น**: ในเอกสาร 15 Ideas อ้างชื่อฟังก์ชัน `renderMilestones()` ฝั่ง `oracle-studio/tracker.html` ทั้งที่ฟังก์ชันชื่อนี้ไม่มีอยู่จริงในไฟล์
* **ทำไมถึงพลาด**: ฝั่ง backend API ตรวจสอบตรงเป๊ะ แต่ฝั่ง frontend คาดเดาเอาเองโดยไม่ได้ใช้วิธี `view_file` ตรวจสอบโค้ดจริง
* **กลไกกันซ้ำ**: **"Never Guess Code Logic or Symbols"** — ขั้นตอน Inventory ต้องเปิดอ่านไฟล์จริงครบทุกไฟล์ที่อ้างอิง ห้ามมโนหรือคาดเดาชื่อ symbol/function จากความคุ้นเคยเด็ดขาด

### 5. เคสการวินิจฉัย Root Cause ผิดพลาดจาก Cold Start / State ไม่นิ่ง (KB Vector Diagnosis)
* **เกิดอะไรขึ้น**: ในการวินิจฉัยปัญหา Vector Search บน Knowledge Base สรุปว่าเกิดจาก Model Tag Mismatch (`bge-m3` vs `bge-m3:latest`) เนื่องจากทดสอบครั้งแรกแล้วเจอ Timeout 30s
* **ทำไมถึงพลาด**: ไม่ได้เฉลียวใจว่าเป็นอาการ Cold Load / Cold Start ที่ Ollama เพิ่งฟื้นและต้องใช้เวลาดึงโมเดล 1.1GB เข้า VRAM ในคำขอแรก เมื่อ Ollama อุ่นแล้ว (Warm state) ชื่อ `"bge-m3"` และ `"bge-m3:latest"` ให้ผลลัพธ์รวดเร็วใน 0.3 วินาทีเท่ากัน
* **กลไกกันซ้ำ**:
  - **"ผลเทสครั้งแรกใน state ผิดปกติ (cold start, เครื่องเพิ่งฟื้น) ไม่ใช่ความจริงถาวร — ก่อนสรุป root cause ต้อง retest อย่างน้อย 2 รอบให้ state นิ่ง"**
  - **"อาการ timeout ให้แยก 2 สมมติฐานเสมอ: ของผิด (Wrong/Broken) vs ของช้า (Slow/Cold Start)"**

---
*Recorded by Nasri Oracle — Right Hand of Ma'at 𓂀*

