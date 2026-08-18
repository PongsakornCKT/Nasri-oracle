# T1 — Margin Guard Guide (#4)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/margin-guard.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:3487` (Finalprice package answer), `app.js:1292` (ATMOCE SRP summary)  
**Business Decision (พี่พงเคาะ)**: เตือนเมื่อกำไร **<10%** (ALERT ONLY — ห้าม BLOCK, ห้ามโชว์ราคาทุนให้ non-admin)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ระบบตรวจจับ Margin ต่ำกว่า 10% (`margin-guard.js`)**:
   - คำนวณ `% margin = (กำไร / ราคาขาย) * 100`
   - หาก Margin ต่ำกว่า 10% จะแนบคำเตือนให้ Sales เห็น (`⚠️ [คำเตือน Sales] มาร์จิ้นต่ำกว่าเกณฑ์ 10%...`) และยิงเตือน Admin ผ่าน `notifyAdmin`
2. **กติกาเหล็กตามสั่งพี่พง**:
   - **เตือนอย่างเดียว ห้าม BLOCK** (Sales ยังคงได้รับราคาและสร้างเอกสารได้ตามปกติ)
   - **ห้ามแสดงตัวเลขราคาทุนหรือตัวเลขกำไรให้ non-admin เห็น** (แสดงเฉพาะเปอร์เซ็นต์มาร์จิ้นเตือน)

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/margin-guard.js`

```bash
cp deliverables/linebot-t1-margin-guard/lib/margin-guard.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/margin-guard.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// T1 (#4): Margin guard module (P'Phong decision: alert when margin < 10%)
var _marginGuard = require('./lib/margin-guard')({
  thresholdPct: 10.0,
  notifyAdmin: notifyAdmin
});
```

---

### Step 3: แทรกดักตรวจ Margin ใน `Finalprice` Direct Answer (`app.js:3493-3498`)

#### BEFORE Context (`app.js:3493-3498` Verified by Grep):
```javascript
      fpMatches.forEach(function(m, i) {
        _fpReply += (i + 1) + '. ระบบ Solar ' + m.size_kw + ' kW (' + m.phase + ' เฟส)\n';
        _fpReply += '   จำนวนแผง: ' + m.panel_count + ' แผง\n';
        _fpReply += '   ราคาขาย: ฿' + _fpFmt(m.price) + (m.thb_per_w ? ' (' + m.thb_per_w + ' THB/W)' : '') + '\n\n';
      });
      _fpReply += '━━━━━━━━━━━━━━━━━━━━\nข้อมูลตรงจากตารางราคากลาง Finalprice';
```

#### AFTER Replacement:
```javascript
      fpMatches.forEach(function(m, i) {
        _fpReply += (i + 1) + '. ระบบ Solar ' + m.size_kw + ' kW (' + m.phase + ' เฟส)\n';
        _fpReply += '   จำนวนแผง: ' + m.panel_count + ' แผง\n';
        _fpReply += '   ราคาขาย: ฿' + _fpFmt(m.price) + (m.thb_per_w ? ' (' + m.thb_per_w + ' THB/W)' : '') + '\n';
        if (m.raw_row && m.raw_row['กำไร']) {
          var _mRes = _marginGuard.checkMargin(m.raw_row['กำไร'], m.price);
          if (_mRes.isLowMargin && _mRes.warningText) {
            _fpReply += '   ' + _mRes.warningText + '\n';
          }
        }
        _fpReply += '\n';
      });
      _fpReply += '━━━━━━━━━━━━━━━━━━━━\nข้อมูลตรงจากตารางราคากลาง Finalprice';
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-t1-margin-guard
node test-t1.js
```
