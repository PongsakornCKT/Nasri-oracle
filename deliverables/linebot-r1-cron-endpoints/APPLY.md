# R1 — External Cron Endpoints Guide (#R1)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/cron-router.js` (ใหม่), `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **แก้ปัญหา Passenger Spin-Down**:
   - เมื่อไม่มีผู้ใช้งานเข้ามายังเว็บ Passenger จะ Spin down ทำให้ `setInterval` ในระบบค้างหยุดทำงาน
   - ย้ายงานสแกนรอบเวลา (Pre-warm catalog, Sheet freshness check) ออกมาเป็น HTTP Endpoints สำหรับให้ Crontab / External Uptime Monitor ยิงกระตุ้นล่วงหน้า
2. **รักษาความปลอดภัยด้วย `CRON_TOKEN` (Fail-Closed)**:
   - บังคับใช้ `CRON_TOKEN` ที่แยก scope ออกจาก `ADMIN_API_TOKEN` อย่างเด็ดขาด (ห้ามใช้ `ADMIN_API_TOKEN` กับงาน cron)
   - รองรับการยิงผ่าน `Authorization: Bearer <CRON_TOKEN>` หรือ Query Parameter `?token=<CRON_TOKEN>`
3. **รักษา Fallback `setInterval` เดิม**:
   - ไม่ลบ `setInterval` ในกระบวนการเดิม เพื่อเป็น In-process fallback หาก external cron ขัดข้อง

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/cron-router.js`

```bash
cp deliverables/linebot-r1-cron-endpoints/lib/cron-router.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/cron-router.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// R1 (#R1): External cron endpoints with dedicated CRON_TOKEN
var CRON_TOKEN = process.env.CRON_TOKEN || '';
var _cronRouter = require('./lib/cron-router')({
  cronToken: CRON_TOKEN,
  catalogCache: _catalogCacheImpl,
  freshnessMonitor: typeof _freshnessMonitor !== 'undefined' ? _freshnessMonitor : null,
  auditLog: auditLog
});
```

---

### Step 3: แทรกดักจับ Route ใน HTTP Request Handler ของ `app.js` (ประมาณบรรทัด 3635)

#### BEFORE Context:
```javascript
  if (!_enerviaAuth.gate(req, res)) return;
  if (_enerviaArchive.handle(req, res)) return;
  if (_enerviaArchiveCatalog.handle(req, res)) return;
```

#### AFTER Replacement:
```javascript
  if (!_enerviaAuth.gate(req, res)) return;
  if (_enerviaArchive.handle(req, res)) return;
  if (_enerviaArchiveCatalog.handle(req, res)) return;

  // R1 (#R1): Handle external cron endpoints (GET /api/cron/*)
  if (_cronRouter.handleCronRequest(req, res)) return;
```

---

## ⏰ ตัวอย่างการตั้งค่า External Crontab / cURL

```bash
# 1. ตั้งค่า CRON_TOKEN ใน .env หรือ environment ของ Plesk
CRON_TOKEN=your_secure_cron_token_here

# 2. ตั้ง Crontab บน Server หรือยิงผ่าน External Monitor (เช่น UptimeRobot)
# Pre-warm catalog ทุกๆ 15 นาที
*/15 * * * * curl -s "https://ai.enervia.co.th/api/cron/prewarm?token=your_secure_cron_token_here"

# Check sheet freshness ทุกๆ 1 ชั่วโมง
0 * * * * curl -s "https://ai.enervia.co.th/api/cron/freshness?token=your_secure_cron_token_here"
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-r1-cron-endpoints
node test-r1.js
```
