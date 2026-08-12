# R5 — Keenoc Mounting Auto-Scale Calculator Guide (#19)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/keenoc-mounting-calculator.js` (ใหม่), `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ต่อยอดการคำนวณชุดยึดหลังคา Keenoc อัตโนมัติ (`Mounting - Keenoc` gid 1345585929)**:
   - อ้างอิงตรรกะเดิมจาก `mcp-bomsolar/server.py:1264-1313` และนำมาสร้างเป็นโมดูล JS สำหรับใช้งานใน `app.js`
2. **สูตรการถอดแบบตามจำนวนแผง (Auto-Scale Formulas)**:
   - **Rail 4200mm**: `1 ท่อน / แผง`
   - **End Clamp**: `2 ชิ้น × จำนวนแผง`
   - **Mid Clamp**: `(จำนวนแผง - 1) × 2 ชิ้น`
   - **Roof Anchor / Hook**: `2 ชิ้น × จำนวนแผง` (เลือกประเภทไดนามิกตามหลังคา: `metal` -> L-Feet, `tile`/ซีแพค -> Tile Hook, `ground`/`carport` -> Ground Mount)
3. **อ่านราคาและชื่อรุ่นจริงจาก Google Sheet**:
   - ค้นหาราคาและชื่อรุ่นสินค้าจริงจากแท็บ `Mounting - Keenoc` หากไม่พบจะ Fallback ใช้ราคาฐานวิศวกรรมชั่วคราว พร้อมติดแท็ก `price_source`

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/keenoc-mounting-calculator.js`

```bash
cp deliverables/linebot-r5-keenoc-autoscale/lib/keenoc-mounting-calculator.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/keenoc-mounting-calculator.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// R5 (#19): Keenoc mounting auto-scale calculator module
var _keenocCalculator = require('./lib/keenoc-mounting-calculator');
var calculateKeenocMounting = _keenocCalculator.calculateKeenocMounting;
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-r5-keenoc-autoscale
node test-r5.js
```
