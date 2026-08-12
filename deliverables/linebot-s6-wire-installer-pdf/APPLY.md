# S6v2 — Wire Installer PDF Bridge Guide (#20 - REVISION 2)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/installer-pdf-bridge.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:3305` (ในบล็อกคำสั่ง Admin LINE)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ (แก้ไขตาม Feedback pa Oracle ครบ 3 ข้อ)

1. **โหลดข้อมูลจริงจาก `_qtCrud` และ `_persistence` (ไม่ส่งเปล่า `spec={}` `items=[]`)**:
   - เพิ่ม `resolveInstallerData(idQuery)` ใน `lib/installer-pdf-bridge.js`: ดึงข้อมูลจริงจาก `_qtCrud.getQuotationDetail(qtId, SQLITE_PATH)` หรือ `searchBoms` + `loadBomData` เพื่อส่งข้อมูลจริง (`spec` + `items`) เข้าไปสร้าง PDF
2. **กติกา LINE replyToken ใช้งานได้ครั้งเดียว (One-Time Rule)**:
   - รับทราบคำสั่งแรกด้วย ACK `await rText(rt, '⏳ กำลังสร้างเอกสารใบช่าง...')`
   - เมื่อสร้าง PDF เสร็จสิ้น จะส่งผลลัพธ์ Flex Card ผ่าน `await lPush(_userId, [ flexCard ])` โดย **ไม่ใช้ `lReply(rt)` ซ้ำเด็ดขาด** (ปฏิบัติตาม Pattern BOM ACK-First ของ Ptah)
3. **ด่านสิทธิ์ Admin Gate (`isAdminUser(_userId)`)**:
   - กำหนดให้คำสั่ง `"ใบช่าง <QT/BOM id>"` สามารถเรียกใช้งานได้เฉพาะผู้ใช้งานที่เป็น LINE Admin เท่านั้น (`if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }`)

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/installer-pdf-bridge.js`

```bash
cp deliverables/linebot-s6-wire-installer-pdf/lib/installer-pdf-bridge.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/installer-pdf-bridge.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// S6v2 (#20): Wire installer PDF generator bridge with real data & admin gate
var _installerPdfBridge = require('./lib/installer-pdf-bridge');
```

---

### Step 3: แทรกคำสั่ง LINE `"ใบช่าง <id>"` ใน `app.js` (บรรทัด 3305 Verified by Grep)

#### BEFORE Context (`app.js:3305` Verified by Grep):
```javascript
  // View old BOM PDF by name
  if ((lo.indexOf('ดู') >= 0) && (lo.indexOf('bom') >= 0 || lo.indexOf('pdf') >= 0)) {
```

#### AFTER Replacement:
```javascript
  // S6v2 (#20): LINE Admin command "ใบช่าง <QT/BOM id>" (Admin-only gate + ACK-first + lPush)
  if (/^(?:นัด\s*)?ใบช่าง\s+/i.test(lo)) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    var _instMatch = lo.match(/^(?:นัด\s*)?ใบช่าง\s+(.+)$/i);
    if (_instMatch) {
      var _instId = _instMatch[1].trim();
      // (1) ACK-first immediately using replyToken (rt)
      await rText(rt, '⏳ กำลังสร้างเอกสารใบช่าง (Installer Copy) สำหรับ ' + _instId + '...');

      // (2) Resolve real data from QT / BOM persistence
      _installerPdfBridge.resolveInstallerData(_instId, SQLITE_PATH, _qtCrud, _persistence).then(function(realData) {
        var specPayload = realData ? realData.spec : { qt_number: _instId };
        var itemsPayload = realData ? realData.items : [];

        var _instRes = _installerPdfBridge.generateInstallerPdfBridge(_instId, specPayload, itemsPayload, TMP_DIR);
        
        // (3) Send final Flex card via lPush (to = _userId), NEVER reuse replyToken (rt)
        if (_instRes.ok) {
          lPush(_userId, [{
            type: 'flex', altText: '📄 ใบช่าง (Installer Copy) — ' + _instId,
            contents: {
              type: 'bubble', size: 'kilo',
              header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🔧 ใบช่าง: ' + _instId, weight: 'bold', size: 'md', color: '#ffffff' }], backgroundColor: '#27ae60', paddingAll: '12px' },
              body: { type: 'box', layout: 'vertical', contents: [
                { type: 'text', text: 'เอกสารสำหรับทีมช่างติดตั้ง (CONFIDENTIAL — ห้ามส่งให้ลูกค้า)', size: 'xs', color: '#e74c3c', weight: 'bold', wrap: true },
                { type: 'text', text: 'ลูกค้า: ' + (specPayload.customer_name || '—') + ' • รายการ: ' + itemsPayload.length + ' ชิ้น', size: 'xxs', color: '#666666', margin: 'xs', wrap: true }
              ], paddingAll: '12px' },
              footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', action: { type: 'uri', label: '📥 ดาวน์โหลด PDF ใบช่าง', uri: _instRes.pdf_url }, style: 'primary', color: '#27ae60' }], paddingAll: '12px' }
            }
          }], 'alert');
        } else {
          lPush(_userId, [{ type: 'text', text: '❌ เกิดข้อผิดพลาดในการสร้าง PDF ใบช่าง: ' + _instRes.error }], 'alert');
        }
      }).catch(function(e) {
        lPush(_userId, [{ type: 'text', text: '❌ ดึงข้อมูลใบช่างไม่ได้: ' + e.message }], 'alert');
      });
      return;
    }
  }

  // View old BOM PDF by name
  if ((lo.indexOf('ดู') >= 0) && (lo.indexOf('bom') >= 0 || lo.indexOf('pdf') >= 0)) {
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-s6-wire-installer-pdf
node test-s6.js
```
