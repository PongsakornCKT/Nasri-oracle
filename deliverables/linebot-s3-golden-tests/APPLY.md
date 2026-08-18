# S3 — Golden Pytest Suite for 6 Brands Money Formulas Guide

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `tests/test_golden_money_formulas.py` (ใหม่)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **สร้าง Golden Test Suite ล็อกสูตรการเงิน 6 ยี่ห้อ**:
   - ล็อกสูตรคำนวณราคาทุกยี่ห้อ (`ATMOCE`, `Solis`, `Huawei`, `Deye`, `Sigenergy`, `Hoymiles`) × `1P` / `3P`
   - ตรวจจับและล็อกผลลัพธ์ทุกฟิลด์การเงิน (`equipment_total`, `vat_7pct`, `labor`, `bos`, `error_cost`, `crane`, `pea_mea_fee`, `transport`, `sld_fee`, `grand_total`)
2. **กติกาเหล็ก**:
   - **ห้ามแก้ไขสูตรเงินเดิมใน `mcp-bomsolar/server.py:1496-1567`**
   - **ห้ามยิง Network และห้ามใช้ Fixture จริงจาก GVIZ CSV** (ใช้ Mock Deterministic Numbers ป้องกัน Flaky Tests)

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์เทสไปยัง `tests/test_golden_money_formulas.py`

```bash
mkdir -p "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/tests"
cp deliverables/linebot-s3-golden-tests/tests/test_golden_money_formulas.py "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/tests/test_golden_money_formulas.py"
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-s3-golden-tests
pytest tests/test_golden_money_formulas.py -v
```
