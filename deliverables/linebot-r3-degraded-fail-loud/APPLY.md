# R3 — SQLite to JSON Fallback Fail-Loud Guide (#R3)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/degraded-guard.js` (ใหม่), `lib/persistence.js`, `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **แก้ปัญหาสลับไปใช้ Legacy JSON เงียบๆ (Split-Brain Risk)**:
   - ปัจจุบันเมื่อ SQLite DB ล้มเหลว ระบบจะสลับไปใช้ JSON storage โดยไม่แจ้งเตือนใคร ทำให้เกิดปัญหาสภาวะข้อมูลไม่ตรงกัน (Split-Brain)
   - เพิ่มด่านตรวจ `degraded-guard.js`: ยิงแจ้งเตือนเข้า LINE Admin ทันทีที่มีการสลับไปใช้ JSON storage (`🚨 [DEGRADED MODE ALERT]...`)
2. **แสดงสถานะ Degraded ชัดเจนบน Health Endpoint**:
   - เพิ่มฟิลด์ `degraded_mode: true` / `false` และ `storage_engine: "sqlite_wal"` / `"legacy_json"` บน `/health` และ `/api/admin/health`

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/degraded-guard.js`

```bash
cp deliverables/linebot-r3-degraded-fail-loud/lib/degraded-guard.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/degraded-guard.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// R3 (#R3): Degraded mode fail-loud guard (SQLite failure alert & health status)
var _degradedGuard = require('./lib/degraded-guard')({
  notifyAdmin: notifyAdmin
});
```

---

### Step 3: ส่ง `degradedGuard` ให้ `_persistence` ใน `app.js` (ประมาณบรรทัด 840)

```javascript
var _persistence = require('./lib/persistence')({
  BOM_DIR: BOM_DIR,
  TMP_DIR: TMP_DIR,
  BOM_INDEX: BOM_INDEX,
  QT_INDEX_PATH: QT_INDEX_PATH,
  SQLITE_PATH: SQLITE_PATH,
  USE_LEGACY_JSON: USE_LEGACY_JSON,
  generateBomHtml: generateBomHtml,
  auditLog: auditLog,
  lastBom: lastBom,
  degradedGuard: _degradedGuard
});
```

---

### Step 4: อัปเดต `/health` Endpoint ใน `app.js` (ประมาณบรรทัด 3700)

```javascript
  // GET /health or /api/admin/health
  if (method === 'GET' && (url === '/health' || url === '/api/admin/health')) {
    var healthObj = _degradedGuard.getHealthStatus({
      status: _degradedGuard.isDegraded() ? 'degraded' : 'ok',
      timestamp: new Date().toISOString()
    });
    res.writeHead(_degradedGuard.isDegraded() ? 200 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthObj));
    return;
  }
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-r3-degraded-fail-loud
node test-r3.js
```
