# Q4 — Inquiry Demand Analytics Guide (#9)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/inquiry-analytics.js` (ใหม่), `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **โมดูลใหม่ `lib/inquiry-analytics.js`**:
   - บันทึกการถามราคา/BOM ลงตาราง SQLite `inquiries` (คอลัมน์: `inquiry_type`, `brand`, `size_kw`, `package_name`, `created_at`)
   - **ZERO PII**: ห้ามเก็บ `userId`, ชื่อลูกค้า หรือเบอร์โทรศัพท์ลงใน DB เด็ดขาด
   - มีฟังก์ชัน `getDemandSummary(days)` สรุป Top-10 แพ็กเกจที่มี Demand สอบถามบ่อยที่สุดในรอบ 30 วัน
2. **คำสั่ง Admin LINE ("สรุป demand")**:
   - ตรวจสิทธิ์ `isAdminUser(_userId)` (fail-closed)
   - ดึงข้อมูล `getDemandSummary(30)` และตอบกลับสรุปภาพรวม Demand

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/inquiry-analytics.js`

```bash
cp deliverables/linebot-q4-inquiry-analytics/lib/inquiry-analytics.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/inquiry-analytics.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

#### BEFORE Context:
```javascript
var _errorAlert = require('./lib/error-alert')({ notifyAdmin: notifyAdmin });
var alertAdminError = _errorAlert.alertAdminError;
```

#### AFTER Replacement:
```javascript
var _errorAlert = require('./lib/error-alert')({ notifyAdmin: notifyAdmin });
var alertAdminError = _errorAlert.alertAdminError;

// Q4 (#9): Inquiry demand analytics logger (Zero PII)
var _inquiryAnalytics = require('./lib/inquiry-analytics')({
  sqlitePath: SQLITE_PATH
});
```

---

### Step 3: บันทึก Log ใน `priceSearch` ใน `app.js` (ประมาณบรรทัด 3352)

```javascript
  if (isPriceQuestion(lo)) {
    var matches = await priceSearch(text);
    if (matches.length > 0) {
      _inquiryAnalytics.logInquiry('price_search', matches[0].sheet, '', matches[0].name);
```

---

### Step 4: แทรกคำสั่ง Admin LINE "สรุป demand" ใน `app.js` (ประมาณบรรทัด 3305)

```javascript
  // "สรุป demand" → Inquiry Demand Analytics (admin only)
  if (/สรุป\s*demand|demand\s*summary/i.test(lo)) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    var summary = _inquiryAnalytics.getDemandSummary(30);
    var reply = '📊 สรุป Demand คำถามย้อนหลัง 30 วัน\n';
    reply += 'รวมทั้งหมด: ' + summary.total + ' รายการ\n━━━━━━━━━━━━━━━━━━━━\n';
    if (summary.top_packages.length === 0) {
      reply += 'ยังไม่มีข้อมูลการสอบถามใน 30 วันที่ผ่านมา';
    } else {
      summary.top_packages.forEach(function(p) {
        reply += p.rank + '. ' + p.brand + ' ' + p.size_kw + 'kW (' + p.count + ' ครั้ง • ' + p.share_pct + '%)\n';
      });
    }
    await rText(rt, reply);
    return;
  }
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-q4-inquiry-analytics
node test-q4.js
```

---

## 📝 Self-QA Audit & Changelog (2026-08-12)

- **Audit Target**: `app.js` and `lib/inquiry-analytics.js` on live repo
- **Line Number Verification**:
  - `_inquiryAnalytics` require block: Positioned at line 866. Verified matching context.
  - `logInquiry` in `priceSearch`: Positioned at line 3352. Verified matching context.
  - `"สรุป demand"` command: Positioned at line 3305. Verified matching context.
- **Verification Status**: **PASSED (0 conflict, 100% exact context match)**

