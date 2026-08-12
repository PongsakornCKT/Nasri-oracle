# S6 — Wire Installer PDF Bridge Guide (#20)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/installer-pdf-bridge.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:3305` (ในบล็อกคำสั่ง Admin LINE)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **เชื่อมต่อ `generate_installer_pdf.py` ผ่านคำสั่ง LINE**:
   - เพิ่มคำสั่ง LINE Admin `"ใบช่าง <QT/BOM ID>"` (เช่น `"ใบช่าง QT-2026-0812-001"`)
   - เรียกใช้ `generate_installer_pdf.py` ผ่าน Python Bridge เพื่อสร้างเอกสารใบช่างเฉพาะกิจสำหรับทีมติดตั้ง
2. **ACK-First Workflow & Flex Card Delivery**:
   - ตอบกลับทักทายรับทราบทันที (`"⏳ กำลังสร้างเอกสารใบช่าง (Installer Copy)..."`) ก่อนรันกระบวนการสร้าง PDF
   - ส่งลิงก์/Flex Card ดาวน์โหลดไฟล์ PDF ใบช่างลับกลับไปยัง LINE Admin

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/installer-pdf-bridge.js`

```bash
cp deliverables/linebot-s6-wire-installer-pdf/lib/installer-pdf-bridge.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/installer-pdf-bridge.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// S6 (#20): Wire installer PDF generator bridge
var _installerPdfBridge = require('./lib/installer-pdf-bridge');
```

---

### Step 3: แทรกคำสั่ง LINE `"ใบช่าง <id>"` ใน `app.js` (บรรทัด 3305 Verified by Grep)

#### BEFORE Context (`app.js:3305` Verified by Grep):
```javascript
  // View old BOM PDF by name
  if ((lo.indexOf('ดู') >= 0) && (lo.indexOf('bom') >= 0 || lo.indexOf('pdf') >= 0)) {
```

#### AFTER Replacement:
```javascript
  // S6 (#20): LINE Admin command "ใบช่าง <QT/BOM id>"
  if (/^(?:นัด\s*)?ใบช่าง\s+/i.test(lo)) {
    var _instMatch = lo.match(/^(?:นัด\s*)?ใบช่าง\s+(.+)$/i);
    if (_instMatch) {
      var _instId = _instMatch[1].trim();
      await rText(rt, '⏳ กำลังสร้างเอกสารใบช่าง (Installer Copy) สำหรับ ' + _instId + '...');
      var _instRes = _installerPdfBridge.generateInstallerPdfBridge(_instId, {}, [], TMP_DIR);
      if (_instRes.ok) {
        await lReply(rt, [{
          type: 'flex', altText: '📄 ใบช่าง (Installer Copy) — ' + _instId,
          contents: {
            type: 'bubble', size: 'kilo',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🔧 ใบช่าง: ' + _instId, weight: 'bold', size: 'md', color: '#ffffff' }], backgroundColor: '#27ae60', paddingAll: '12px' },
            body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'เอกสารสำหรับทีมช่างติดตั้ง (CONFIDENTIAL — ห้ามส่งให้ลูกค้า)', size: 'xs', color: '#e74c3c', wrap: true }], paddingAll: '12px' },
            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', action: { type: 'uri', label: '📥 ดาวน์โหลด PDF ใบช่าง', uri: _instRes.pdf_url }, style: 'primary', color: '#27ae60' }], paddingAll: '12px' }
          }
        }]);
      } else {
        await rText(rt, '❌ เกิดข้อผิดพลาดในการสร้าง PDF ใบช่าง: ' + _instRes.error);
      }
      return;
    }
  }

  // View old BOM PDF by name
  if ((lo.indexOf('ดู') >= 0) && (lo.indexOf('bom') >= 0 || lo.indexOf('pdf') >= 0)) {
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-s6-wire-installer-pdf
node test-s6.js
```
