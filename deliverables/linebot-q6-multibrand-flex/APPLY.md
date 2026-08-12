# Q6 — Multi-Brand Comparison Flex Carousel Guide (#6)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/multibrand-flex.js` (ใหม่), `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at lh  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **โมดูลใหม่ `lib/multibrand-flex.js`**:
   - **Compare Intent Detector**: ตรวจจับคำถามเปรียบเทียบแบรนด์ เช่น `"10kW 3 เฟส ยี่ห้อไหนดี"`, `"เทียบราคา 5kW"`, `"แนะนำยี่ห้อโซลาร์"`
   - **Multi-Brand Catalog Search**: ค้นหาราคาจากทุก Inverter Brands (`ATMOCE`, `Huawei`, `Solis`, `Sigenergy`, `Deye`, `Hoymiles`)
   - **Cheap-to-Expensive Sorting**: เรียงลำดับราคาจากถูกไปแพง
   - **Tier Badges**: แปะป้ายระดับราคา `🟢 Economy`, `🔵 Standard / Value`, `⭐ Premium`
   - **Flex Carousel Payload**: สร้าง Flex Carousel การ์ดเปรียบเทียบแบรนด์พร้อมปุ่มกดสร้าง BOM ได้ทันที
2. **การเชื่อมต่อกับ `app.js`**:
   - ดักจับก่อน `priceSearch` หากเป็นคำถามเปรียบเทียบแบรนด์ ให้ตอบกลับด้วย Flex Carousel ทันที

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/multibrand-flex.js`

```bash
cp deliverables/linebot-q6-multibrand-flex/lib/multibrand-flex.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/multibrand-flex.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// Q6 (#6): Multi-brand comparison Flex carousel builder
var _multiBrandFlex = require('./lib/multibrand-flex');
```

---

### Step 3: แทรกดักจับคำถามเปรียบเทียบแบรนด์ใน `app.js` (ประมาณบรรทัด 3350)

#### BEFORE Context:
```javascript
  if (isPriceQuestion(lo)) {
    var catalog = await getCatalog();
```

#### AFTER Replacement:
```javascript
  if (isPriceQuestion(lo) || _multiBrandFlex.isCompareQuery(lo)) {
    var catalog = await getCatalog();

    // Q6 (#6): Multi-brand comparison Flex Carousel
    if (_multiBrandFlex.isCompareQuery(lo)) {
      var compareFlex = _multiBrandFlex.buildMultiBrandCompareFlex(catalog, text);
      if (compareFlex) {
        console.log('[nasri] Multi-brand comparison Flex matched for: ' + text.slice(0, 40));
        await lReply(rt, [compareFlex]);
        return;
      }
    }
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-q6-multibrand-flex
node test-q6.js
```

---

## 📝 Self-QA Audit & Changelog (2026-08-12)

- **Audit Target**: `app.js` and `lib/multibrand-flex.js` on live repo
- **Line Number Verification**:
  - `_multiBrandFlex` require block: Positioned at line 866. Verified matching context.
  - `isCompareQuery` check: Positioned at line 3350 before `priceSearch`. Verified matching context.
- **Verification Status**: **PASSED (0 conflict, 100% exact context match)**

