# R6 — Electrical Cable & Protection Device Sizing Specification (#16)

**Document Type**: Engineering Specification & Calculation Rules (SPEC ONLY — NO CODE)  
**Target Systems**: Solar PV Inverters (On-Grid / Hybrid 1-Phase & 3-Phase, 3kW – 100kW)  
**Standards Referenced**:  
- **EIT Standard 022013-22** (มาตรฐานการติดตั้งทางไฟฟ้าสำหรับประเทศไทย พ.ศ. 2565 โดย วสท.)  
- **MEA / PEA Solar Grid-Connected Code** (ข้อกำหนดการเชื่อมต่อระบบโครงข่ายไฟฟ้า กฟน. / กฟภ.)  
- **IEC 60364-7-712** (Requirements for special installations or locations - Solar photovoltaic power supply systems)  

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  
**Reviewers Required**: P'Phong & Lead Electrical Engineer  

---

## ⚡ 1. กฎการคำนวณและสูตรทางวิศวกรรมไฟฟ้า (Engineering Formulas)

### 1.1 AC Breaker Sizing (MCB / MCCB)
* **สูตรคำนวณกระแสพิกัดอินเวอร์เตอร์ (Rated Inverter Current $I_{inv}$)**:
  $$\text{1-Phase (220V)}: \quad I_{inv} = \frac{P_{ac} \text{ (W)}}{220 \text{ V} \times \text{PF}}$$
  $$\text{3-Phase (400V)}: \quad I_{inv} = \frac{P_{ac} \text{ (W)}}{\sqrt{3} \times 400 \text{ V} \times \text{PF}}$$
  *(โดยกำหนด Power Factor $\text{PF} = 0.99$)*

* **สูตรคำนวณขนาดพิกัดเบรกเกอร์ ($I_{breaker}$)**:
  $$I_{breaker} \ge I_{inv} \times 1.25 \quad \text{(Continuous Duty Factor 125\%)}$$
  *(เลือกขนาดมาตรฐานขึ้นไปถัดไป: 16A, 20A, 25A, 32A, 40A, 50A, 63A, 80A, 100A, 125A, 160A, 200A, 250A)*

---

### 1.2 AC Cable Sizing & Voltage Drop Limit
* **เกณฑ์ขนาดกระแสพาหะสายไฟ (Cable Ampacity)**:
  $$I_{cable\_capacity} \ge I_{breaker}$$
* **ข้อกำหนดแรงดันตกสูงสุด ($\Delta V$)**:
  $$\text{Voltage Drop } \Delta V \% = \frac{2 \times L \times I_{inv} \times R_{cable}}{V_{system}} \times 100 \le 2.0\%$$
  *(โดย $L$ = ระยะทางสายเมตร, $R_{cable}$ = ความต้านทานสาย $\Omega/\text{m}$ ตามมาตรฐาน IEC 60228)*

---

### 1.3 DC Cable & Protection Sizing
* **ขนาดสายไฟ DC (Solar Cable H1Z2Z2-K / PV1-F)**:
  $$I_{dc\_cable\_capacity} \ge I_{sc\_panel} \times 1.25 \times 1.25 = I_{sc\_panel} \times 1.56$$
  *(ขนาดมาตรฐานบังคับ: 4.0 sq.mm สำหรับกระแส $\le 30\text{A}$, 6.0 sq.mm สำหรับกระแส $> 30\text{A}$ หรือระยะสาย $> 30\text{m}$)*
* **ขนาด Fuse DC (กรณีมี String Combiner / Parallel Strings $\ge 3$)**:
  $$I_{fuse} = I_{n\_panel\_fuse} = 1.5 \times I_{sc\_panel}$$

---

### 1.4 Surge Protective Device (SPD) & Earthing Sizing
* **DC Surge Protector**: Type 2, $U_{cpv} \ge 1.2 \times V_{oc\_max\_string}$ (1000V DC / 1500V DC)
* **AC Surge Protector**: Type 2, 275V AC (1P) / 385V AC (3P), $I_n \ge 20\text{kA}, I_{max} \ge 40\text{kA}$
* **สายดินระบบ (Grounding Cable)**:
  - สายดินแผงและโครงสร้าง (PV Frame / Rail Grounding): THW / THW-f 6.0 sq.mm (สีเขียว-เหลือง)
  - สายดินตู้ควบคุม AC/DC: ไม่เล็กกว่าขนาดสายเฟสหลัก (ขั้นต่ำ 6.0 sq.mm – 35.0 sq.mm)

---

## 📊 2. ตารางตารางมาตรฐานเปรียบเทียบ (Master Reference Matrix 3kW – 100kW)

### (ก) ระบบ 1-Phase (220V AC, 50Hz)

| Inverter Size (kW) | Max Current $I_{inv}$ (A) | Breaker Rating (A) | AC Cable Size (sq.mm) | DC Cable Size (sq.mm) | DC SPD Voltage | Ground Wire (sq.mm) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **3.0 kW** | 13.6 A | **16 A** (MCB 1P) | 2 × 4.0 / 6.0 | 2 × 4.0 | 1000V DC | 6.0 |
| **5.0 kW** | 22.7 A | **32 A** (MCB 1P) | 2 × 6.0 / 10.0 | 2 × 4.0 / 6.0 | 1000V DC | 6.0 |
| **6.0 kW** | 27.2 A | **40 A** (MCB 1P) | 2 × 10.0 | 2 × 4.0 / 6.0 | 1000V DC | 10.0 |
| **8.0 kW** | 36.3 A | **50 A** (MCB 1P) | 2 × 16.0 | 2 × 6.0 | 1000V DC | 16.0 |
| **10.0 kW (1P)** | 45.4 A | **63 A** (MCB 1P) | 2 × 25.0 | 2 × 6.0 | 1000V DC | 16.0 |

---

### (ข) ระบบ 3-Phase (400V AC Line-to-Line, 50Hz)

| Inverter Size (kW) | Max Current $I_{inv}$ (A) | Breaker Rating (A) | AC Cable Size (sq.mm) | DC Cable Size (sq.mm) | DC SPD Voltage | Ground Wire (sq.mm) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **5.0 kW** | 7.6 A | **16 A** (MCB 3P) | 4 × 4.0 | 2 × 4.0 | 1000V DC | 6.0 |
| **10.0 kW** | 15.2 A | **25 A** (MCB 3P) | 4 × 6.0 | 2 × 4.0 / 6.0 | 1000V DC | 6.0 |
| **15.0 kW** | 22.8 A | **32 A** (MCB 3P) | 4 × 10.0 | 2 × 4.0 / 6.0 | 1000V DC | 10.0 |
| **20.0 kW** | 30.4 A | **40 A** (MCB 3P) | 4 × 16.0 | 2 × 6.0 | 1000V DC | 16.0 |
| **25.0 kW** | 38.0 A | **50 A** (MCB 3P) | 4 × 25.0 | 2 × 6.0 | 1000V DC | 16.0 |
| **30.0 kW** | 45.6 A | **63 A** (MCB 3P) | 4 × 25.0 / 35.0 | 2 × 6.0 | 1000V DC | 16.0 |
| **50.0 kW** | 76.0 A | **100 A** (MCCB 3P) | 4 × 50.0 | 2 × 6.0 | 1100V DC | 25.0 |
| **100.0 kW** | 152.0 A | **200 A** (MCCB 3P) | 4 × 120.0 | 2 × 6.0 | 1100V / 1500V DC | 50.0 |

---

## 🔍 3. แนวทางการ Review สำหรับวิศวกรไฟฟ้า (Engineer Verification Checklist)

1. [ ] **ความถูกต้องของคูณพิกัดเบรกเกอร์ (1.25 Factor)**: ตรงตามมาตรฐาน วสท. ข้อ 12.3.4 สำหรับภาระไฟฟ้าต่อเนื่อง
2. [ ] **พิกัดแรงดันตก ($\Delta V \le 2.0\%$)**: สำหรับสายเดินเกิน 30 เมตร ควรคำนวณปรับเพิ่มขนาดสาย AC อีก 1 Step
3. [ ] **มาตรฐานสาย DC H1Z2Z2-K**: ทนแรงดัน 1500V DC ทนรังสี UV และอุณหภูมิ $120^\circ\text{C}$
4. [ ] **การอนุมัติก่อนเขียนโค้ด**: ให้พี่พงและหัวหน้าวิศวกรไฟฟ้าลงนามเห็นชอบสเปกตารางนี้ก่อนเริ่มเขียนโค้ดอัตโนมัติใน Phase 04

---

*เอกสารสเปกวิศวกรรมจัดทำโดย: Nasri Oracle — Right Hand of Ma'at 𓂀*
