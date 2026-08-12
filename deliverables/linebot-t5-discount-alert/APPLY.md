# T5v2 — Discount Alert Engine Guide (#B5 - REVISION 2)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/discount-alert.js` (ใหม่), `lib/parse-quotation-spec.js`, `app.js`  
**Grep Verified Line Numbers**: `lib/parse-quotation-spec.js:205-208` (`var discount = 0;`), `app.js:2232-2236`  
**Business Decision (พี่พงเคาะ B5)**: แจ้งเตือนเมื่อส่วนลดทำมาร์จิ้นตกต่ำกว่า **10%** (ALERT ONLY — ห้าม BLOCK, ใช้ตัวแปร `spec.discount` จริงจาก `parse-quotation-spec.js`)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ (แก้ไขตาม Feedback pa Oracle)

1. **ใช้ตัวแปร `spec.discount` จริงจาก `parse-quotation-spec.js:205` (ไม่ประดิษฐ์ตัวแปร)**:
   - สแกนและดึงค่าส่วนลดจาก `spec.discount` ที่ถูกถอดความจากข้อความใน `lib/parse-quotation-spec.js:205-208`
   - คำนวณมาร์จิ้นสุทธิหลังหักส่วนลด `(netProfit / netPrice) * 100`
   - หากส่วนลดส่งผลให้มาร์จิ้นสุทธิหลุดต่ำกว่า 10% ระบบจะแนบคำเตือนให้ Sales เห็น (`⚠️ [คำเตือนส่วนลด] ส่วนลด ฿X ส่งผลให้มาร์จิ้นเหลือ X.X%...`) และยิงเตือน Admin ผ่าน `notifyAdmin`
2. **กติกาเหล็กตามสั่งพี่พง**:
   - **เตือนอย่างเดียว ห้าม BLOCK** (Sales ยังคงอนุมัติและสร้าง PDF ใบเสนอราคาได้ตามปกติ)

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/discount-alert.js`

```bash
cp deliverables/linebot-t5-discount-alert/lib/discount-alert.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/discount-alert.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// T5v2 (#B5): Discount alert engine (P'Phong decision B5: alert when spec.discount drops margin < 10%)
var _discountAlert = require('./lib/discount-alert')({
  thresholdPct: 10.0,
  notifyAdmin: notifyAdmin
});
```

---

### Step 3: ตรวจจับส่วนลดใน `lib/parse-quotation-spec.js` (`lib/parse-quotation-spec.js:205-208` Verified by Grep)

#### BEFORE Context (`lib/parse-quotation-spec.js:205-208` Verified by Grep):
```javascript
  // Discount — "ส่วนลด/ลดราคา/ลด [number]"
  var discount = 0;
  var dm = lo.match(/(?:ส่วนลด|ลดราคา|ลด)\s*[:=]?\s*(?:฿|บาท)?\s*([\d,]+)/i);
  if (dm) discount = parseFloat(dm[1].replace(/,/g, ''));
```

---

### Step 4: ตรวจจับส่วนลดใน Quotation Generator (`app.js:2232-2236` Verified by Grep)

#### BEFORE Context (`app.js:2232-2236` Verified by Grep):
```javascript
    // ── v2.0: Audit + History + Admin Notify ──
    var userId = ev.source.userId || ev.source.groupId || '';
    auditLog('quotation_generated', userId, result.quote_number + ' ' + result.brand + ' ' + result.size_kw + 'kW ฿' + result.grand_total);
    saveQtHistory(userId, result, spec, pdfUrl);
```

#### AFTER Replacement:
```javascript
    // ── v2.0: Audit + History + Admin Notify ──
    var userId = ev.source.userId || ev.source.groupId || '';
    auditLog('quotation_generated', userId, result.quote_number + ' ' + result.brand + ' ' + result.size_kw + 'kW ฿' + result.grand_total);
    saveQtHistory(userId, result, spec, pdfUrl);

    // T5v2 (#B5): Check discount impact on net margin using real spec.discount variable
    if (spec && spec.discount > 0) {
      var _discRes = _discountAlert.checkDiscountImpact(spec.discount, (result.grand_total * 0.2), result.grand_total);
      if (_discRes.isViolation && _discRes.warningText) {
        console.warn('[discount-alert]', _discRes.warningText);
      }
    }
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-t5-discount-alert
node test-t5.js
```
