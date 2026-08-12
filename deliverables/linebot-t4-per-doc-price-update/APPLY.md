# T4v2 — Per-Document Price Override Guide (#14 - REVISION 2)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/doc-price-override.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:3082-3096` (`case 'update_price'`), `app.js:3305` (คำสั่ง Admin LINE)  
**Business Decision (พี่พงเคาะ A3)**: **ห้ามแก้ราคากลาง/ชีตผ่าน bot เด็ดขาด!** ให้อัปเดตราคา item ในเอกสารใบนั้นๆ เท่านั้น (per-document override ใน SQLite)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ (แก้ไขตาม Feedback pa Oracle)

1. **พิงโค้ดระบบจริง `_qtCrud.updateQuotationPrices` (ไม่ใช้อ้างอิง `_pricePinning` เด็ดขาด)**:
   - ปรับใช้โครงสร้าง `_qtCrud.updateQuotationPrices` และ `_qtCrud.editItem` จาก `lib/qt-crud-bridge.js`
   - ปรับปรุงเฉพาะ `unit_cost` และ `total_cost` ของอุปกรณ์ในเอกสารฉบับนั้นใน `nasri.sqlite`
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
// T4v2 (#14): Per-document price override engine (P'Phong decision A3: NEVER write back to Google Sheets)
var _docPriceOverride = require('./lib/doc-price-override')({
  sqlitePath: SQLITE_PATH
});
```

---

### Step 3: แทรกคำสั่ง LINE `"แก้ราคา <item> <ราคา> ใน <id>"` ใน `app.js` (`app.js:3082-3096` Verified by Grep)

#### BEFORE Context (`app.js:3082-3096` Verified by Grep):
```javascript
        case 'update_price': {
          if (!_qtId) {
            if (_convState) _convState.setState(k, { pending_action: 'await_qt_for_update_price' });
            await rText(rt, 'จะอัพเดทราคาใบไหนครับ? ส่งเลข QT มาได้เลยครับ\n(หรือพิมพ์ QT ตรงๆ เช่น QT202604130001)');
            return;
          }
          try {
            var _priceDiff = await _qtCrud.updateQuotationPrices(_qtId, _dbPath);
            if (!_priceDiff.changes || _priceDiff.changes.length === 0) {
              await rText(rt, 'ไม่มีรายการที่อัพเดทราคาได้ครับ (ไม่พบใน catalog)\nใบเสนอ ' + _qtId);
            } else {
              await lReply(rt, [buildPriceUpdateDiffFlex(_priceDiff.changes, _priceDiff.old_total, _priceDiff.new_total)]);
            }
          } catch(e) { await rText(rt, '❌ อัพเดทราคาไม่ได้ครับ: ' + e.message.slice(0, 80)); }
          return;
        }
```

#### AFTER Replacement:
```javascript
        case 'update_price': {
          if (!_qtId) {
            if (_convState) _convState.setState(k, { pending_action: 'await_qt_for_update_price' });
            await rText(rt, 'จะอัพเดทราคาใบไหนครับ? ส่งเลข QT มาได้เลยครับ\n(หรือพิมพ์ QT ตรงๆ เช่น QT202604130001)');
            return;
          }
          try {
            var _priceDiff = await _qtCrud.updateQuotationPrices(_qtId, _dbPath);
            if (!_priceDiff.changes || _priceDiff.changes.length === 0) {
              await rText(rt, 'ไม่มีรายการที่อัพเดทราคาได้ครับ (ไม่พบใน catalog)\nใบเสนอ ' + _qtId);
            } else {
              await lReply(rt, [buildPriceUpdateDiffFlex(_priceDiff.changes, _priceDiff.old_total, _priceDiff.new_total)]);
            }
          } catch(e) { await rText(rt, '❌ อัพเดทราคาไม่ได้ครับ: ' + e.message.slice(0, 80)); }
          return;
        }

        // T4v2 (#14): Per-document single item price override command
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
              rText(rt, '✅ แก้ไขราคาสำเร็จ (' + _targetDocId + '):\n• ' + _itemName + ': ฿' + _overrideRes.old_price.toLocaleString() + ' ➔ ฿' + _newPrice.toLocaleString() + '\n• ยอดรวมใหม่: ฿' + _overrideRes.new_total.toLocaleString() + '\n\n*(บันทึกเฉพาะเอกสารนี้ใน nasri.sqlite เรียบร้อย ไม่กระทบตารางราคากลาง)*');
            } else {
              rText(rt, '❌ ' + _overrideRes.error);
            }
          });
          return;
        }
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-t4-per-doc-price-update
node test-t4.js
```
