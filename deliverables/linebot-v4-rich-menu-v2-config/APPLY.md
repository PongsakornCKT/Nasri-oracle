# V4 — Rich Menu v2 Config Guide (#Phase04)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/rich-menu-v2.js` (ใหม่)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **จัดทำ Config Rich Menu v2 สำหรับ LINE Bot (`rich-menu-v2.js`)**:
   - เพิ่มปุ่มคำสั่งใหม่ที่พัฒนาสำเร็จวันนี้:
     - `"ขอราคา"` ➔ ค้นหาราคาอุปกรณ์ตามแคตตาล็อก
     - `"เทียบราคา"` ➔ เปรียบเทียบราคาหลายแบรนด์ (Q6 Multi-brand Flex)
     - `"ขอใบเสนอราคา"` ➔ สร้างใบเสนอราคา PDF
     - `"สรุป demand"` ➔ สรุป Analytics ความต้องการอุปกรณ์ (Q4 Admin)
     - `"close rate"` ➔ รายงานสถิติการปิดการขายจาก SQLite (T6 Admin)
     - `"ช่วยเหลือ"` ➔ คำแนะนำการใช้งานระบบ
2. **ยืนยัน Handler 100% (บทเรียนป้องกันปุ่มค้าง)**:
   - ตรวจสอบผ่าน `grep_search` ยืนยันว่าทุกข้อความของปุ่มบน Rich Menu มี Active Text Handler รองรับใน `app.js` 100% ไร้ปุ่มตกค้าง

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/rich-menu-v2.js`

```bash
cp deliverables/linebot-v4-rich-menu-v2-config/lib/rich-menu-v2.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/rich-menu-v2.js"
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-v4-rich-menu-v2-config
node test-v4.js
```
