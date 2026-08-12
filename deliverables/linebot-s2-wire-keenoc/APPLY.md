# S2v2 — Wire Keenoc Calculator to BOM Call-site Guide (#19 - REVISION 2)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/keenoc-mounting-wire.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:1748-1837` (ในฟังก์ชันสร้างรายการสินค้า BOM)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ (แก้ไขตาม Feedback pa Oracle)

1. **เชื่อมต่อ `calculateKeenocMounting` เข้ากับ BOM Call-site ใน `app.js`**:
   - นำโมดูลถอดแบบชุดยึด Keenoc อัตโนมัติ (จาก R5) มายิงเชื่อมต่อในจุดสร้าง BOM ใน `app.js`
2. **VERBATIM Fallback Block (100% Complete Safety Guarantee)**:
   - บล็อก Fallback Closure ใน `APPLY.md` ถูกนำโค้ดเดิมจาก `app.js:1748-1837` มาใส่แบบ **VERBATIM ครบถ้วนทุกบรรทัดทุกรายการ** (Rail, End Clamp, Mid Clamp, Roof Anchor, Grounding Lug, Earthing Clip, Cable Clip รวม 7 รายการเต็มชุด)
   - ป้องกันความเสี่ยงจากการถอดแบบขาดรายการอุปกรณ์ในกรณีที่ Calculator ขัดข้อง

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

### Step 3: ปรับจุดคำนวณ Keenoc Mounting ใน `app.js` (บรรทัด 1748–1837 Verbatim)

#### BEFORE Context (`app.js:1748-1837` Verified by Grep):
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

  // Rail 4200mm — 1 per panel
  var rail = keenocSearch('4200') || keenocSearch('Rail');
  if (rail) {
    var railName = extractField(rail.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Rail 4200mm';
    items.push({ part_number: 'RAIL-4200', part_name: railName, manufacturer: 'Keenoc', category: 'mounting_rail', quantity: panelQty, unit_cost: rail.price, total_cost: panelQty * rail.price, notes: '1 rail per panel' });
  }

  // End Clamp — panel_qty * 2
  var ec = keenocSearch('End Clamp') || keenocSearch('End');
  if (ec) {
    var ecQty = panelQty * 2;
    var ecName = extractField(ec.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'End Clamp';
    items.push({ part_number: 'END-CLAMP', part_name: ecName, manufacturer: 'Keenoc', category: 'mounting_clamp', quantity: ecQty, unit_cost: ec.price, total_cost: ecQty * ec.price, notes: '' });
  }

  // Mid Clamp — (panel_qty - 1) * 2
  var mc = keenocSearch('Mid Clamp') || keenocSearch('Mid');
  if (mc) {
    var mcQty = Math.max(0, (panelQty - 1) * 2);
    var mcName = extractField(mc.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Mid Clamp';
    items.push({ part_number: 'MID-CLAMP', part_name: mcName, manufacturer: 'Keenoc', category: 'mounting_clamp', quantity: mcQty, unit_cost: mc.price, total_cost: mcQty * mc.price, notes: '' });
  }

  // ── Roof Anchor (by roof type) — 2 per panel ──
  var raQty = panelQty * 2;
  var raPn, raFallback, raItem;
  if (roofType === 'tile') {
    raPn = 'TILE-HOOK'; raFallback = 'Tile Roof Hook';
    raItem = keenocSearch('Tile Roof Hook') || keenocSearch('Tile');
  } else if (roofType === 'hangerbolt') {
    raPn = 'HANGERBOLT'; raFallback = 'Hangerbolt';
    raItem = keenocSearch('Hangerbolt') || keenocSearch('Hanger');
  } else if (roofType === 'kliplock') {
    raPn = 'KLIPLOCK-717'; raFallback = 'Kliplock 717';
    raItem = keenocSearch('Kliplock 717') || keenocSearch('Kliplock');
  } else {
    // default: เมทัลชีท → L-Feet 8cm
    raPn = 'L-FEET-8CM'; raFallback = 'L-Feet 8cm';
    raItem = keenocSearch('L-Feet 8cm') || keenocSearch('L-Feet');
  }
  if (raItem) {
    var raName = extractField(raItem.row, ['รุ่น', 'model', 'รายการ', 'description']) || raFallback;
    items.push({ part_number: raPn, part_name: raName, manufacturer: 'Keenoc', category: 'mounting_roof_anchor', quantity: raQty, unit_cost: raItem.price, total_cost: raQty * raItem.price, notes: '2 per panel (' + roofType + ')' });
  } else {
    items.push({ part_number: raPn, part_name: raFallback, manufacturer: 'Keenoc', category: 'mounting_roof_anchor', quantity: raQty, unit_cost: 0, total_cost: 0, notes: '2 per panel (' + roofType + ') — price TBC' });
  }

  // ── Grounding Accessories ──
  // Grounding Lug — 1 per panel
  var glu = keenocSearch('Grounding Lug') || keenocSearch('Lug');
  if (glu) {
    var gluName = extractField(glu.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Grounding Lug';
    items.push({ part_number: 'GND-LUG', part_name: gluName, manufacturer: 'Keenoc', category: 'mounting_other', quantity: panelQty, unit_cost: glu.price, total_cost: panelQty * glu.price, notes: '1 per panel' });
  } else {
    items.push({ part_number: 'GND-LUG', part_name: 'Grounding Lug', manufacturer: 'Keenoc', category: 'mounting_other', quantity: panelQty, unit_cost: 0, total_cost: 0, notes: '1 per panel — price TBC' });
  }

  // Earthing Clip — 2 per panel
  var ecl = keenocSearch('Earthing Clip') || keenocSearch('Earth');
  var eclQty = panelQty * 2;
  if (ecl) {
    var eclName = extractField(ecl.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Earthing Clip';
    items.push({ part_number: 'EARTH-CLIP', part_name: eclName, manufacturer: 'Keenoc', category: 'mounting_other', quantity: eclQty, unit_cost: ecl.price, total_cost: eclQty * ecl.price, notes: '2 per panel' });
  } else {
    items.push({ part_number: 'EARTH-CLIP', part_name: 'Earthing Clip', manufacturer: 'Keenoc', category: 'mounting_other', quantity: eclQty, unit_cost: 0, total_cost: 0, notes: '2 per panel — price TBC' });
  }

  // Cable Clip — 5 per panel
  var ccl = keenocSearch('Cable Clip') || keenocSearch('Clip');
  var cclQty = panelQty * 5;
  if (ccl) {
    var cclName = extractField(ccl.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Cable Clip';
    items.push({ part_number: 'CABLE-CLIP', part_name: cclName, manufacturer: 'Keenoc', category: 'mounting_other', quantity: cclQty, unit_cost: ccl.price, total_cost: cclQty * ccl.price, notes: '5 per panel' });
  } else {
    items.push({ part_number: 'CABLE-CLIP', part_name: 'Cable Clip', manufacturer: 'Keenoc', category: 'mounting_other', quantity: cclQty, unit_cost: 0, total_cost: 0, notes: '5 per panel — price TBC' });
  }
```

#### AFTER Replacement:
```javascript
  // ── Keenoc mounting — skipped for ATMOCE SRP mode (MOUNTING lump-sum covers it) ──
  if (srpModeItems) { return items; } // SRP BOM complete — panels/mounting/cables already included

  var keenocCalcResult = _keenocWire.wireKeenocMounting(catalog, panelQty, roofType, function() {
    // Legacy fallback — VERBATIM full 7-item set
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
    if (rail) {
      var railName = extractField(rail.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Rail 4200mm';
      legacyItems.push({ part_number: 'RAIL-4200', part_name: railName, manufacturer: 'Keenoc', category: 'mounting_rail', quantity: panelQty, unit_cost: rail.price, total_cost: panelQty * rail.price, notes: '1 rail per panel' });
    }
    var ec = keenocSearch('End Clamp') || keenocSearch('End');
    if (ec) {
      var ecQty = panelQty * 2;
      var ecName = extractField(ec.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'End Clamp';
      legacyItems.push({ part_number: 'END-CLAMP', part_name: ecName, manufacturer: 'Keenoc', category: 'mounting_clamp', quantity: ecQty, unit_cost: ec.price, total_cost: ecQty * ec.price, notes: '' });
    }
    var mc = keenocSearch('Mid Clamp') || keenocSearch('Mid');
    if (mc) {
      var mcQty = Math.max(0, (panelQty - 1) * 2);
      var mcName = extractField(mc.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Mid Clamp';
      legacyItems.push({ part_number: 'MID-CLAMP', part_name: mcName, manufacturer: 'Keenoc', category: 'mounting_clamp', quantity: mcQty, unit_cost: mc.price, total_cost: mcQty * mc.price, notes: '' });
    }
    var raQty = panelQty * 2;
    var raPn, raFallback, raItem;
    if (roofType === 'tile') {
      raPn = 'TILE-HOOK'; raFallback = 'Tile Roof Hook';
      raItem = keenocSearch('Tile Roof Hook') || keenocSearch('Tile');
    } else if (roofType === 'hangerbolt') {
      raPn = 'HANGERBOLT'; raFallback = 'Hangerbolt';
      raItem = keenocSearch('Hangerbolt') || keenocSearch('Hanger');
    } else if (roofType === 'kliplock') {
      raPn = 'KLIPLOCK-717'; raFallback = 'Kliplock 717';
      raItem = keenocSearch('Kliplock 717') || keenocSearch('Kliplock');
    } else {
      raPn = 'L-FEET-8CM'; raFallback = 'L-Feet 8cm';
      raItem = keenocSearch('L-Feet 8cm') || keenocSearch('L-Feet');
    }
    if (raItem) {
      var raName = extractField(raItem.row, ['รุ่น', 'model', 'รายการ', 'description']) || raFallback;
      legacyItems.push({ part_number: raPn, part_name: raName, manufacturer: 'Keenoc', category: 'mounting_roof_anchor', quantity: raQty, unit_cost: raItem.price, total_cost: raQty * raItem.price, notes: '2 per panel (' + roofType + ')' });
    } else {
      legacyItems.push({ part_number: raPn, part_name: raFallback, manufacturer: 'Keenoc', category: 'mounting_roof_anchor', quantity: raQty, unit_cost: 0, total_cost: 0, notes: '2 per panel (' + roofType + ') — price TBC' });
    }
    var glu = keenocSearch('Grounding Lug') || keenocSearch('Lug');
    if (glu) {
      var gluName = extractField(glu.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Grounding Lug';
      legacyItems.push({ part_number: 'GND-LUG', part_name: gluName, manufacturer: 'Keenoc', category: 'mounting_other', quantity: panelQty, unit_cost: glu.price, total_cost: panelQty * glu.price, notes: '1 per panel' });
    } else {
      legacyItems.push({ part_number: 'GND-LUG', part_name: 'Grounding Lug', manufacturer: 'Keenoc', category: 'mounting_other', quantity: panelQty, unit_cost: 0, total_cost: 0, notes: '1 per panel — price TBC' });
    }
    var ecl = keenocSearch('Earthing Clip') || keenocSearch('Earth');
    var eclQty = panelQty * 2;
    if (ecl) {
      var eclName = extractField(ecl.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Earthing Clip';
      legacyItems.push({ part_number: 'EARTH-CLIP', part_name: eclName, manufacturer: 'Keenoc', category: 'mounting_other', quantity: eclQty, unit_cost: ecl.price, total_cost: eclQty * ecl.price, notes: '2 per panel' });
    } else {
      legacyItems.push({ part_number: 'EARTH-CLIP', part_name: 'Earthing Clip', manufacturer: 'Keenoc', category: 'mounting_other', quantity: eclQty, unit_cost: 0, total_cost: 0, notes: '2 per panel — price TBC' });
    }
    var ccl = keenocSearch('Cable Clip') || keenocSearch('Clip');
    var cclQty = panelQty * 5;
    if (ccl) {
      var cclName = extractField(ccl.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Cable Clip';
      legacyItems.push({ part_number: 'CABLE-CLIP', part_name: cclName, manufacturer: 'Keenoc', category: 'mounting_other', quantity: cclQty, unit_cost: ccl.price, total_cost: cclQty * ccl.price, notes: '5 per panel' });
    } else {
      legacyItems.push({ part_number: 'CABLE-CLIP', part_name: 'Cable Clip', manufacturer: 'Keenoc', category: 'mounting_other', quantity: cclQty, unit_cost: 0, total_cost: 0, notes: '5 per panel — price TBC' });
    }
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
