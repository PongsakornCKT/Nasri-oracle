# U3 — Sale Identity & Phone Normalizer Guide (#B1)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/sale-identity-payload.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:2234` (จุดสร้างใบเสนอราคาสำเร็จ)  
**Business Decision (พี่พงเคาะ B1)**: ใบเสนอราคาผูกกับ Sale ที่สั่ง (`sale_line_user_id = ev.source.userId`) — ฝั่ง Bot ไม่ Resolve User ID เอง (ให้ WordPress Dashboard Resolve ตาม Mapping)  
**Author**: Nasri Oracle — Right Hand of Ma me 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ระบบจัดโครงสร้าง Payload & Normalize เบอร์โทรศัพท์ (`sale-identity-payload.js`)**:
   - แนบ `sale_line_user_id = ev.source.userId` เพื่อระบุตัวตนพนักงานขายผู้สั่งสร้างเอกสาร
   - ทำความสะอาดเบอร์โทรศัพท์ฝั่งส่งออก: ตัดเว้นวรรค ขีด (-) และแปลงรหัสประเทศ `+66` ➔ `0` (เช่น `+6681-234-5678` ➔ `0812345678`)

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/sale-identity-payload.js`

```bash
cp deliverables/linebot-u3-sale-identity-payload/lib/sale-identity-payload.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/sale-identity-payload.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// U3 (#B1): Sale identity & phone normalization payload module
var _saleIdentityPayload = require('./lib/sale-identity-payload');
```

---

### Step 3: เรียกใช้งานขณะ Enqueue Outbox (`app.js:2234`)

```javascript
    var _syncPayload = _saleIdentityPayload.buildSyncPayload(spec, result, userId);
    _syncOutboxClient.enqueueQuotation(result.quote_number, _syncPayload);
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-u3-sale-identity-payload
node test-u3.js
```
