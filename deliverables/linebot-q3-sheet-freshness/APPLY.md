# Q3 — Sheet Freshness & Price Spike Alert Guide (#8)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/sheet-freshness-monitor.js` (ใหม่), `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **โมดูลใหม่ `lib/sheet-freshness-monitor.js`**:
   - **Stale Cache Detector**: ตรวจสอบอายุแคช L2 (`age_ms > 4 ชั่วโมง`). หากเก่าเกิน 4 ชั่วโมง จะส่งการแจ้งเตือนเข้า LINE Admin ผ่าน `notifyAdmin()` และสั่ง `invalidate()` เพื่อดึงแคชสดใน Background
   - **Price Spike Detector**: ตรวจจับราคาขายในแท็บ `Finalprice` เปรียบเทียบกับ Snapshot รอบก่อน หากราคาเปลี่ยนแปลง **> 10%** จะส่งแจ้งเตือนผ่าน `alertAdminError('price-spike', ...)` (ใช้ระบบ Throttle 10 นาที)
2. **การเชื่อมต่อกับ `app.js`**:
   - Initialize `_freshnessMonitor` ต่อจาก `_errorAlert`
   - เรียก `_freshnessMonitor.checkFreshness(catalogData, stats)` ทุกครั้งหลังโหลดแคชราคากลาง

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/sheet-freshness-monitor.js`

```bash
cp deliverables/linebot-q3-sheet-freshness/lib/sheet-freshness-monitor.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/sheet-freshness-monitor.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

#### BEFORE Context:
```javascript
// sekhmet P02: throttled admin alert for user-invisible webhook errors
var _errorAlert = require('./lib/error-alert')({ notifyAdmin: notifyAdmin });
var alertAdminError = _errorAlert.alertAdminError;
```

#### AFTER Replacement:
```javascript
// sekhmet P02: throttled admin alert for user-invisible webhook errors
var _errorAlert = require('./lib/error-alert')({ notifyAdmin: notifyAdmin });
var alertAdminError = _errorAlert.alertAdminError;

// Q3 (#8): Sheet freshness & price spike monitor (>4h stale & >10% price change alert)
var _freshnessMonitor = require('./lib/sheet-freshness-monitor')({
  catalogCache: _catalogCacheImpl,
  notifyAdmin: notifyAdmin,
  alertAdminError: alertAdminError,
  staleThresholdMs: 4 * 60 * 60 * 1000,
  priceSpikeRatio: 0.10
});
```

---

### Step 3: เพิ่มการเรียก `checkFreshness` ใน `getCatalog()` ใน `app.js` (ประมาณบรรทัด 311)

#### BEFORE Context:
```javascript
async function getCatalog() { return _catalogCacheImpl.get(); }
```

#### AFTER Replacement:
```javascript
async function getCatalog() {
  var data = await _catalogCacheImpl.get();
  try {
    _freshnessMonitor.checkFreshness(data, _catalogCacheImpl.stats());
  } catch (e) {
    console.error('[freshness-monitor] check error:', e.message);
  }
  return data;
}
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-q3-sheet-freshness
node test-q3.js
```
