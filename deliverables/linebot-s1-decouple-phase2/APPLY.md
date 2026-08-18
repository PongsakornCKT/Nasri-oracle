# S1 — Decouple Remaining Hardcoded Prices Phase 2 Guide (#11)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/decouple-phase2.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:1250-1260`, `app.js:1317`, `app.js:1500-1558`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **Decouple ราคา Hardcoded ของ ATMOCE MI-500/1250 และ Sigenergy Accessories**:
   - พยายามอ่านราคาจริงจาก Catalog แท็บ `Inverters - ATMOCE` และ `Inverters - Sigenergy` ก่อนเสมอ
   - หากพบจะใช้ราคาจาก Catalog พร้อมติดแท็ก `price_source: "catalog"`
2. **Horus Golden Rules (กติกาความปลอดภัยเข้มงวด)**:
   - **ห้ามลบราคา Fallback เดิมทิ้ง** (คงไว้เป็น Last-Resort ป้องกันแอป Crash เมื่อ Sheets ล่ม)
   - **ห้ามแตะสูตรกำไร/ค่าแรง ATMOCE Battery Tier**
   - **ห้ามแตะตัวเลขใน Claude System Prompt (`app.js:492`)**

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/decouple-phase2.js`

```bash
cp deliverables/linebot-s1-decouple-phase2/lib/decouple-phase2.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/decouple-phase2.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// S1 (#11): Phase 2 price decoupling helper for ATMOCE & Sigenergy accessories
var _decouplePhase2 = require('./lib/decouple-phase2');
```

---

### Step 3: ปรับจุดอ่านราคา ATMOCE MI-500/1250 ใน `app.js` (บรรทัด 1317)

#### BEFORE Context (`app.js:1317` Verified by Grep):
```javascript
      if (!_srpOk) {
      // ── Catalog fallback (if SRP CLI unavailable) ─────────────
      var miPrice = miRow ? extractPrice(miRow) : miFallbackPrice;
      items.push({ part_number: miModel, part_name: miName, manufacturer: 'ATMOCE', category: 'อินเวอร์เตอร์', quantity: miQty, unit_cost: miPrice, total_cost: miQty * miPrice, notes: '' });
```

#### AFTER Replacement:
```javascript
      if (!_srpOk) {
      // ── Catalog fallback (if SRP CLI unavailable) ─────────────
      var miRes = _decouplePhase2.resolveAtmoceMiPrice(catalog, miModel, miFallbackPrice);
      var miPrice = miRow ? (extractPrice(miRow) || miRes.price) : miRes.price;
      items.push({ part_number: miModel, part_name: miName, manufacturer: 'ATMOCE', category: 'อินเวอร์เตอร์', quantity: miQty, unit_cost: miPrice, total_cost: miQty * miPrice, notes: '', price_source: miRes.source });
```

---

### Step 4: ปรับจุดอ่านราคา Sigenergy Accessories ใน `app.js` (บรรทัด 1498–1544)

#### BEFORE Context (`app.js:1498-1544` Verified by Grep):
```javascript
    // Sigenergy accessories (gateway, sensor, kit, switch, ADCU — all MANDATORY)
    if (invBrand === 'Sigenergy') {
      // Gateway: 1P=HomePro SP-F, 3P 10kW=Home TP 30K, 3P 20-25kW=C60-2
      var gwSearchKey, gwFallbackName, gwFallbackPrice;
      if (phase === '1P') {
        gwSearchKey = 'HomePro SP-F';
        gwFallbackName = 'Gateway HomePro SP-F';
        gwFallbackPrice = 33400;
      } else if (systemKw >= 20) {
        gwSearchKey = 'C60-2';
        gwFallbackName = 'Gateway C60-2';
        gwFallbackPrice = 35000;
      } else {
        gwSearchKey = 'Home TP 30K';
        gwFallbackName = 'Gateway Home TP 30K';
        gwFallbackPrice = 15800;
      }
      var gwRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf(gwSearchKey) >= 0; });
      var gwPrice = gwRow ? (extractPrice(gwRow) || gwFallbackPrice) : gwFallbackPrice;
      var gwName = gwRow ? (extractField(gwRow, ['รุ่น (Model)', 'รุ่น', 'model']) || gwFallbackName) : gwFallbackName;
      items.push({ part_number: gwName, part_name: gwName, manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: gwPrice, total_cost: gwPrice, notes: '' });
```

#### AFTER Replacement:
```javascript
    // Sigenergy accessories (gateway, sensor, kit, switch, ADCU — all MANDATORY)
    if (invBrand === 'Sigenergy') {
      // Gateway: 1P=HomePro SP-F, 3P 10kW=Home TP 30K, 3P 20-25kW=C60-2
      var gwSearchKey, gwFallbackName, gwFallbackPrice;
      if (phase === '1P') {
        gwSearchKey = 'HomePro SP-F';
        gwFallbackName = 'Gateway HomePro SP-F';
        gwFallbackPrice = 33400;
      } else if (systemKw >= 20) {
        gwSearchKey = 'C60-2';
        gwFallbackName = 'Gateway C60-2';
        gwFallbackPrice = 35000;
      } else {
        gwSearchKey = 'Home TP 30K';
        gwFallbackName = 'Gateway Home TP 30K';
        gwFallbackPrice = 15800;
      }
      var gwRes = _decouplePhase2.resolveSigenergyAccessory(catalog, gwSearchKey, gwFallbackName, gwFallbackPrice);
      items.push({ part_number: gwRes.name, part_name: gwRes.name, manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: gwRes.price, total_cost: gwRes.price, notes: '', price_source: gwRes.source });
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-s1-decouple-phase2
node test-s1.js
```
