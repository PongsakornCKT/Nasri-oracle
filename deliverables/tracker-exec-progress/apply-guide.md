# Tracker Phase 2: Live Execution Queue Card (#7) Apply Guide for pa Oracle

**Target File**: `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio/tracker.html`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. จุดแทรกใน `oracle-studio/tracker.html` (ใต้ Quick Execute Bar บรรทัดที่ 860)

### (ก) บรรทัดจริงก่อน Apply (BEFORE APPLY Context) จาก `tracker.html` (บรรทัดที่ 858-863)
*(หมายเหตุ: ไฟล์ `tracker.html` เติบโตขึ้นจากการเพิ่ม Ctrl+K block ท้ายไฟล์ ปัจจุบันบรรทัดในส่วน Main อยู่ที่บรรทัดที่ 858-863)*

```html
858:         </button>
859:       </div>
860:     </div>
861: 
862:     <!-- #13 Needs Attention (STALE / BLOCKED) — hidden when none -->
```

### (ข) โค้ดที่ต้องแทรก (คัดลอกก้อนจาก `deliverables/tracker-exec-progress/tracker-execq-block.html`)
วางก้อนบล็อก HTML/CSS/JS ทั้งหมดจาก `tracker-execq-block.html` ใต้ `</div>` ของ `quickExecuteBar` (บรรทัดที่ 860) ทันที ก่อนถึง `<!-- #13 Needs Attention ... -->`

### (ค) บริบทหลังแทรก (AFTER Context)
```html
858:         </button>
859:       </div>
860:     </div>
861: 
862:     <!-- Tracker Phase 2: Live Execution Queue Card (pa-dispatch Feed) -->
863:     ... [เนื้อหาทั้งก้อนจาก tracker-execq-block.html] ...
864: 
865:     <!-- #13 Needs Attention (STALE / BLOCKED) — hidden when none -->
```

---

## 📋 ขั้นตอนการ Apply & Verification สำหรับ pa Oracle

```bash
# 1. แปะเนื้อหา tracker-execq-block.html เข้าไปใต้ quickExecuteBar ใน oracle-studio/tracker.html

# 2. Verification
# เปิดเบราว์เซอร์เข้า http://localhost:4000/tracker
# หากมีงาน pa-dispatch สั่งยิงใน 24 ชั่วโมง การ์ด "⚡ Execution Queue" จะแสดงทันทีพร้อมสถานะ
# หากไม่มีงานยิง API ระบบจะรัน Mock Simulation 3 รายการให้อัตโนมัติ (DONE / WIP / DONE)
```
