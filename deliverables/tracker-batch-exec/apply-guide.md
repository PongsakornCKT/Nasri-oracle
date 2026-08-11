# Tracker Phase 3: Batch Execute Multi-Select Toolbar (#4) Final Apply Guide for pa Oracle

**Target File**: `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio/tracker.html`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. จุดแทรกใน `oracle-studio/tracker.html` (ก่อน `</body>` บรรทัดที่ 3024)

### (ก) บรรทัดจริงก่อน Apply (BEFORE APPLY Context) จาก `tracker.html` (บรรทัดที่ 3022-3026)
```html
3022: </script>
3023: 
3024: </body>
3025: </html>
```

### (ข) โค้ดที่ต้องแทรก (คัดลอกก้อนจาก `deliverables/tracker-batch-exec/tracker-batch-block.html`)
วางก้อนบล็อก HTML/CSS/JS ทั้งหมดจาก `tracker-batch-block.html` ก่อนปิด `</body>` (บรรทัดที่ 3024)

### (ค) บริบทหลังแทรก (AFTER Context)
```html
3022: </script>
3023: 
3024: <!-- Tracker Phase 3: Batch Execute Multi-Select Toolbar (Final) -->
3025: ... [เนื้อหาทั้งก้อนจาก tracker-batch-block.html] ...
3026: 
3027: </body>
3028: </html>
```

---

## 📋 ขั้นตอนการ Apply & Verification สำหรับ pa Oracle

```bash
# 1. แปะเนื้อหา tracker-batch-block.html เข้าไปก่อน </body> ใน oracle-studio/tracker.html

# 2. Verification
# เปิดเบราว์เซอร์เข้า http://localhost:4000/tracker
# ตรวจสอบการ์ด Proposal แต่ละใบจะมี Checkbox ที่มุมขวาบน
# ติ๊กเลือก ≥ 1 ใบ แถบลอยล่างจอ "N รายการ · ⚡ Execute Selected · ยกเลิก" จะลอยขึ้นมา
# กด ⚡ Execute Selected ระบบจะ loop ยิง POST /api/tracker/execute เว้น 300ms ต่อคิว
# การ์ด Execution Queue (Phase 2) จะโชว์คิวงามๆ อัตโนมัติ!
```
