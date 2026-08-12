# U2 — Outbox Queue & Sync Client Guide (#Phase04)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/sync-outbox-client.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:2234` (จุดสร้างใบเสนอราคาสำเร็จ), `app.js:3700` (จุด Cron endpoint sync-flush)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ระบบคิว Outbox และ Worker Sync (`sync-outbox-client.js`)**:
   - สร้างตาราง `sync_outbox` ใน `nasri.sqlite` เพื่อดักเก็บบันทึกทุกใบเสนอราคาที่สร้างสำเร็จ
   - ทำงานผ่าน Worker Flush (เรียกเมื่อ Webhook ว่าง และต่อกับ Cron Endpoint `/api/cron/sync-flush`)
   - ยิง POST ไปยัง `https://survey.enervia.co.th/wp-json/lf/v1/quotes/sync` พร้อม Header `X-LF-Bot-Secret`
2. **ระบบ Retry Backoff & Dead-letter Guard**:
   - หน่วงเวลาถอยฉากแบบ Backoff: 1 นาที, 5 นาที, 30 นาที
   - ล้มเหลวสะสมครบ 5 ครั้ง ➔ ย้ายสถานะเป็น `dead_letter` พร้อมแจ้งเตือน Admin ผ่าน `notifyAdmin`
3. **กติกาความปลอดภัย**:
   - พัฒนาเป็น Lib Module + Unit Test โดยใช้ Mock fetch **ไม่ยิง Endpoint จริงเด็ดขาด** (จนกว่าฝั่ง WordPress จะพร้อม)

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/sync-outbox-client.js`

```bash
cp deliverables/linebot-u2-outbox-sync-client/lib/sync-outbox-client.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/sync-outbox-client.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// U2 (#Phase04): Outbox queue & sync client module
var _syncOutboxClient = require('./lib/sync-outbox-client')({
  sqlitePath: SQLITE_PATH,
  notifyAdmin: notifyAdmin
});
```

---

### Step 3: เติมคิว Outbox หลังสร้างใบเสนอราคาสำเร็จ (`app.js:2234`)

```javascript
    _syncOutboxClient.enqueueQuotation(result.quote_number, {
      quote_number: result.quote_number,
      sale_line_user_id: userId,
      customer_name: spec.customer_name || '',
      phone: spec.phone || '',
      grand_total: result.grand_total || 0,
      created_at: Date.now()
    });
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-u2-outbox-sync-client
node test-u2.js
```
