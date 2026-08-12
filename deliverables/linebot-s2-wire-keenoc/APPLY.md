# S2 — Wire Keenoc Calculator to BOM Call-site Guide (#19)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/keenoc-mounting-wire.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:1748-1806` (ในฟังก์ชันสร้างรายการสินค้า BOM)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **เชื่อมต่อ `calculateKeenocMounting` เข้ากับ BOM Call-site ใน `app.js`**:
   - นำโมดูลถอดแบบชุดยึด Keenoc อัตโนมัติ (จาก R5) มายิงเชื่อมต่อในจุดสร้าง BOM ใน `app.js`
   - รักษารูปแบบอาร์เรย์รายการสินค้าเดิม (`part_number`, `part_name`, `quantity`, `unit_cost`, `total_cost`)
2. **Horus Fail-Closed Guard**:
   - หาก `calculateKeenocMounting` คืนค่า null หรือโยน Error ระบบจะ Fallback กลับไปรันฟังก์ชัน `keenocSearch` เดิมทันที ไม่ทำให้ระบบล่มหรือหยุดทำงาน

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/keenoc-mounting-wire.js`

```bash
cp deliverables/linebot-s2-wire-keenoc/lib/keenoc-mounting-wire.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/keenoc-mounting-wire.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// S2 (#19): Wire Keenoc mounting calculator to BOM call-site
var _keenocWire = require('./lib/keenoc-mounting-wire');
```

---

### Step 3: ปรับจุดคำนวณ Keenoc Mounting ใน `app.js` (บรรทัด 1748–1806)

#### BEFORE Context (`app.js:1748-1806` Verified by Grep):
```javascript
  // ── Keenoc mounting — skipped for ATMOCE SRP mode (MOUNTING lump-sum covers it) ──
  if (srpModeItems) { return items; } // SRP BOM complete — panels/mounting/cables already included
  var keenocRows = catalog['Mounting - Keenoc'] || [];
  function keenocSearch(keyword) {
    for (var ki = 0; ki < keenocRows.length; ki++) {
      var vals = Object.values(keenocRows[ki]).join(' ').toLowerCase();
      if (vals.indexOf(keyword.toLowerCase()) >= 0) {
        var p = extractPrice(keenocRows[ki]);
        if (p > 0) return { row: keenocRows[ki], price: p };
      }
    }
    return null;
  }
```

#### AFTER Replacement:
```javascript
  // ── Keenoc mounting — skipped for ATMOCE SRP mode (MOUNTING lump-sum covers it) ──
  if (srpModeItems) { return items; } // SRP BOM complete — panels/mounting/cables already included

  var keenocCalcResult = _keenocWire.wireKeenocMounting(catalog, panelQty, roofType, function() {
    // Legacy fallback
    var keenocRows = catalog['Mounting - Keenoc'] || [];
    function keenocSearch(keyword) {
      for (var ki = 0; ki < keenocRows.length; ki++) {
        var vals = Object.values(keenocRows[ki]).join(' ').toLowerCase();
        if (vals.indexOf(keyword.toLowerCase()) >= 0) {
          var p = extractPrice(keenocRows[ki]);
          if (p > 0) return { row: keenocRows[ki], price: p };
        }
      }
      return null;
    }
    var legacyItems = [];
    var rail = keenocSearch('4200') || keenocSearch('Rail');
    if (rail) legacyItems.push({ part_number: 'RAIL-4200', part_name: extractField(rail.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Rail 4200mm', manufacturer: 'Keenoc', category: 'mounting_rail', quantity: panelQty, unit_cost: rail.price, total_cost: panelQty * rail.price, notes: '1 rail per panel' });
    return legacyItems;
  });

  keenocCalcResult.forEach(function(kmItem) { items.push(kmItem); });
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-s2-wire-keenoc
node test-s2.js
```
