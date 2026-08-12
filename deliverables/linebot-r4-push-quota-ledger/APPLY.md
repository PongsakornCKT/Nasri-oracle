# R4 — LINE Push Quota Ledger & Outbound Queue Guide (#R4)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/push-quota-ledger.js` (ใหม่), `lib/line-api.js`, `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **นับโควตา LINE Push API รายเดือนแบ่งตามหมวดหมู่ (`push_ledger`)**:
   - บันทึกยอดการยิง Push API แต่ละหมวดหมู่ (`qt`, `bom`, `alert`, `reminder`) ลงตาราง SQLite `push_ledger`
   - ตรวจจับเพดาน `LINE_PUSH_QUOTA` (ค่าเริ่มต้น 500 ข้อความ/เดือน)
2. **ระบบแจ้งเตือนเมื่อถึง 80% ของโควตา**:
   - ยิงแจ้งเตือน LINE Admin ทันทีเมื่อยอดรวม Push ประจำเดือนถึง 80% ของเพดานโควตา (`⚠️ [LINE PUSH QUOTA ALERT]...`)
3. **Degrade Policy (ห้ามทิ้งข้อความเงียบๆ)**:
   - เมื่อโควตาเต็ม 100% ระบบจะไม่โยน Error หรือทิ้งข้อความเงียบๆ แต่จะนำข้อความเก็บเข้าคิวออกนอก `push_outbound_queue` ใน SQLite เพื่อรอการส่งในเดือนถัดไป หรือส่งผ่านช่องทางอื่น

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/push-quota-ledger.js`

```bash
cp deliverables/linebot-r4-push-quota-ledger/lib/push-quota-ledger.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/push-quota-ledger.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// R4 (#R4): LINE push quota ledger & outbound queue
var _pushQuotaLedger = require('./lib/push-quota-ledger')({
  sqlitePath: SQLITE_PATH,
  quotaLimit: parseInt(process.env.LINE_PUSH_QUOTA || '500', 10),
  notifyAdmin: notifyAdmin
});
```

---

### Step 3: ปรับปรุง `lPush` ใน `lib/line-api.js` (ประมาณบรรทัด 45)

```javascript
  function lPush(to, messages, category) {
    var check = _pushQuotaLedger.recordAndCheckPush(category || 'general', to, messages);
    if (!check.allowed) {
      console.warn('[line-api] Push quota exceeded (' + check.current_usage + '/' + check.quota_limit + ') — queued payload to push_outbound_queue');
      return Promise.resolve({ ok: false, queued: true });
    }
    // Proceed with LINE API push call...
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-r4-push-quota-ledger
node test-r4.js
```
