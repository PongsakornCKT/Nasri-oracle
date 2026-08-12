# Q5 — Wire Finalprice Tab to JS Path Guide (#10)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/finalprice-search.js` (ใหม่), `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **โมดูลใหม่ `lib/finalprice-search.js`**:
   - ค้นหาราคาขายระบบรวมจากแท็บ `Finalprice` (`gid 1639151553`) เมื่อลูกค้าถามราคาระบบ เช่น `"ราคา 5kW 1 เฟส"`, `"แพ็กเกจ 10kW 3 เฟส"`
   - ตอบราคารวมระบบ (เฟส, ขนาด kW, จำนวนแผง, ราคาขาย, THB/W) ตรงจากชีตราคากลาง ก่อน fallback ไปยังการค้นหาราคาชิ้นส่วนรายตัว
2. **Horus Guard Rule**:
   - หากแท็บ `Finalprice` อ่านล้มเหลว หรือไม่พบแพ็กเกจตรง โมดูลจะคืนค่า `null` เสมอ เพื่อให้ระบบ **Fall back กลับไปยัง `priceSearch` เดิมอัตโนมัติ** ปราศจาก Error หรือการ crash

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/finalprice-search.js`

```bash
cp deliverables/linebot-q5-wire-finalprice/lib/finalprice-search.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/finalprice-search.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// Q5 (#10): Finalprice system package search engine (Horus fail-closed fallback)
var _finalpriceSearch = require('./lib/finalprice-search');
```

---

### Step 3: แทรกการค้นหา `Finalprice` ก่อน `priceSearch` ใน `app.js` (ประมาณบรรทัด 3350)

#### BEFORE Context:
```javascript
  if (isPriceQuestion(lo)) {
    var matches = await priceSearch(text);
    if (matches.length > 0) {
```

#### AFTER Replacement:
```javascript
  if (isPriceQuestion(lo)) {
    var catalog = await getCatalog();
    var fpMatches = _finalpriceSearch.searchFinalprice(catalog, text);
    if (fpMatches && fpMatches.length > 0) {
      console.log('[nasri] Finalprice system package direct match — ' + fpMatches.length + ' packages');
      var fmt = function(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 0 }); };
      var reply = '📦 ราคาแพ็กเกจระบบโซลาร์ Enervia (Final Price)\n━━━━━━━━━━━━━━━━━━━━\n';
      fpMatches.forEach(function(m, i) {
        reply += (i + 1) + '. ระบบ Solar ' + m.size_kw + ' kW (' + m.phase + ' เฟส)\n';
        reply += '   จำนวนแผง: ' + m.panel_count + ' แผง\n';
        reply += '   ราคาขาย: ฿' + fmt(m.price) + (m.thb_per_w ? ' (' + m.thb_per_w + ' THB/W)' : '') + '\n\n';
      });
      reply += '━━━━━━━━━━━━━━━━━━━━\nข้อมูลตรงจากตารางราคากลาง Finalprice';
      await rText(rt, reply.trim());
      return;
    }

    var matches = await priceSearch(text);
    if (matches.length > 0) {
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-q5-wire-finalprice
node test-q5.js
```
