# W1 — Electrical Cable & Protection Device Sizing Guide (#16)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/cable-protection-sizer.js` (ใหม่)  
**Standards Referenced**: EIT Standard 022013-22 (วสท. 2565), MEA/PEA Code, IEC 60364-7-712  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **พัฒนาโมดูลคำนวณสายไฟและอุปกรณ์ป้องกันทางไฟฟ้า (`cable-protection-sizer.js`)**:
   - พัฒนา Pure Function คำนวณขนาด AC Breaker (ปัจจัยภาระต่อเนื่อง 1.25 เท่า ตาม วสท. ข้อ 12.3.4)
   - คำนวณขนาดสาย AC Cable, สาย DC H1Z2Z2-K, DC Surge Protection Device (SPD), สายดินระบบ (Grounding Wire)
   - คำนวณเปอร์เซ็นต์แรงดันตก ($\Delta V \le 2.0\%$) ตามมาตรฐาน IEC 60228
   - กำหนดให้ทุกฟิลด์ในรายการ `items[]` แนบอ้างอิงมาตรฐาน วสท./IEC ในคอลัมน์ `spec` ชัดเจน
2. **ขอบเขตการใช้งาน**:
   - รองรับระบบโซลาร์เซลล์ 1-Phase (220V) และ 3-Phase (400V) ตั้งแต่ 3kW ถึง 100kW

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/cable-protection-sizer.js`

```bash
cp deliverables/linebot-w1-cable-protection-sizing/lib/cable-protection-sizer.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/cable-protection-sizer.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// W1 (#16): Electrical Cable & Protection Sizing Module (EIT 022013-22 / IEC 60364-7-712)
var _cableSizer = require('./lib/cable-protection-sizer');
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-w1-cable-protection-sizing
node test-w1.js
```
