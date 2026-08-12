# T3 — THB/W Tier Tag Configurator Guide (#5)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/thbw-tier-config.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:3493-3498` (ในบล็อกตอบราคารวมระบบ Finalprice)  
**Business Decision (พี่พงเคาะ A4)**: THB/W Tier เกณฑ์ยังไม่เคาะ ให้ใช้ Config object ชั่วคราว (1-5kW @28-35, 10-20kW @20-25)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **โมดูล Config ระดับราคา THB/W (`thbw-tier-config.js`)**:
   - จัดหมวดหมู่ระดับราคา THB/W ออกเป็นป้าย `🟢 Economy`, `🔵 Standard`, `⭐ Premium`
   - กำหนดเกณฑ์แยกตามขนาดระบบ (1-5kW, 10-20kW, >20kW) ในรูปแบบ Config Object ที่ปรับเปลี่ยนได้ง่ายตามข้อสั่งการพี่พง
2. **แสดงผลป้าย Tier ในคำตอบ `Finalprice`**:
   - แนบป้าย Tier ท้าย THB/W ในคำตอบแพ็กเกจระบบ เช่น ` (25.8 THB/W 🟢 Economy)`

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/thbw-tier-config.js`

```bash
cp deliverables/linebot-t3-thbw-tier-config/lib/thbw-tier-config.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/thbw-tier-config.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// T3 (#5): THB/W tier config module (P'Phong A4 decision: configurable tier thresholds)
var _thbwTierConfig = require('./lib/thbw-tier-config');
```

---

### Step 3: แทรกป้าย Tier ในคำตอบ `Finalprice` (`app.js:3496`)

#### BEFORE Context (`app.js:3496` Verified by Grep):
```javascript
        _fpReply += '   ราคาขาย: ฿' + _fpFmt(m.price) + (m.thb_per_w ? ' (' + m.thb_per_w + ' THB/W)' : '') + '\n';
```

#### AFTER Replacement:
```javascript
        var _tierInfo = m.thb_per_w ? _thbwTierConfig.getThbPerWTier(m.thb_per_w, m.size_kw) : null;
        var _tierBadge = _tierInfo ? ' ' + _tierInfo.badge : '';
        _fpReply += '   ราคาขาย: ฿' + _fpFmt(m.price) + (m.thb_per_w ? ' (' + m.thb_per_w + ' THB/W' + _tierBadge + ')' : '') + '\n';
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-t3-thbw-tier-config
node test-t3.js
```
