# R6 — Electrical Sizing Specification Review Guide (#16)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target File**: `deliverables/linebot-r6-cable-protection-spec/SPEC-cable-protection-sizing.md`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปการส่งมอบ (SPEC ONLY — NO CODE)

ตามกติกาความปลอดภัยทางไฟฟ้าและข้อสั่งการของพี่พง งานชิ้นนี้เป็นการจัดทำ **เอกสารสเปกวิศวกรรมไฟฟ้าแบบละเอียด (Specification & Standard Reference Matrix)** โดย **ไม่มีการเขียนโค้ดซอฟต์แวร์** ในรอบนี้ เพื่อรอการรีวิวและอนุมัติจากพี่พงและวิศวกรไฟฟ้าก่อน

---

## 📋 สรุปหัวข้อสำคัญในเอกสารสเปก

1. **สูตรวิศวกรรมมาตรฐาน (EIT / MEA / PEA / IEC 60364-7-712)**:
   - การคิดพิกัดเบรกเกอร์ AC ($I_{breaker} \ge I_{inv} \times 1.25$)
   - การคิดพิกัดสายไฟ DC ($I_{dc\_cable} \ge I_{sc} \times 1.56$)
   - ข้อกำหนดการคุมแรงดันตก ($\Delta V \le 2.0\%$)
2. **ตารางมาตรฐานพิกัดสายและเบรกเกอร์ (Master Reference Matrix)**:
   - ครอบคลุมระบบ 1-Phase (3kW, 5kW, 6kW, 8kW, 10kW)
   - ครอบคลุมระบบ 3-Phase (5kW, 10kW, 15kW, 20kW, 25kW, 30kW, 50kW, 100kW)
   - ระบุขนาด MCB/MCCB, สาย AC, สาย DC, SPD และสายดิน (Ground Wire) ชัดเจนทุกขนาด

---

## 📋 ขั้นตอนการรีวิวและอนุมัติ (Review & Sign-Off)

1. ตรวจสอบเอกสารสเปกฉบับเต็มได้ที่ [`deliverables/linebot-r6-cable-protection-spec/SPEC-cable-protection-sizing.md`](file:///mnt/c/Users/pO-Ch/Documents/GitHub/nasri-oracle/deliverables/linebot-r6-cable-protection-spec/SPEC-cable-protection-sizing.md)
2. เมื่อพี่พงและวิศวกรไฟฟ้าสอบทานตารางและสูตรคำนวณเรียบร้อยแล้ว จะนำตารางสเปกนี้ไปพัฒนาเป็น Rules Engine อัตโนมัติใน Phase 04 ต่อไปครับ
