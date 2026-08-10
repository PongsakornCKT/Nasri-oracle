---
name: testing-guide
description: >-
  How to write and run tests the way this fleet actually does: vitest zero-dep
  patterns, PHPUnit with fake wpdb, the 5-stage pipeline, PDF harness, smoke
  probes, and production-safety rules. Use whenever writing code (every impl
  needs a test) or verifying someone else's DONE.
---

# Testing Guide — เขียนเทสแบบที่ fleet ใช้จริง

กติกาเหล็ก: **ทุก impl ต้องมี test** + **DONE ที่ไม่มีผลเทสแนบ = ยังไม่ verified**

## Pipeline 5 ชั้น (เรียงถูก-ผิดตามนี้)

```
unit → runtime → E2E → baseline → integration
```
1. **Unit** — ฟังก์ชันที่แก้ + happy path ข้างเคียง (เร็วสุด รันก่อน)
2. **Runtime** — รันจริง: curl endpoint / เปิดหน้า / รัน script — "โค้ดถูก" ≠ "ระบบทำงาน"
3. **E2E** — เดิน flow ผู้ใช้จริงจนจบ (สร้าง entity test แยก — ห้ามใช้ข้อมูลลูกค้าจริง)
4. **Baseline** — เทียบกับพฤติกรรมก่อนแก้: ของเดิมที่ต้องไม่เปลี่ยนยังเหมือนเดิมมั้ย
5. **Integration** — ระบบข้างเคียงที่ consume ของเรายังทำงานมั้ย

## JavaScript: vitest + zero-dep helpers pattern

Pattern ที่พิสูจน์แล้ว (Lead Detail redesign): **แยก logic เป็น helpers ล้วนๆ ไม่มี dependency** → เทสได้โดยไม่ต้อง mock DOM/network:
- Repo จริง: `oracle-studio/leadfollow-server/tests-js/` — `survey.test.mjs` + `fixture.mjs` + `vitest.config.mjs`
- โครงเทส: fixture เป็นข้อมูลจริงตัดมา (ไม่ใช่ข้อมูลมโน) → เทส pure function → assert ครอบ edge (ว่าง, null, ไทย, จำนวนเงิน)
- รัน: `rtk vitest run` (แสดง failures only)
- HTML แอปเก่าที่ logic ฝังใน `<script>`: ดึงฟังก์ชันออกมาเป็นไฟล์ helpers ก่อน (surgical) แล้วเทสไฟล์นั้น

## PHP: PHPUnit + fake wpdb pattern

WP plugin เทสโดยไม่มี WordPress จริง: **fake `$wpdb`** — repo จริง: `oracle-studio/leadfollow-server/tests/class-lf-fake-wpdb.php` + `SurveyOwnershipTest.php`, `DashboardStatsTest.php`
- PHP เครื่องนี้: `C:\xampp\php\php.exe` (ไม่อยู่ PATH); ไม่มี composer — ใช้ phpunit.phar หรืออ่านผล CI
- **CI enervia-survey มีเทสแดงค้างเดิม 10 ตัว** (DashboardStats×6, SurveyStatusEnum×2, WfPagesClamp×2) — วิธีอ่าน: เทียบ `Tests:/Failures:` ของ base vs PR + ดูรายชื่อ fail ว่าเปลี่ยนมั้ย. แดง 10 เดิม = ผ่าน, แดงตัวใหม่ = พัง
- เทส REST: assert ทั้ง status code และ shape ของ payload (เคส payload shape สอนแล้วว่า shape สำคัญกว่า status)

## Smoke tests + probes (runtime layer)

```bash
# Route มีจริงมั้ย (ไม่ต้อง login):
curl -s -o /dev/null -w '%{http_code}' <url>   # 401/403 = มี, 404 = ไม่มี, 500 = พัง
# หน้า login-gated: 302 = ปกติ
# Service: curl :4100/health ต้องได้ {"status":"ok"}
```
- Probe = เทสชั่วคราวที่วัดสถานะจริง (diagnostic endpoint, `visible_count`, enumerate CSS) — ใช้เมื่อแก้ 2 รอบไม่หาย (2-strike rule)
- Assertion ฝังในหน้า: pattern `window.__auditPagination()` (PDF) — เขียน assertion ให้ QA เรียกได้ headless แล้วมันจะจับบั๊กที่ตาคนมองไม่เห็น

## PDF testing (มี harness สำเร็จรูป)

`pa-Oracle v2/temp/pdf-test/run.mjs` — Playwright matrix: PC-1920 / iPhone13 / iPad / Pixel7, กดปุ่ม PDF, เซฟไฟล์ → เปิด PDF ตรวจจริง. **เทสจอเดียวไม่มีวันเห็นบั๊ก mobile** (เคส media query clone)

## กติกาความปลอดภัยเทส

1. **ห้ามใช้ record ลูกค้าจริงเทสบน production** — สร้าง entity test → เทส → ลบ. Sink append-only (Google Sheet) ลบไม่ได้ = ห้ามยิงเด็ดขาด (ห้ามยิง GAS /exec)
2. เทสเขียวหมดแต่อาการยังอยู่ → audit เครื่องมือเทสก่อน (เทสอาจวัดผิดที่)
3. เทสของ agent อื่นที่ report ว่าผ่าน → รันซ้ำเองก่อนเชื่อ ถ้าผลนั้นเป็นฐานการตัดสินใจ
4. แก้เทสเก่าให้ผ่าน ≠ แก้บั๊ก — เทสเก่า assert พฤติกรรมเดิมที่ live เปลี่ยนไปแล้ว (เคส wf_pages) ให้เช็คว่า live คือ truth แล้วอัพเดตเทสตาม ไม่ใช่บิดโค้ดให้เทสเก่าผ่าน

## เขียนเทสให้บั๊กที่เพิ่งแก้ (ทุกครั้ง)

Regression test ต้อง: (ก) fail ก่อนแก้ (พิสูจน์ว่าจับบั๊กได้จริง) (ข) pass หลังแก้ (ค) ครอบสาเหตุรองที่เจอระหว่างทาง + happy path เดิม — สาเหตุที่พูดผ่านๆ คือ regression site ถัดไป
