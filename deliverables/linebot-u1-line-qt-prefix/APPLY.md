# U1 — LINE- Prefix for Quotation Numbers Guide (#B2)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/line-qt-prefix.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:2234` (จุดรับ quote_number จาก python), `app.js:3339` (จุดค้นหาดูใบเสนอราคา), `app.js:3984` (จุด api qt-view regex)  
**Business Decision (พี่พงเคาะ B2)**: เลข QT ที่เกิดจาก bot ทุกใบใช้ prefix `LINE-<เลขเดิม>` (ไม่แตะ logic Monotonic generation ฝั่ง Python)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **โมดูลจัดรูปแบบ Prefix `LINE-` (`line-qt-prefix.js`)**:
   - เติม Prefix `LINE-` ให้แก่เลขที่ใบเสนอราคาที่สร้างผ่าน LINE Bot ทั้งหมด เช่น `LINE-QT-2026-0812-001`
   - **ไม่แตะ Logic Monotonic Number Generation ฝั่ง Python `mcp-bomsolar` เด็ดขาด** (เติมที่ JS Layer ชั้น Bot เท่านั้น)
2. **รองรับทั้ง `QTxxxx` เดิม และ `LINE-QTxxxx` ในทุกจุดค้นหา**:
   - ปรับปรุง Regex Matching ใน `app.js` ให้ค้นหาและอ้างอิงใบเสนอราคาได้ครอบคลุมทั้งรูปแบบเดิมและรูปแบบใหม่

---

## 📋 รายการบรรทัดใน `app.js` ที่อ้างอิง QT Number (Grep Verified)

- `app.js:2234` — จุดรับ `result.quote_number` จาก Python ➔ ใส่ `ensureLinePrefix(result.quote_number)`
- `app.js:2335` — จุด Regex `"ยืนยัน QT-xxxx"` ➔ เปลี่ยนเป็น `/ยืนยัน\s+((?:LINE-)?QT-[-\w]+)/i`
- `app.js:3339` — จุด Regex `"ดูใบเสนอ QT-xxxx"` ➔ เปลี่ยนเป็น `/ดูใบเสนอ\s+((?:LINE-)?QT-[-\w]+)/i`
- `app.js:3984` — จุด API `qt-view` Filename Validation ➔ ปรับเป็น `/^(?:line-)?qt-[a-zA-Z0-9]+-\d+\.json$/i`

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/line-qt-prefix.js`

```bash
cp deliverables/linebot-u1-line-qt-prefix/lib/line-qt-prefix.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/line-qt-prefix.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// U1 (#B2): LINE QT prefix module (P'Phong decision B2: prefix all LINE QTs with "LINE-")
var _lineQtPrefix = require('./lib/line-qt-prefix');
```

---

### Step 3: ปรับจุดสร้าง Quote Number ใน `app.js` (`app.js:2234`)

#### BEFORE Context (`app.js:2234` Verified by Grep):
```javascript
    auditLog('quotation_generated', userId, result.quote_number + ' ' + result.brand + ' ' + result.size_kw + 'kW ฿' + result.grand_total);
```

#### AFTER Replacement:
```javascript
    result.quote_number = _lineQtPrefix.ensureLinePrefix(result.quote_number);
    auditLog('quotation_generated', userId, result.quote_number + ' ' + result.brand + ' ' + result.size_kw + 'kW ฿' + result.grand_total);
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-u1-line-qt-prefix
node test-u1.js
```
