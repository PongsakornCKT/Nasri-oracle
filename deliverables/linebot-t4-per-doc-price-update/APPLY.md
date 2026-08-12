# T4v3 — Per-Document Price Override Guide (#14 - REVISION 3)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/doc-price-override.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:3453-3457` (วางเป็น Top-level Command ก่อนบล็อก `// View old BOM PDF by name`)  
**Business Decision (พี่พงเคาะ A3)**: **ห้ามแก้ราคากลาง/ชีตผ่าน bot เด็ดขาด!** ให้อัปเดตราคา item ในเอกสารใบนั้นๆ เท่านั้น (per-document override ใน SQLite)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ (แก้ไขตาม Feedback pa Oracle REJECT T4v2)

1. **ย้ายเป็น Top-level Command บริเวณเดียวกับ "ปิดงาน" (ก่อน `// View old BOM PDF by name`)**:
   - แก้ไข Bug Placement เดิมที่วางหลัง `return;` ใน `case update_price` (ซึ่งเป็น Dead Code)
   - วางเป็นคำสั่งอิสระระดับบนสุดก่อนบล็อกค้นหา BOM
2. **โหลดข้อมูลและอัปเดตตรงผ่าน `_qtCrud` (`getQuotationDetail` / `editItem`)**:
   - ไม่ reuse `_installerPdfBridge.resolveInstallerData` และไม่ใช้อ้างอิง `_pricePinning`
   - โหลดรายละเอียดใบเสนอราคาและอัปเดต `unit_cost` / `total_cost` ของรายการใน `nasri.sqlite` โดยตรงผ่าน `_qtCrud.editItem`
3. **บันทึก Audit Log โปร่งใส (`doc_price_audit`)**:
   - บันทึกประวัติการแก้ไขราคาทุกครั้งลงตาราง `doc_price_audit` (ใคร / ใบไหน / อุปกรณ์ใด / ราคาเดิม -> ราคาใหม่)
4. **กติกาเหล็กตามสั่งพี่พง**:
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
// T4v3 (#14): Per-document price override engine (P'Phong decision A3: NEVER write back to Google Sheets)
var _docPriceOverride = require('./lib/doc-price-override')({
  sqlitePath: SQLITE_PATH
});
```

---

### Step 3: แทรกคำสั่ง LINE `"แก้ราคา <item> <ราคา> ใน <id>"` ใน `app.js` (ก่อน `// View old BOM PDF by name` Verified by Grep `app.js:3453-3457`)

#### BEFORE Context (`app.js:3453-3457` Verified by Grep):
```javascript
  // View old BOM PDF by name
  if ((lo.indexOf('ดู') >= 0) && (lo.indexOf('bom') >= 0 || lo.indexOf('pdf') >= 0)) {
    var viewQuery = text.replace(/นัด|nasri|ไอ่นัด|ดู|view|bom|pdf/gi, '').trim();
    if (viewQuery) {
      var vwResults = searchBoms(viewQuery);
```

#### AFTER Replacement:
```javascript
  // T4v3 (#14): Top-level Per-document price override command "แก้ราคา <item> <ราคาใหม่> ใน <QT id>"
  var _docPriceM = lo.match(/^แก้ราคา\s+(.+)\s+(\d+(?:\.\d+)?)\s+ใน\s+(.+)$/i);
  if (_docPriceM) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    var _itemName = _docPriceM[1].trim();
    var _newPrice = parseFloat(_docPriceM[2]);
    var _targetDocId = _docPriceM[3].trim();

    _docPriceOverride.updateDocumentItemPrice(_targetDocId, _itemName, _newPrice, _userId, _qtCrud, SQLITE_PATH).then(function(_overrideRes) {
      if (_overrideRes.ok) {
        rText(rt, '✅ แก้ไขราคาสำเร็จ (' + _targetDocId + '):\n• ' + _overrideRes.item_name + ': ฿' + _overrideRes.old_price.toLocaleString() + ' ➔ ฿' + _newPrice.toLocaleString() + '\n• ยอดรวมใหม่: ฿' + _overrideRes.new_total.toLocaleString() + '\n\n*(ปรับปรุงเฉพาะเอกสารนี้ใน nasri.sqlite เรียบร้อย ไม่กระทบตารางราคากลาง)*');
      } else {
        rText(rt, '❌ ' + _overrideRes.error);
      }
    }).catch(function(e) {
      rText(rt, '❌ เกิดข้อผิดพลาดในการอัปเดตราคา: ' + e.message);
    });
    return;
  }

  // View old BOM PDF by name
  if ((lo.indexOf('ดู') >= 0) && (lo.indexOf('bom') >= 0 || lo.indexOf('pdf') >= 0)) {
    var viewQuery = text.replace(/นัด|nasri|ไอ่นัด|ดู|view|bom|pdf/gi, '').trim();
    if (viewQuery) {
      var vwResults = searchBoms(viewQuery);
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-t4-per-doc-price-update
node test-t4.js
```
