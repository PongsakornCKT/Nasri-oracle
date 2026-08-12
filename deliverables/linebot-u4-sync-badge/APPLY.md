# U4 — Dashboard Sync Badge Guide (#B6)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/sync-badge-builder.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:2315` (จุดสร้าง Flex Card ใบเสนอราคา)  
**Business Decision (พี่พงเคาะ B6)**: Sync ทางเดียว LINE ➔ Dashboard (แสดงสถานะ Sync บน Flex Card)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ป้ายสถานะ Sync บน Flex Card (`sync-badge-builder.js`)**:
   - เมื่อสร้างใบเสนอราคาแรกเริ่ม ป้าย Flex Card แสดงสถานะ: `"⏳ รอขึ้น dashboard"`
   - เมื่อ Worker Sync ข้อมูลไปยัง Dashboard สำเร็จ จะยิงข้อความอัปเดตแบบ Async ผ่าน `lPush`: `"✓ ขึ้น dashboard แล้ว (lead #<id>)"`

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/sync-badge-builder.js`

```bash
cp deliverables/linebot-u4-sync-badge/lib/sync-badge-builder.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/sync-badge-builder.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// U4 (#B6): Dashboard sync badge module
var _syncBadgeBuilder = require('./lib/sync-badge-builder');
```

---

### Step 3: แทรกป้ายสถานะใน Flex Card ใบเสนอราคา (`app.js:2315`)

#### BEFORE Context (`app.js:2315` Verified by Grep):
```javascript
            { type: 'text', text: 'เลขที่: ' + result.quote_number, size: 'xs', color: '#888888', margin: 'sm' },
```

#### AFTER Replacement:
```javascript
            { type: 'text', text: 'เลขที่: ' + result.quote_number + ' • ' + _syncBadgeBuilder.getPendingBadgeText(), size: 'xs', color: '#888888', margin: 'sm' },
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-u4-sync-badge
node test-u4.js
```
