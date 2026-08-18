# Q7 — Catalog Price Lookup Decoupling Guide (#11)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/catalog-price-helper.js` (ใหม่), `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **โมดูลใหม่ `lib/catalog-price-helper.js`**:
   - พยายามอ่านราคาอุปกรณ์เสริม (Huawei Smart Dongle, Power Sensors, Sigenergy Gateways) จาก Catalog ของแท็บที่ตรงหมวดก่อนเสมอ
   - หากพบราคาใน Catalog จะคืนค่า `{ price: catalogPrice, source: 'catalog' }`
   - **Horus Rule**: หากไม่พบใน Catalog หรือตารางมีปัญหา จะใช้ราคา Hardcoded เดิมเป็น Last-Resort Fallback ทันที พร้อมคืนค่า `{ price: fallbackPrice, source: 'fallback' }`
   - ติดแท็ก `price_source: "catalog"` / `"fallback"` ในโครงสร้าง Item เพื่อความโปร่งใสใน Log และ Response
2. **กติกาเหล็ก**:
   - **ห้ามลบ Hardcoded Fallback ทิ้ง** (ป้องกันการล่มเมื่อ Google Sheets มีปัญหา)
   - **ห้ามแตะตัวเลขราคาใน Claude System Prompt (`app.js:443`) ในรอบนี้**

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/catalog-price-helper.js`

```bash
cp deliverables/linebot-q7-catalog-fallback-decouple/lib/catalog-price-helper.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/catalog-price-helper.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// Q7 (#11): Catalog price lookup helper with hardcoded last-resort fallbacks
var _catalogPriceHelper = require('./lib/catalog-price-helper');
var lookupPriceWithFallback = _catalogPriceHelper.lookupPriceWithFallback;
```

---

### Step 3: ปรับปรุงจุดคำนวณ Huawei Accessories ใน `app.js` (ประมาณบรรทัด 1381)

#### BEFORE Context:
```javascript
      if (invBrand === 'Huawei') {
        // Smart Dongle WIFI
        items.push({ part_number: 'Smart Dongle WIFI', part_name: 'Smart Dongle WIFI', manufacturer: 'Huawei', category: 'general', quantity: 1, unit_cost: 1730, total_cost: 1730, notes: '' });
        // Power Sensor
        var ctPrice = phase === '1P' ? 1750 : 3230;
        var ctName = phase === '1P' ? 'Power Sensor 1P (CT)' : 'Power Sensor 3P (CT)';
        items.push({ part_number: ctName, part_name: ctName, manufacturer: 'Huawei', category: 'general', quantity: 1, unit_cost: ctPrice, total_cost: ctPrice, notes: '' });
      }
```

#### AFTER Replacement:
```javascript
      if (invBrand === 'Huawei') {
        // Smart Dongle WIFI
        var dongleRes = lookupPriceWithFallback(catalog, 'Combiner Box & Others', 'Smart Dongle WIFI', 1730);
        items.push({ part_number: 'Smart Dongle WIFI', part_name: 'Smart Dongle WIFI', manufacturer: 'Huawei', category: 'general', quantity: 1, unit_cost: dongleRes.price, total_cost: dongleRes.price, notes: '', price_source: dongleRes.source });

        // Power Sensor
        var ctFallbackPrice = phase === '1P' ? 1750 : 3230;
        var ctName = phase === '1P' ? 'Power Sensor 1P (CT)' : 'Power Sensor 3P (CT)';
        var ctRes = lookupPriceWithFallback(catalog, 'Combiner Box & Others', ctName, ctFallbackPrice);
        items.push({ part_number: ctName, part_name: ctName, manufacturer: 'Huawei', category: 'general', quantity: 1, unit_cost: ctRes.price, total_cost: ctRes.price, notes: '', price_source: ctRes.source });
      }
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-q7-catalog-fallback-decouple
node test-q7.js
```

---

## 📝 Self-QA Audit & Changelog (2026-08-12)

- **Audit Target**: `app.js` and `lib/catalog-price-helper.js` on live repo
- **Line Number Verification**:
  - `_catalogPriceHelper` require block: Positioned at line 866. Verified matching context.
  - Huawei accessories lookup: Positioned at line 1381. Verified matching context.
- **Verification Status**: **PASSED (0 conflict, 100% exact context match)**

