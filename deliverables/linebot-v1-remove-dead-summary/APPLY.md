# V1 — Remove Dead Code summary() Guide (#15)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `app.js`  
**Grep Verified Line Numbers**: `app.js:2125-2177` (`function summary(d)`)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **สแกนและยืนยัน Dead Code (`summary(d)`)**:
   - ผลการสแกน `grep_search` ทั่วทั้ง Repository พบ `summary(` เพียงบรรทัดเดียวที่ `app.js:2125` (การประกาศฟังก์ชัน) โดย **ไม่มี Caller เรียกใช้งานเลยแม้แต่จุดเดียว**
   - สูตรคำนวณค่าน้ำหนักและตัวเลขในฟังก์ชันนี้มีความล้าสมัยและขัดแย้งกับตัวเลขจริงใน Python Bridge
2. **การลบเพื่อความปลอดภัย**:
   - ดำเนินการลบฟังก์ชัน `summary(d)` (บรรทัด 2125 ถึง 2177) ออกจาก `app.js` โดย **ไม่แตะต้อง Refactor Unified Schema** (ซึ่งเป็นความเสี่ยงสูง) ตามสั่ง

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: ลบฟังก์ชัน dead code `summary(d)` ใน `app.js` (`app.js:2125-2177` Verified by Grep)

#### BEFORE Context (`app.js:2122-2180` Verified by Grep):
```javascript
// Build BOM result flex card — extracted to lib/flex-builders.js
var buildBomResultFlex = _flex.buildBomResultFlex;

function summary(d) {
  var tc = 0, tq = 0;
  d.items.forEach(function(i) { tc += i.total_cost; tq += i.quantity; });

  // Calculate actual system Wp from panel items first, fallback to project name
  var systemKw = 0;
  d.items.forEach(function(i) {
    if (i.category === 'โมดูล') {
      var wMatch = i.part_name.match(/(\d{3,4})\s*W/i);
      if (wMatch) systemKw = Math.round(i.quantity * parseInt(wMatch[1]) / 1000);
    }
  });
  if (!systemKw) {
    var kwMatch = (d.project_name || '').match(/(\d+)\s*kw/i);
    systemKw = kwMatch ? parseInt(kwMatch[1]) : 5;
  }

  var systemWp = systemKw * 1000;
  var labor = systemWp * 4.5;
  var bos = systemWp * 0.7;
  var errorCost = systemWp * 1.0;
  var crane = systemKw >= 30 ? 15000 : 0;
  var vat = tc * 0.07;

  // PEA/MEA fee lookup table
  var peaTable = [[10,6000],[20,8500],[30,12500],[40,15500],[100,21500],[200,24000],[500,36000],[1000,46000]];
  var peaFee = 0;
  for (var pi = 0; pi < peaTable.length; pi++) {
    if (systemKw <= peaTable[pi][0]) { peaFee = peaTable[pi][1]; break; }
  }

  var grandTotal = tc + vat + labor + bos + errorCost + crane + peaFee;

  var t = '📋 สรุป BOM\n━━━━━━━━━━━━━━━\n';
  if (d.project_name) t += 'โปรเจกต์: ' + d.project_name + '\n';
  if (d.project_address) t += 'ที่อยู่: ' + d.project_address + '\n';
  t += 'วันที่: ' + d.order_date + '\n';
  t += 'ขนาดระบบ: ' + systemKw + ' kWp\n';
  t += '━━━━━━━━━━━━━━━\n';
  d.items.forEach(function(it, i) { t += (i+1) + '. ' + it.part_name + (it.manufacturer ? ' (' + it.manufacturer + ')' : '') + '\n   ' + it.quantity + ' x ฿' + it.unit_cost.toLocaleString() + ' = ฿' + it.total_cost.toLocaleString() + '\n'; });
  t += '━━━━━━━━━━━━━━━\n';
  t += '💰 สรุปค่าใช้จ่าย\n';
  t += '  ค่าอุปกรณ์: ฿' + tc.toLocaleString() + '\n';
  t += '  VAT 7%: ฿' + Math.round(vat).toLocaleString() + '\n';
  t += '  ค่าแรง: ฿' + labor.toLocaleString() + '\n';
  t += '  BOS: ฿' + bos.toLocaleString() + '\n';
  t += '  Error Cost: ฿' + errorCost.toLocaleString() + '\n';
  if (crane > 0) t += '  Crane: ฿' + crane.toLocaleString() + '\n';
  t += '  PEA/MEA: ฿' + peaFee.toLocaleString() + '\n';
  t += '━━━━━━━━━━━━━━━\n';
  t += '✅ Grand Total: ฿' + Math.round(grandTotal).toLocaleString() + '\n';
  return t;
}

// ─── BOM / Quotation PDF generators ──────────────────────────
```

#### AFTER Replacement:
```javascript
// Build BOM result flex card — extracted to lib/flex-builders.js
var buildBomResultFlex = _flex.buildBomResultFlex;

// ─── BOM / Quotation PDF generators ──────────────────────────
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-v1-remove-dead-summary
node test-v1.js
```
