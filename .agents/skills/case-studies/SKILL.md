---
name: case-studies
description: >-
  Real incident case studies from pa's history: symptom, root cause, fix,
  and the transferable lesson. Use to pattern-match a new bug against past
  ones, or to learn how debugging actually unfolds here.
---

# Case Studies — เคสจริง 10 เคส (อาการ → สาเหตุ → แก้ → บทเรียน)

อ่านแบบหมอดูเคสเก่า: เจอบั๊กใหม่ให้ pattern-match กับพวกนี้ก่อน — ครึ่งหนึ่งของบั๊ก "ใหม่" คือเคสเก่าหน้ากากใหม่

## เคส 1: หน้า 4 หน้าโหลดไม่ขึ้น แต่หน้าที่ 5 ปกติ (nonce GET)
- อาการ: รายการสำรวจ/รีวิว/รายงานว่างเปล่า+403 หลัง deploy API scoping ใหม่
- สาเหตุ: WP REST cookie auth ไม่ส่ง `X-WP-Nonce` = user 0 → ownership scope กรองทิ้งหมด. โค้ดมี GET cookie-only 4 จุด — จุดที่ 5 เคยแก้แล้วแต่ **sweep ไม่ครบ**
- แถม: nonce จาก `POST /auth/login` verify ไม่ผ่าน (mint ตอน cookie ยังไม่อยู่ใน $_COOKIE) — ใช้ nonce จาก `GET /me` เท่านั้น
- **บทเรียน: แก้ pattern ผิด 1 จุด → grep หา pattern เดียวกันทั้งไฟล์ทันที** อย่าแก้จุดที่ถูก report แล้วปิดงาน

## เคส 2: deploy สำเร็จแต่หน้าไม่เปลี่ยน (dup template)
- อาการ: PR อัพ 5 เมนูสำเร็จ ทุกอย่างเขียว แต่หน้า live โชว์ 4 เมนูเดิม
- สาเหตุ: server มี `templates/survey.php` ซ้ำกับ root `survey.php` (Template Name เดียวกัน) — WP page ผูกกับ templates/ ซึ่ง**ไม่อยู่ใน git** deploy กี่รอบก็ไม่โดน
- **บทเรียน: "deploy สำเร็จแต่ไม่เปลี่ยน" → อย่าโทษ cache ก่อน — FTPS list หาไฟล์ server-only/template ซ้ำ เทียบ mtime**

## เคส 3: การ์ดดำอ่านไม่ออกใน light theme (CSS vars มโน)
- สาเหตุ: template ใช้ชื่อ var ที่ไม่มีจริง (`--color-card`, `--color-surface`) → fallback ดำ hardcode
- Canonical จริง: `--bg-card`, `--bg-body`, `--color-text`, `--color-muted`, `--color-border` (+ light override ใน `html[data-theme="light"]`)
- **บทเรียน: ห้ามคิดชื่อ var/field/route เอง — เปิดของจริง (app.css บน live) ก่อนใช้ + เทสทั้ง light และ dark**

## เคส 4: dashboard save แล้ว live parse ไม่ได้ (payload shape)
- สาเหตุ: โค้ดใหม่ map payload เป็นโครง structured ตาม mirror — แต่ **live รับ `{fields:{Thai keys}}`** แบบที่ PWA ส่งจริง. Mirror นำหน้า live คนละ shape
- **บทเรียน: shape ที่ PWA/client เก่าใช้จริงบน live = source of truth ไม่ใช่ mirror/เอกสาร**

## เคส 5: ช่างมองไม่เห็น record ทั้งที่ชื่ออยู่บนการ์ด (join key ปนเปื้อน)
- สาเหตุ: `display_name` = `นะ (Nawadol) 🎸` แต่ DB เก็บ `นะ (Nawadol)` — **emoji ในชื่อทำ join พังเงียบ** เพราะชื่อทีมมาจากชีต แต่สิทธิ์มาจาก DB (สองแหล่งไม่ผูกกัน)
- แก้: ลบ emoji → เห็นทันที (verify ด้วย probe `visible_count` 1→2)
- **บทเรียน: string ที่เป็น join key ห้ามมีของตกแต่ง + ระบบที่การ์ดกับสิทธิ์อ่านคนละแหล่ง = บั๊กเชิงออกแบบที่รอวันระเบิด**

## เคส 6: รูปอัพเดทหายทั้ง batch แต่ alert บอกสำเร็จ (GAS dedup)
- สาเหตุ: `saveImage_` dedup ด้วยชื่อไฟล์ — handler ใหม่ตั้งชื่อนับ (n) เริ่ม 1 ใหม่ทุกรอบ → ชนชื่อเดิม → GAS คืน URL ไฟล์เก่า **ทิ้งรูปใหม่เงียบ**. ซ้ำด้วย client ยิง no-cors alert สำเร็จเสมอ
- **บทเรียน: ชื่อไฟล์ generated ต้องมี timestamp + ห้ามเชื่อ alert ฝั่ง client — verify ที่ปลายทางจริง (ชีต, นับ unique id)**

## เคส 7: แก้ panel_count แล้ว PDF ยังผิด (แก้ 1 ใน 3 จุด)
- สาเหตุ: `_build_items` แก้แล้ว แต่ `_summary_bar` มีสูตร**คำนวณของตัวเองซ้ำอีกที่** — ship 2 commits ต่างจุดสำหรับบั๊กเดียว
- **บทเรียน: หลังแก้ logic ตัวแปรไหน → `grep -n "<symbol>"` ทั้งไฟล์/module ทุก hit ต้องตัดสินว่า "ยังถูกภายใต้ semantics ใหม่มั้ย" ใน commit เดียวกัน (10 วินาที ประหยัด 2 deploy)**

## เคส 8: มือถือทุกเครื่องโหลดแอปไม่ขึ้น หลัง deploy ที่ "ไม่เกี่ยว" (live-ahead)
- สาเหตุ: CI mirror deploy จาก main ทับ live ที่มี hot-deploy ค้าง (PR ยังไม่ merge) → route `/sw.js` หาย → service worker เก่าอัพเดตไม่ได้
- **บทเรียน: mirror ไม่มี --delete กัน "ไฟล์หาย" แต่ไม่กัน "ไฟล์ถอยเวอร์ชัน" — hot-deploy แล้วต้อง merge เข้า main ทันที ไม่งั้นระเบิดเวลา**

## เคส 9: PDF จากมือถือหน้าเลื่อน จาก desktop ปกติ (media query clone)
- สาเหตุ: เอกสารมี `@media (max-width:820px)` — clone ที่วัด pagination เป็น layout มือถือ แต่ html2canvas วาดที่ 794px = **วัดคนละ layout กับที่วาด**
- แก้: คลาส `.pdfwrap` ล็อก layout A4 ทุก viewport (ประกาศหลัง media query + !important) + assertion `window.__auditPagination()` ต้องคืน list ว่าง
- **บทเรียน: เทสจอเดียวไม่มีวันเห็น — เคสหลักของผู้ใช้จริง (ช่างกดจากมือถือ) ต้องอยู่ใน test matrix + สร้าง assertion ให้ QA เรียกได้ headless**

## เคส 10: ผู้ใช้เห็น "ยังไม่มีข้อมูล" ทั้งที่ DB มีครบ (error ปลอมตัวเป็น empty)
- สาเหตุ: `catch(() => { LIST = []; })` → โหลดพลาดแสดงผลเหมือนไม่มีข้อมูล — พี่พงคิดว่างานที่บันทึกไว้หายไป
- **บทเรียน: UI ต้องแยก 3 สถานะเสมอ — loading / error (พร้อมปุ่มลองใหม่) / empty จริง. หน้าอื่นที่ fetch โครงเดียวกันต้องไล่แก้ด้วย (มันคือ bug class ไม่ใช่ bug ตัวเดียว)**

## วิธีใช้เคสพวกนี้

1. บั๊กใหม่เข้ามา → ไล่เช็คว่า match เคสไหน (อาการคล้าย ≠ สาเหตุเดียว — ใช้เป็น hypothesis ไม่ใช่คำตอบ)
2. ทุกเคสจบด้วย **กลไก** (grep บังคับ, assertion, probe, test matrix) ไม่ใช่ "จะระวังมากขึ้น" — เธอปิด incident ก็ต้องส่งมอบกลไกแบบเดียวกัน
3. เจอเคสใหม่ที่ไม่ match → เขียน case study ใหม่ต่อท้ายไฟล์นี้ (รูปแบบเดียวกัน: อาการ→สาเหตุ→แก้→บทเรียน) แล้ว commit
