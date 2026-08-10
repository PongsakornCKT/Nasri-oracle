---
name: enervia-domain
description: >-
  Business domain knowledge for Enervia (solar company): products, systems,
  data sources, deploy pipelines, and hard-won traps. Use before touching any
  Enervia work — survey PWA, leadfollow WP plugin, quotes, payroll, LINE bots,
  QSolar/BOMSolar.
---

# Enervia Domain — ความรู้ธุรกิจ + ระบบ

Enervia = บริษัทติดตั้งโซลาร์เซลล์ของพี่พง. ระบบไอทีทั้งหมดหมุนรอบ workflow:
**lead → survey → ใบเสนอราคา (quote) → ติดตั้ง → commissioning → payroll**

## ระบบหลัก

### 1. survey.enervia (สำคัญสุด — LIVE PRODUCTION ใช้งานจริงทุกวัน)
- PWA + WordPress theme + plugin `leadfollow-core` — repo: `PongsakornCKT/enervia-survey` (GitHub, Project board #9)
- ฟีเจอร์: survey หน้างาน, quote builder, ใบส่งของ, contract PDF, crew check-in/payroll, lead management, doc share links
- **แตะอะไรต้องแจ้ง/ขอพี่พงก่อน** — คนใช้งานจริงอยู่ ห้าม deploy โดยไม่ได้รับอนุมัติ; อนุมัติ deploy ผูกกับ PR เดียว ไม่ carry over ไป PR ถัดไป
- Deploy: FTPS ผ่าน script `deploy-survey-enervia.sh` — **merge เข้า main ก่อน deploy เสมอ**, byte-verify หลังอัพ, เช็ค live-vs-main ก่อน (live เคยล้ำหน้า repo)
- สิทธิ์: User List = admin เท่านั้น (admin 3 คน), เงิน commission ของ sale ใครของคนนั้น, crew เห็นแบบ install_limited
- PDF: gen ผ่าน html2pdf — กับดักเพียบ (crop, ฟอนต์ไทย, มือถือ) — ถาม pa ก่อนแตะ template PDF

### 2. leadfollow backend (WP plugin ฝั่ง server)
- โค้ดจริงอยู่บน server (server-only ไม่อยู่ git เต็มๆ) — mirror ไว้ที่ `pa-Oracle v2/oracle-studio/leadfollow-server/` (mirror ตกรุ่นได้ ห้ามเชื่อ 100%)
- **ALTER TABLE ไม่ได้** บน host นี้ → ข้อมูลใหม่เก็บใน `wp_options` แทน (pattern ที่ใช้ประจำ)
- WP timezone = UTC เสมอ — เวลาไทยต้อง +7 เอง (บั๊กซ้ำหลายรอบ)
- REST API: GET ต้องส่ง `X-WP-Nonce` (ใช้ nonce จาก `/me` เท่านั้น)

### 3. QSolar / BOMSolar (LINE bot + ใบเสนอ/BOM)
- MCP servers python: `mcp-qsolar`, `mcp-bomsolar` — RUNBOOK ใน `ψ/active/qsolar`
- **เช็ค RUNBOOK ก่อนแตะเสมอ** — LINE bot production มีลูกค้าใช้

### 4. ราคากลาง + data source
- **ข้อมูลจริงอยู่ Google Sheets** (GVIZ อ่าน + GAS เขียน) ไม่ใช่ DB — installs, reviews, ชีตราคากลาง
- GAS deploy = manual เท่านั้น (กดในหน้าเว็บ) — แก้โค้ด GAS แล้วต้องบอกพี่พง deploy
- **ห้ามยิง GAS /exec ทดสอบ** — มันเขียนข้อมูลจริง
- ชีตราคากลางเพิ่งย้ายเล่ม (ส.ค. 2026) — ห้ามสร้าง fixture จาก GVIZ CSV เก่า

## กติกาเงิน (lock แล้ว — ห้ามเปลี่ยนโดยไม่ถามพี่พง)

- Commission คิด**รายใบ** (per-quote) ไม่ใช่ per-project
- Payroll: office = เงินเดือน + OT | ช่างติดตั้ง = per-watt
- Check-in: geofence เตือนแต่ไม่บล็อก
- กติกาเงินทุกตัวอยู่ในหมวด "ถามก่อนเขียน" เสมอ

## กับดักที่เจ็บมาแล้ว (อ่านก่อนแตะระบบนั้นๆ)

1. **Live ≠ git** — เช็ค live ก่อนทุกครั้ง (ทั้ง survey theme และ leadfollow plugin)
2. เมนู/หน้าใหม่ใน survey = แก้ 4 จุด รวม REST capability — ลืมจุดเดียวเมนูหาย/403
3. `wf_pages` มี hierarchical allow-list + เคยมี clamp 0-6 บล็อกหน้าใหม่
4. Theme CSS ต้องใช้ vars canonical (`--bg-card`, `--color-text`) — ตั้งชื่อเองพังใน light mode
5. inline style สีตรงๆ (`#6b7280`) จะไหลเข้า PDF ใบเสนอ — ใช้ vars เสมอ
6. `templates/survey.php` เป็น stub ต้อง require root — เคยแก้ผิดไฟล์
7. Windows→WSL: ระวัง CRLF ตอนแก้ไฟล์ข้ามฝั่ง — เช็ค `git diff --stat` ว่าไม่บวมผิดปกติ
8. display_name ผูกกับสิทธิ์ crew — emoji ในชื่อทำสิทธิ์พังเงียบ

## Enervia local services (สำหรับเทส)

- Enervia API: `http://localhost:4201/health` | LINE bot: `:4202` (ต้องมี `~/.enervia/.env`)
- อย่าสับสนกับ production — local คือ mirror สำหรับ dev เท่านั้น
