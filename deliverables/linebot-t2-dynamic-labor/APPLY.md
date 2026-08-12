# T2 — Dynamic Labor & Default Roof Guide (#7)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/roof-labor-parser.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:1232-1235` (ในฟังก์ชันสร้าง BOM)  
**Business Decision (พี่พงเคาะ)**: ไม่ระบุประเภทหลังคา = **default เมทัลชีท (metal)**  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ระบบวิเคราะห์หลังคา & กำหนด Default เมทัลชีท (`roof-labor-parser.js`)**:
   - อ่านประเภทหลังคาจากข้อความที่ผู้ใช้พิมพ์เข้ามา (`ซีแพค`, `กระเบื้อง`, `ลอนคู่`, `Kliplock`, `เมทัลชีท`)
   - หากผู้ใช้ **ไม่ระบุประเภทหลังคา** ระบบจะกำหนดค่าเริ่มต้นเป็น **เมทัลชีท (metal)** ตามข้อสั่งการธุรกิจของพี่พง
2. **แสดงผลประเภทหลังคาในคำตอบให้ Sales เห็นชัดเจน**:
   - แนบหมายเหตุประเภทหลังคาที่นำมาคำนวณในผลตอบกลับ (`🏠 หลังคา: เมทัลชีท (ค่าเริ่มต้น)`) เพื่อความโปร่งใสในทีมขาย

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/roof-labor-parser.js`

```bash
cp deliverables/linebot-t2-dynamic-labor/lib/roof-labor-parser.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/roof-labor-parser.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// T2 (#7): Dynamic labor & default roof type parser (P'Phong decision: default = metal)
var _roofLaborParser = require('./lib/roof-labor-parser');
```

---

### Step 3: ปรับจุดตรวจจับหลังคาใน `app.js` (บรรทัด 1232–1235)

#### BEFORE Context (`app.js:1232-1235` Verified by Grep):
```javascript
  // Detect roof type (default: เมทัลชีท → L-Feet 8cm)
  var roofType = 'metal';
  if (/tile|กระเบื้อง/i.test(lo)) roofType = 'tile';
  else if (/hangerbolt|ลอนคู่/i.test(lo)) roofType = 'hangerbolt';
  else if (/kliplock/i.test(lo)) roofType = 'kliplock';
```

#### AFTER Replacement:
```javascript
  // Detect roof type (default: เมทัลชีท → L-Feet 8cm — P'Phong decision)
  var _roofInfo = _roofLaborParser.parseRoofType(lo);
  var roofType = _roofInfo.roofType;
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-t2-dynamic-labor
node test-t2.js
```
