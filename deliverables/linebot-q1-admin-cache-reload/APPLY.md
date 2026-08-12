# Q1 — Admin Cache Reload Patch & Integration Guide (#12)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target File**: `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **LINE Text Command ("นัด reload ราคา" / "reload ราคา")**:
   - เพิ่มการตรวจจับคำสั่ง `^(นัด\s*)?reload\s*ราคา` และ `reload catalog`
   - บังคับตรวจสิทธิ์ `isAdminUser(_userId)` (fail-closed)
   - เรียกใช้ `_catalogCacheImpl.invalidate()` เพื่อรีเซ็ต Timestamp แคช
   - ตอบกลับ LINE: `"⚡ ล้างแคชราคากลางเรียบร้อยแล้ว (อัปเดต ณ HH:MM:SS)"`
2. **HTTP POST Endpoint (`POST /api/catalog/reload`)**:
   - บังคับตรวจสิทธิ์ `requireAdminAuth(req, res)` (Bearer token)
   - เรียก `_catalogCacheImpl.invalidate()`
   - ตอบกลับ 200 OK JSON: `{ ok: true, message: "...", reloaded_at: "...", stats: {...} }`
3. **Audit Logging**:
   - บันทึก `catalog_reload` และ `catalog_reload_line` ลง audit log โดยไม่มี PII

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: แทรก HTTP POST Endpoint ใน `app.js` (วางไว้ก่อน `GET /api/catalog` ประมาณบรรทัด 3637)

#### BEFORE Context:
```javascript
  if (!_enerviaAuth.gate(req, res)) return;
  if (_enerviaArchive.handle(req, res)) return;
  if (_enerviaArchiveCatalog.handle(req, res)) return;

  // Catalog search API — sobek: admin only (exposes product prices)
  if (method === 'GET' && url.indexOf('/api/catalog') === 0) {
```

#### AFTER Replacement:
```javascript
  if (!_enerviaAuth.gate(req, res)) return;
  if (_enerviaArchive.handle(req, res)) return;
  if (_enerviaArchiveCatalog.handle(req, res)) return;

  // POST /api/catalog/reload — Admin-only endpoint to invalidate pricing catalog cache
  if (method === 'POST' && url === '/api/catalog/reload') {
    if (!requireAdminAuth(req, res)) return;
    try {
      _catalogCacheImpl.invalidate();
      var reloadedAt = new Date().toISOString();
      auditLog('catalog_reload', '', 'Catalog cache invalidated by admin HTTP endpoint');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        message: 'Catalog cache invalidated successfully',
        reloaded_at: reloadedAt,
        stats: _catalogCacheImpl.stats()
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Catalog search API — sobek: admin only (exposes product prices)
  if (method === 'GET' && url.indexOf('/api/catalog') === 0) {
```

---

### Step 2: แทรก LINE Command Handler ใน `app.js` (ประมาณบรรทัด 3305)

#### BEFORE Context:
```javascript
  // "แก้ราคา [brand] [model] [ราคาใหม่]" (admin only)
  var _priceEditM = text.match(/แก้ราคา\s+(\S+)\s+(\S+)\s+(\d+)/);
  if (_priceEditM) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    var _peBrand = _priceEditM[1], _peModel = _priceEditM[2], _pePrice = parseInt(_priceEditM[3], 10);
    await lReply(rt, [buildProductPriceEditFlex(_peBrand, _peModel, 0, _pePrice)]);
    return;
  }
```

#### AFTER Replacement:
```javascript
  // "แก้ราคา [brand] [model] [ราคาใหม่]" (admin only)
  var _priceEditM = text.match(/แก้ราคา\s+(\S+)\s+(\S+)\s+(\d+)/);
  if (_priceEditM) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    var _peBrand = _priceEditM[1], _peModel = _priceEditM[2], _pePrice = parseInt(_priceEditM[3], 10);
    await lReply(rt, [buildProductPriceEditFlex(_peBrand, _peModel, 0, _pePrice)]);
    return;
  }

  // "นัด reload ราคา" / "reload ราคา" → Invalidate catalog cache (admin only)
  if (/^(นัด\s*)?reload\s*ราคา/i.test(lo) || /reload\s*catalog/i.test(lo)) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    _catalogCacheImpl.invalidate();
    var _rNow = new Date();
    var _timeStr = _rNow.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' });
    auditLog('catalog_reload_line', _userId, 'Catalog cache invalidated via LINE command');
    await rText(rt, '⚡ ล้างแคชราคากลางเรียบร้อยแล้ว (อัปเดต ณ ' + _timeStr + ')');
    return;
  }
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-q1-admin-cache-reload
node test-q1.js
```
