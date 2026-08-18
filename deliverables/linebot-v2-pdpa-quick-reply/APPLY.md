# V2 — LINE UX v2: PDPA Postback + Quick Replies Guide (#LINE UX v2)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/pdpa-postback-builder.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:2436-2441` (ข้อความถามยินยอม PDPA), `app.js:3753` (`handlePostback`)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ยกระดับ UX ข้อความยินยอม PDPA ด้วย Quick Replies (`pdpa-postback-builder.js`)**:
   - เพิ่มปุ่มกด Quick Reply `✅ ยินยอม` และ `❌ ไม่ยินยอม` แนบไปกับข้อความแจ้งนโยบาย PDPA
   - ส่ง Postback Data `action=consent&qt=<id>` และ `action=decline&qt=<id>`
2. **รองรับ `action=consent` ใน `handlePostback`**:
   - บันทึก Consent ลงฐานข้อมูลผ่าน `_persistence.logConsent(userId, 'quotation_pdf', true)` ทันทีเมื่อผู้ใช้กดปุ่มยินยอม
3. **กติกาเหล็ก**:
   - **ไม่เปลี่ยน Logic Gate PDPA เดิม** (ยังคงรองรับการพิมพ์ "ยินยอม" ทางข้อความเดิมได้ 100%)

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/pdpa-postback-builder.js`

```bash
cp deliverables/linebot-v2-pdpa-quick-reply/lib/pdpa-postback-builder.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/pdpa-postback-builder.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// V2 (#LINE UX v2): PDPA Postback & Quick Reply module
var _pdpaPostback = require('./lib/pdpa-postback-builder');
```

---

### Step 3: ปรับปรุงข้อความถามยินยอม PDPA ใน `app.js` (`app.js:2436-2441` Verified by Grep)

#### BEFORE Context (`app.js:2436-2441` Verified by Grep):
```javascript
    quotationPreviewPending.set(k, { confirmQtId: qtId, ts: Date.now(), awaitingConsent: true });
    await rText(rt, '📋 แจ้งนโยบายความเป็นส่วนตัว (PDPA)\n\n' +
      'ระบบจะบันทึกชื่อลูกค้า "' + header.customer_name + '" ลงในฐานข้อมูลเพื่อสร้างใบเสนอราคา\n\n' +
      'พิมพ์ "ยินยอม" เพื่อดำเนินการต่อ\nพิมพ์ "ไม่ยินยอม" เพื่อยกเลิกการยืนยัน');
    return;
```

#### AFTER Replacement:
```javascript
    quotationPreviewPending.set(k, { confirmQtId: qtId, ts: Date.now(), awaitingConsent: true });
    var _pdpaMsg = _pdpaPostback.buildPdpaConsentMessage(header.customer_name, qtId);
    await lReply(rt, [_pdpaMsg]);
    return;
```

---

### Step 4: เพิ่มการจัดการ `action=consent` ใน `handlePostback` (`app.js:3762` Verified by Grep)

#### BEFORE Context (`app.js:3762-3765` Verified by Grep):
```javascript
    if (action === 'view' && qtNum) {
      // Show quotation detail — reuse existing detail handler path
      var synthView = Object.assign({}, ev, {
```

#### AFTER Replacement:
```javascript
    if (action === 'consent' && qtNum) {
      _persistence.logConsent(userId, 'quotation_pdf', true);
      var synthConsent = Object.assign({}, ev, {
        type: 'message',
        message: { type: 'text', text: 'ยินยอม' },
        replyToken: rt,
      });
      return handleText(synthConsent);
    }

    if (action === 'view' && qtNum) {
      // Show quotation detail — reuse existing detail handler path
      var synthView = Object.assign({}, ev, {
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-v2-pdpa-quick-reply
node test-v2.js
```
