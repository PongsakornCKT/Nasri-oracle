# T4 — Per-Document Price Override Guide (#14)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/doc-price-override.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:3305` (คำสั่ง Admin LINE)  
**Business Decision (พี่พงเคาะ A3)**: **ห้ามแก้ราคากลาง/ชีตผ่าน bot เด็ดขาด!** ให้อัปเดตราคา item ในเอกสารใบนั้นๆ เท่านั้น (per-document override ใน SQLite)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ระบบแก้ไขราคาเฉพาะเอกสาร (`doc-price-override.js`)**:
   - รองรับคำสั่ง LINE Admin `"แก้ราคา <item> <ราคาใหม่> ใน <QT/BOM id>"`
   - ปรับปรุงเฉพาะฟิลด์ `unit_cost` และ `total_cost` ในเอกสารฉบับนั้นใน `nasri.sqlite`
2. **บันทึก Audit Log โปร่งใส (`doc_price_audit`)**:
   - บันทึกประวัติการแก้ไขราคาทุกครั้งลงตาราง `doc_price_audit` (ใคร / ใบไหน / อุปกรณ์ใด / ราคาเดิม -> ราคาใหม่)
3. **กติกาเหล็กตามสั่งพี่พง**:
   - **ห้ามมี Code path ใดเขียนกลับไปยัง Google Sheets ราคากลางเด็ดขาด!**

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/doc-price-override.js`

```bash
cp deliverables/linebot-t4-per-doc-price-update/lib/doc-price-override.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/doc-price-override.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// T4 (#14): Per-document price override engine (P'Phong decision A3: NEVER write back to Google Sheets)
var _docPriceOverride = require('./lib/doc-price-override')({
  sqlitePath: SQLITE_PATH
});
```

---

### Step 3: แทรกคำสั่ง LINE `"แก้ราคา <item> <ราคา> ใน <id>"` ใน `app.js` (บรรทัด 3305 Verified by Grep)

#### BEFORE Context (`app.js:3306-3309` Verified by Grep):
```javascript
  // View old BOM PDF by name
  if ((lo.indexOf('ดู') >= 0) && (lo.indexOf('bom') >= 0 || lo.indexOf('pdf') >= 0)) {
    var viewQuery = text.replace(/นัด|nasri|ไอ่นัด|ดู|view|bom|pdf/gi, '').trim();
```

#### AFTER Replacement:
```javascript
  // T4 (#14): Per-document price override command
  var _docPriceM = lo.match(/^แก้ราคา\s+(.+)\s+(\d+(?:\.\d+)?)\s+ใน\s+(.+)$/i);
  if (_docPriceM) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    var _itemName = _docPriceM[1].trim();
    var _newPrice = parseFloat(_docPriceM[2]);
    var _targetDocId = _docPriceM[3].trim();

    _installerPdfBridge.resolveInstallerData(_targetDocId, SQLITE_PATH, _qtCrud, _persistence).then(function(realData) {
      if (!realData || !realData.items || realData.items.length === 0) {
        rText(rt, '❌ ไม่พบเอกสาร ' + _targetDocId + ' ครับ');
        return;
      }
      var _overrideRes = _docPriceOverride.updateDocumentItemPrice(_targetDocId, _itemName, _newPrice, _userId, realData.items);
      if (_overrideRes.ok) {
        _pricePinning.snapshotPrice(_targetDocId, _userId, _overrideRes.items);
        rText(rt, '✅ แก้ไขราคาสำเร็จ (' + _targetDocId + '):\n• ' + _itemName + ': ฿' + _overrideRes.old_price.toLocaleString() + ' ➔ ฿' + _newPrice.toLocaleString() + '\n• ยอดรวมใหม่: ฿' + _overrideRes.new_total.toLocaleString() + '\n\n*(บันทึกเฉพาะเอกสารนี้เรียบร้อย ไม่กระทบตารางราคากลาง)*');
      } else {
        rText(rt, '❌ ' + _overrideRes.error);
      }
    });
    return;
  }

  // View old BOM PDF by name
  if ((lo.indexOf('ดู') >= 0) && (lo.indexOf('bom') >= 0 || lo.indexOf('pdf') >= 0)) {
    var viewQuery = text.replace(/นัด|nasri|ไอ่นัด|ดู|view|bom|pdf/gi, '').trim();
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-t4-per-doc-price-update
node test-t4.js
```
