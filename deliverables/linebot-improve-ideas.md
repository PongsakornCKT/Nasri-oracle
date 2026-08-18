# QSolar LINE OA Bot & BOM Calculation Improvement Proposals

**Project**: `linebot-nasri` (QSolar LINE OA Bot & BOM Calculation Engine)  
**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 📌 ภาพรวมระบบปัจจุบัน (System Context)

* **Architecture**: Nasri LINE OA Bot (`app.js` Node 21 + Passenger บน Plesk `ai.enervia.co.th`) ➔ `lib/python-bridge` ➔ `mcp-qsolar` (Quote PDF) + `mcp-bomsolar` (BOM PDF) ➔ `solar_catalog` (L0-L3 cache + Circuit Breaker) ➔ Google Sheets ผ่าน **gviz CSV (Public, Read-Only)**
* **Master Spreadsheet ID**: `1ubrfga3m0uiOf68MGQRApAdnhU8oby6nYKtfzirpn9Y`
* **Target Pricing Tab**: `gid=1639151553` ("💰 ATMOCE ราคาขายระบบ (System Package)" — 47 แถว รวมคอลัมน์ เฟส, ขนาด(W), จำนวนแผง, ต้นทุนรวม, ราคาขาย, กำไร, THB/W)

---

## 📑 หมวดที่ 1: การใช้ข้อมูลชีตราคากลางให้คุ้มค่า (Sheet Data Maximization)

### 1. Margin Guard & Minimum Profit Threshold Alert
* **ทำอะไร**: นำคอลัมน์ "กำไร" (Profit) และ "ต้นทุนรวม" (Total Cost) ใน tab `Finalprice` มาคำนวณ % Profit Margin (`Profit / Selling Price * 100`) และแจ้งเตือนทีมขายทาง LINE/Console หากเสนอราคาที่ Profit Margin ต่ำกว่าเกณฑ์ขั้นต่ำ (เช่น < 15%)
* **คุ้มยังไง**: ป้องกันเซลส์เสนอราคาขาดทุนหรือมาร์จิ้นต่ำเกินไปโดยไม่รู้ตัว ป้องกันการตั้งราคาผิดพลาดในหน้างานจริง
* **Effort**: `S` (Small — เพิ่มฟังก์ชัน Validation ความยาว ~15 บรรทัดใน Python Bridge)
* **เสี่ยงอะไร**: หากสูตรใน Sheet เปลี่ยนชื่อคอลัมน์ ต้องมี Header Fallback Parser รองรับ

### 2. Price per Watt (THB/W) Benchmark & Tier Tagging
* **ทำอะไร**: อ่านคอลัมน์ `THB/W` จาก tab `Finalprice` มาเปรียบเทียบกับเกณฑ์มาตรฐานตลาด (เช่น 1-5kW @ ~28-35 THB/W, 10-20kW @ ~20-25 THB/W) และแปะป้ายระดับราคา (Standard / Premium / Economy) ในผลลัพธ์ของ Bot
* **คุ้มยังไง**: ให้ข้อมูลเชิงเปรียบเทียบแก่ลูกค้าได้ทันทีใน LINE ช่วยเซลส์ปิดการขายเมื่อลูกค้ารู้สึกว่าราคาคุ้มค่า per Watt
* **Effort**: `S` (Small — อ่านคอลัมน์ที่มีอยู่แล้วใน gviz CSV)
* **เสี่ยงอะไร**: ลูกค้าอาจสับสนหากไม่เข้าใจว่า THB/W ลดลงตามขนาดระบบ (Economy of Scale)

### 3. Multi-Brand System Price Comparison Matrix
* **ทำอะไร**: เมื่อผู้ใช้สอบถามราคาระบบขนาด X kW (เช่น 10kW 3-Phase) Bot จะอ่านราคาจากทุก Inverter Tabs (`ATMOCE`, `Huawei`, `Solis`, `Sigenergy`) แล้วสร้าง Flex Message เปรียบเทียบ 3 ระดับราคา (Economy / Mid-Tier / Premium) ในคำตอบเดียว
* **คุ้มยังไง**: เพิ่มโอกาสในการเสนอขาย (Upsell/Cross-sell) โดยลูกค้าเห็นตัวเลือกเปรียบเทียบ 3 แบรนด์ทันที ไม่ต้องสอบถามวนซ้ำ
* **Effort**: `M` (Medium — จัดรูปแบบ Flex Message Carousel ใน `app.js`)
* **เสี่ยงอะไร**: ข้อความใน LINE อาจยาวเกินไปหากไม่มีการบีบอัด Card Layout

### 4. Dynamic Labor & Accessory Surcharge Calculator
* **ทำอะไร**: นำข้อมูลจาก tab `Labor & Fees` (gid=1264003568) และ `Combiner Box & Others` มาคำนวณบวกเพิ่มแบบไดนามิกตามเงื่อนไขสถานที่ (เช่น หลังคาซีแพค, หลังคาเมทัลชีท, ความสูงอาคาร > 2 ชั้น)
* **คุ้มยังไง**: ลดการประมาณการค่าแรงแบบเหมาเดา สะท้อนต้นทุนจริงในใบเสนอราคาชั่วคราวอย่างแม่นยำ
* **Effort**: `M` (Medium — เพิ่ม Lookup Table ใน `sheets_client.py`)
* **เสี่ยงอะไร**: หากผู้ใช้ไม่เลือกประเภทหลังคา ต้องกำหนดค่า Default เป็นหลังคาเมทัลชีท

### 5. Sheet Freshness Stale Alert & Background Pre-fetcher
* **ทำอะไร**: เพิ่มระบบตรวจจับอายุ L2/L3 Cache ของ Sheet (หาก Cache เก่าเกิน 4 ชั่วโมง หรือพบว่า Sheet เปลี่ยนแปลง) ให้ทำ Background Pre-fetch และแจ้งเตือนเข้า LINE Admin กลุ่มพัฒนาเมื่อตรวจพบราคาพุ่งข้ามเกณฑ์ (Price Spike > 10%)
* **คุ้มยังไง**: มั่นใจได้ว่าราคาขายใน LINE Bot ตรงกับเล่มราคาหลักเสมอ ไม่เสี่ยงเสนอราคาเก่าที่ตารางถูกปรับไปแล้ว
* **Effort**: `S` (Small — ตรวจสอบ `mtime` ของ L2 Cache)
* **เสี่ยงอะไร**: การยิง HTTP CSV จาก Google Sheets ถ้ารีเฟรชถี่เกินไปอาจถูก Google Rate Limit (ป้องกันด้วย Circuit Breaker)

### 6. Analytics & Inquiry Demand Audit Logging
* **ทำอะไร**: บันทึก Log ทุกคำถาม/คำขอแพ็กเกจราคาใน LINE Bot ลง SQLite / Agora Event (`topic: "qsolar-inquiry"`) สรุปแพ็กเกจที่ลูกค้าถามบ่อยที่สุด (เช่น 5kW 1-Phase vs 10kW 3-Phase)
* **คุ้มยังไง**: ทีมการตลาดและจัดซื้อเห็น Insight จริงว่าแพ็กเกจไหนมี Demand สูง เพื่อเตรียมสต็อกแผง/อินเวอร์เตอร์ให้ตรงเป้า
* **Effort**: `S` (Small — บันทึก Event สั้นๆ ลง JSONL)
* **เสี่ยงอะไร**: ต้องไม่เก็บข้อมูลส่วนบุคคล (PDPA) เก็บเฉพาะแพ็กเกจและแบรนด์ที่สอบถาม

---

## 🛠️ หมวดที่ 2: การปรับปรุงการคำนวณ BOM (BOM Calculation & Architecture)

### 7. Unified Component Schema (`qsolar` ↔ `bomsolar`)
* **ทำอะไร**: ยุบรวมการดึงข้อมูลและคำนวณรายการอุปกรณ์ระหว่าง `mcp-qsolar` (ออกใบเสนอราคา) และ `mcp-bomsolar` (ออกถอดแบบ BOM) ให้ใช้ `solar_catalog` ร่วมกัน 100% ปราศจาก Logic ซ้ำซ้อน
* **คุ้มยังไง**: ป้องกันการหลุดของรายการอุปกรณ์ระหว่างใบเสนอราคากับ BOM (เช่น ใน Quote มี Optimizer แต่ใน BOM ลืมถอด)
* **Effort**: `M` (Medium — Refactor สคริปต์ Python ให้เรียกใช้ `solar_catalog` เดียวกัน)
* **เสี่ยงอะไร**: ต้องทดสอบ regression ทั้งสอง MCP Server หลังการ refactor

### 8. Automated Cable & Protection Sizing Rules Engine
* **ทำอะไร**: นำพารามิเตอร์ระบบ (ขนาด Inverter kW, Panel Isc/Voc, ระยะทางสาย) คำนวณขนาดสาย DC (4/6 sq.mm), สาย AC, AC Breaker (A), และ DC Surge Protector จากตาราง `Cables` และ `Combiner Box` แบบไดนามิก แทนการ Hardcode ขนาดสาย/เบรกเกอร์
* **คุ้มยังไง**: ถอดแบบ BOM ถูกต้องตามมาตรฐานวิศวกรรมการไฟฟ้า (MEA/PEA) ไม่เสี่ยงถอดสายเล็กเกินไปจนเกิดความร้อนสะสม
* **Effort**: `M` (Medium — เขียนสูตรวิศวกรรมคำนวณกระแสและขนาดเบรกเกอร์)
* **เสี่ยงอะไร**: กรณีระยะสายยาวพิเศษ (> 50 เมตร) ต้องมีสูตรคำนวณ Voltage Drop (VD < 2%)

### 9. Deye & Hybrid Battery Storage Unit-Price Trap Guard
* **ทำอะไร**: เพิ่มด่านตรวจจับราคา Deye Inverter / Battery (แก้ปัญหา Unit-Price Trap ที่ Deye ราคาอินเวอร์เตอร์แบบ Hybrid ไม่รวมแบตเตอรี่ หรือแสดงราคาต่อ kWh) โดยระบุการจับคู่ชุดแบตเตอรี่พ่วงแบบบังคับ
* **คุ้มยังไง**: ป้องกันการออก BOM/Quote แบรนด์ Deye ที่เสนอราคาอินเวอร์เตอร์ Hybrid แต่ลืมคำนวณแบตเตอรี่ ทำให้ต้นทุนจริงบานปลาย
* **Effort**: `S` (Small — เพิ่ม Validation Rule สำหรับแบรนด์ Deye)
* **เสี่ยงอะไร**: ต้องคอยอัปเดต Mapping รุ่นแบตเตอรี่ที่รองรับกับ Deye

### 10. Robust Header Drift & Column Index Fault-Tolerance Parser
* **ทำอะไร**: ปรับปรุง Parser อ่าน CSV จาก Google Sheets ใน `sheets_client.py` ให้ใช้ Fuzzy Header Matching (เช่น ไม่สนใจช่องว่าง, ตัวพิมพ์เล็กใหญ่, สัญลักษณ์ `💰` หรือ emoji)
* **คุ้มยังไง**: แม้ทีมงานจะไปเพิ่ม/ลดคอลัมน์ หรือเปลี่ยนชื่อหัวตารางใน Google Sheet เล่มหลัก ระบบ Bot ก็จะไม่พังเงียบ (Header Drift Proof)
* **Effort**: `S` (Small — Regex matching สำหรับชื่อคอลัมน์)
* **เสี่ยงอะไร**: ต้องเขียน Unit Test ครอบคลุมกรณี Header เปลี่ยนตำแหน่ง

### 11. Keenoc Mounting Structure Auto-Scale Sizing
* **ทำอะไร**: อ่านตาราง `Mounting - Keenoc` (gid=1345585929) คำนวณจำนวน L-Feet, Mid Clamp, End Clamp, และ Rail ตามจำนวนแผงและประเภทการติดตั้งหลังคา (Roof / Ground / Carport)
* **คุ้มยังไง**: ถอดแบบชุดยึดหลังคาถูกต้องครบถ้วน ช่างติดตั้งสามารถนำ BOM ไปเบิกของหน้างานได้ทันทีโดยของไม่ขาด
* **Effort**: `M` (Medium — คำนวณจำนวน Clamp = (N_panels - 1) * 2)
* **เสี่ยงอะไร**: หลังคาประเภทซีแพคต้องการ L-Feet แบบเฉพาะ (Hook) ต้องมีตัวแปรแยกประเภทกระเบื้อง

### 12. Automated Vitest / Pytest Regression Suite for BOM Accuracy
* **ทำอะไร**: สร้างชุดเทสอบอัตโนมัติ (Automated Test Suite) ใน `tests/` จำลองการคำนวณ BOM และ Quote 10 แพ็กเกจมาตรฐาน (1kW - 120kW ทั้ง 1-Phase และ 3-Phase) เทียบกับ Expected PDF Output
* **คุ้มยังไง**: มั่นใจได้ว่าทุกครั้งที่มีการแก้โค้ดหรือเปลี่ยนราคาใน Google Sheet การคำนวณ BOM และ Quote จะยังคงถูกต้อง 100% ไม่เกิด Regression
* **Effort**: `M` (Medium — เขียน Pytest testsuite ใน `solar_catalog/tests/`)
* **เสี่ยงอะไร**: ต้องคอยอัปเดต Test Snapshots เมื่อราคาฐานใน Sheet มีการปรับปรุงประจำปี

---

*เสนอโดย: Nasri Oracle — Right Hand of Ma'at 𓂀*  
*บันทึกเพื่อบรรจุลง Oracle Tracker & PROJECT.md ต่อไป*
