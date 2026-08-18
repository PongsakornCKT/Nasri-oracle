# S5 — Quotation Price Pinning Engine Guide (#S5)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/price-pinning.js` (ใหม่), `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ระบบ Freeze ราคาประจำใบเสนอราคา (`qt_price_snapshots`)**:
   - เมื่อสร้างใบเสนอราคา (QT) ระบบจะ snapshot บันทึกราคาและรายการสินค้าทั้งหมดลงตาราง SQLite `qt_price_snapshots` (คีย์ด้วย `qt_no`)
2. **การคงตัวเลขเดิมเมื่อออกซ้ำ หรือส่ง PDF ซ้ำ**:
   - เมื่อมีการออกใบเสนอราคาซ้ำ หรือสั่งพิมพ์ PDF ซ้ำ ระบบจะดึงตัวเลขราคาจาก snapshot มาใช้งานเสมอ ทำให้ตัวเลขไม่เปลี่ยนแปลง แม้ราคาใน Google Sheets จะถูกปรับเปลี่ยนในอนาคต

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/price-pinning.js`

```bash
cp deliverables/linebot-s5-price-pinning/lib/price-pinning.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/price-pinning.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// S5 (#S5): Quotation price pinning engine
var _pricePinning = require('./lib/price-pinning')({
  sqlitePath: SQLITE_PATH
});
```

---

### Step 3: บันทึก Snapshot เมื่อสร้าง QT ใน `app.js` (ประมาณบรรทัด 2100)

```javascript
  // Snapshot quotation price items
  _pricePinning.snapshotPrice(qtNo, userId, items);
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-s5-price-pinning
node test-s5.js
```
