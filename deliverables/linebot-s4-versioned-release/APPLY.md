# S4 — Versioned Release & Rollback Script Guide (#S4)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `scripts/qsolar-release.sh` (ใหม่), `package.json`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **สคริปต์บริหารจัดการ Release & Rollback (`scripts/qsolar-release.sh`)**:
   - **`--release`**: สร้างแท็กเวอร์ชัน `qsolar-vYYYYMMDD-HHMM` + สร้างไฟล์ `manifest.sha256` ตรวจสอบความถูกต้องของซอร์สโค้ด + รวบเป็นแพ็กเกจ `bundle.tar.gz`
   - **`--rollback <tag>`**: เตรียมชุดไฟล์เวอร์ชันเก่าใส่ไดเรกทอรี Rollback เพื่อพร้อมอัปโหลดสลับคืนผ่าน FTP
2. **Pin Node.js Engines ใน `package.json`**:
   - กำหนด `"engines": { "node": ">=21 <22" }` ป้องกันความเสี่ยงจากการรันบน Node ต่างเวอร์ชัน
3. **กติกาความปลอดภัย**:
   - **สคริปต์เตรียมไฟล์ในเครื่องเท่านั้น ห้ามยิง FTP จริงขึ้น Live Server โดยไม่ได้รับอนุมัติ**

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกสคริปต์ไปยัง `scripts/qsolar-release.sh`

```bash
mkdir -p "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/scripts"
cp deliverables/linebot-s4-versioned-release/scripts/qsolar-release.sh "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/scripts/qsolar-release.sh"
chmod +x "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/scripts/qsolar-release.sh"
```

---

### Step 2: อัปเดต `package.json` ใน live repo (บรรทัด 15)

```json
  "engines": {
    "node": ">=21 <22"
  }
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-s4-versioned-release
node test-s4.js
```
