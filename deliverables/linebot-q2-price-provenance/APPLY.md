# Q2 — Price Provenance Footnote Guide (#13)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `app.js`, `lib/line-api.js`, `lib/flex-builders.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **เพิ่ม Helper `formatProvenanceText(ageMs)`**:
   - คำนวณอายุข้อมูลในแคช (หน่วยนาที)
   - หาก `ageMs < 60,000` (น้อยกว่า 1 นาที) แสดง `(สด)`
   - หาก `ageMs >= 60,000` แสดง `(แคช)`
   - รูปแบบข้อความ: `"ℹ️ ข้อมูลราคากลางอัปเดตเมื่อ X นาทีก่อน (สด/แคช)"`
2. **แสดงผลท้ายข้อความตอบกลับราคา (`priceSearch` ใน `app.js:3359`)**:
   - ท้ายรายการค้นหาราคาตรง บันทึกที่มาและอายุแคชท้ายข้อความ
3. **แสดงผลท้าย Flex Message ใบเสนอราคา**:
   - เพิ่มบรรทัดข้อความ Provenance ที่ด้านล่างของ Flex Card ใบเสนอราคา
4. **กฎเหล็ก**:
   - **DISPLAY ONLY**: ห้ามแตะตัวเลขราคาหรือสูตรคำนวณใดๆ ทั้งสิ้น

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: เพิ่ม `formatProvenanceText` ใน `app.js` (ประมาณบรรทัด 380)

```javascript
/**
 * Format Price Provenance Footnote String (DISPLAY ONLY)
 * @param {number|null} ageMs Age of cached sheet data in milliseconds
 * @returns {string} e.g. "ℹ️ ข้อมูลราคากลางอัปเดตเมื่อ 5 นาทีก่อน (แคช)"
 */
function formatProvenanceText(ageMs) {
  if (ageMs === null || ageMs === undefined || isNaN(ageMs)) return '';
  var ageMin = Math.floor(Math.max(0, ageMs) / 60000);
  var cacheLabel = (ageMs < 60000) ? 'สด' : 'แคช';
  return 'ℹ️ ข้อมูลราคากลางอัปเดตเมื่อ ' + ageMin + ' นาทีก่อน (' + cacheLabel + ')';
}
```

---

### Step 2: ปรับปรุงการตอบกลับ `priceSearch` ใน `app.js` (ประมาณบรรทัด 3355)

#### BEFORE Context:
```javascript
      var fmt = function(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 0 }); };
      var reply = '💰 ราคาสินค้า Enervia (ราคาสั่งซื้อ)\n━━━━━━━━━━━━━━━━━━━━\n';
      matches.forEach(function(m, i) {
        reply += (i + 1) + '. ' + m.name + '\n   ฿' + fmt(m.price) + ' [' + m.sheet + ']\n';
      });
      reply += '━━━━━━━━━━━━━━━━━━━━\nราคาจาก Google Sheets Catalog';
      await rText(rt, reply);
      return;
```

#### AFTER Replacement:
```javascript
      var fmt = function(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 0 }); };
      var reply = '💰 ราคาสินค้า Enervia (ราคาสั่งซื้อ)\n━━━━━━━━━━━━━━━━━━━━\n';
      matches.forEach(function(m, i) {
        reply += (i + 1) + '. ' + m.name + '\n   ฿' + fmt(m.price) + ' [' + m.sheet + ']\n';
      });
      var _cStats = (_catalogCacheImpl && _catalogCacheImpl.stats) ? _catalogCacheImpl.stats() : null;
      var provenanceStr = _cStats ? formatProvenanceText(_cStats.age_ms) : '';
      reply += '━━━━━━━━━━━━━━━━━━━━\n' + (provenanceStr || 'ราคาจาก Google Sheets Catalog');
      await rText(rt, reply);
      return;
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-q2-price-provenance
node test-q2.js
```
