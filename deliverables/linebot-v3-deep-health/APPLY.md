# V3 — Deep /health + Build Info Guide (#Phase04)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/deep-health-checker.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:3839-3855` (จุด Endpoint /health)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ขยาย Endpoint `/health` เพิ่ม Sub-checks (`deep-health-checker.js`)**:
   - เพิ่มการตรวจสอบระบบย่อย: `sqlite_ok`, `catalog_lkg_age_sec`, `outbox_pending_count`, `followup_last_run`, `push_quota_usage_pct`
   - รวบรวมข้อมูลสถานะแบบ Read-Only จากทุกโมดูลระบบย่อย
2. **สร้าง Endpoint `/__build`**:
   - คืนค่าข้อมูลการ Build และ Deploy: `git_sha` (จาก `process.env.DEPLOY_SHA`), `deploy_at` (จาก `process.env.DEPLOY_AT`), `node_version`, และ `service`

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/deep-health-checker.js`

```bash
cp deliverables/linebot-v3-deep-health/lib/deep-health-checker.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/deep-health-checker.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// V3 (#Phase04): Deep health checker & build info module
var _deepHealthChecker = require('./lib/deep-health-checker');
```

---

### Step 3: ปรับปรุง Endpoint `/health` และเพิ่ม `/__build` ใน `app.js` (`app.js:3839-3855` Verified by Grep)

#### BEFORE Context (`app.js:3839-3855` Verified by Grep):
```javascript
  // Health
  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    var bomCount = 0, qtCount = 0;
    try { bomCount = loadBomIndex().boms.length; } catch (e) { /* ignore */ }
    try { qtCount = loadQtIndex().quotations.length; } catch (e) { /* ignore */ }
    res.end(JSON.stringify(_degradedGuard.getHealthStatus({
      status: _degradedGuard.isDegraded() ? 'degraded' : 'ok',
      service: 'nasri-line-bot',
      version: 'v2.0.0',
      bom_count: bomCount,
      qt_count: qtCount,
      rate_limit: { qt_per_day: RATE_LIMIT_MAX_QT, bom_per_day: RATE_LIMIT_MAX_BOM },
      ts: new Date().toISOString(),
    })));
    return;
  }
```

#### AFTER Replacement:
```javascript
  // Health & Build Info (V3 Deep Health)
  if (method === 'GET' && url === '/__build') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(_deepHealthChecker.getBuildInfo()));
    return;
  }

  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    var bomCount = 0, qtCount = 0;
    try { bomCount = loadBomIndex().boms.length; } catch (e) { /* ignore */ }
    try { qtCount = loadQtIndex().quotations.length; } catch (e) { /* ignore */ }
    var _subChecks = _deepHealthChecker.getDeepHealthStatus(_persistence.sqliteDb, {});
    res.end(JSON.stringify(_degradedGuard.getHealthStatus({
      status: _degradedGuard.isDegraded() ? 'degraded' : 'ok',
      service: 'nasri-line-bot',
      version: 'v2.0.0',
      bom_count: bomCount,
      qt_count: qtCount,
      rate_limit: { qt_per_day: RATE_LIMIT_MAX_QT, bom_per_day: RATE_LIMIT_MAX_BOM },
      sub_checks: _subChecks,
      ts: new Date().toISOString(),
    })));
    return;
  }
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-v3-deep-health
node test-v3.js
```
