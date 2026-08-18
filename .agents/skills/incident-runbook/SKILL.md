---
name: incident-runbook
description: >-
  Runbook for bugs, outages, and fire-fighting: reproduce-first discipline,
  probing when fixes don't stick, rollback rules, and when to escalate.
  Use the moment anyone reports a bug or something in production breaks.
---

# Incident Runbook — เจอบั๊ก/ไฟไหม้ทำตามนี้

## ลำดับบังคับเมื่อมี bug report

```
1. REPRODUCE   → ทำให้บั๊กเกิดต่อหน้าตัวเองก่อน (curl/เปิดหน้า/รันเทส)
2. ISOLATE     → หาจุดเกิดจริงด้วยหลักฐาน (log, diff live-vs-git, probe)
3. FIX         → แก้เล็กที่สุดที่ปิดสาเหตุ
4. GATE        → เทสปิดสาเหตุนั้น + สาเหตุรองที่เจอระหว่างทาง + happy path
5. VERIFY      → หลักฐาน runtime หลัง deploy (curl/screenshot) ไม่ใช่แค่โค้ดถูก
6. RECORD      → บทเรียนเขียนกลับเข้า skill/memory ที่ session หน้าจะเจอ
```

**ห้ามพิมพ์ทฤษฎีสาเหตุลงแชทก่อน reproduce สำเร็จ** — ทฤษฎีที่พิมพ์ก่อนมีหลักฐานจะกลายเป็นเป้าที่ทุกคนวิ่งตามแม้มันผิด

## 2-Strike Probe Rule

แก้อาการเดิมรอบที่ 2 แล้วไม่หาย → **หยุด**. ห้ามแก้รอบ 3 จนกว่าจะมี probe วัดสถานะจริง:
- Web/CSS: enumerate computed styles จริง, เปิด incognito (cache!), curl ดู response ดิบ
- Backend: diagnostic endpoint ชั่วคราว, log ที่จุดสงสัย, `var_dump` + curl
- Deploy: byte-verify ไฟล์บน server ตรงกับที่ตั้งใจอัพ (`md5sum` สองฝั่ง)

เหตุผล: แก้ 2 รอบไม่หาย = mental model ผิด ไม่ใช่โค้ดผิด. รอบ 3 ที่เดาต่อจะเผาเวลาพี่พงฟรี

## ผลเขียวหลอก (Green-Result Trap)

diff บอก identical / เทสผ่านหมด / "already up to date" ทั้งที่อาการยังอยู่ →
**audit เครื่องมือวัดก่อนเชื่อผล**. เคสจริง: wrapper บอก "up-to-date" ตลอด ทั้งที่ upstream ย้าย default branch — ตกรุ่นเงียบ 1,202 commits. ผลเขียวคือจุดที่การสืบสวนหยุด — เช็คว่าเครื่องวัดวัดสิ่งที่คิดว่าวัดจริงมั้ย

## Tool คืนผลแปลก

Tool/script คืน error ที่ path หรือผลไม่ตรง input → ปฏิบัติเหมือน **bug จริงของ tool**:
reproduce บน environment ที่สอง + แจ้ง pa. อย่ารีบโทษ cwd/typo ตัวเอง — เคยเสียเวลาเป็นชั่วโมงเพราะ assume ว่าตัวเองพิมพ์ผิด

## Rollback + Escalation

- Production พัง + ยังหาสาเหตุไม่เจอใน 15 นาที → รายงาน pa ทันที `[nasri] STUCK:` พร้อมสิ่งที่ลองแล้ว — sekhmet (incident) อาจถูกดึงมาช่วย
- Rollback ต้องมีของจริงให้ถอย: survey มี tag baseline (เช่น v1.5.5) — เช็คกับ pa ก่อนถอย
- **ห้าม hotfix ตรงบน live โดยไม่มี commit ใน git** — ไม่งั้น deploy รอบถัดไปทับของที่แก้ (คือที่มาของ live≠git drift ทั้งหมด)
- ห้ามลบ/truncate ข้อมูลเพื่อ "ล้างของเสีย" โดยไม่มี backup + พี่พงอนุมัติ

## หลัง incident จบ

- เขียนบทเรียน: เกิดอะไร, สาเหตุจริง, กลไกกันซ้ำ (ไม่ใช่ "จะระวังมากขึ้น" — ต้องเป็นขั้นตอน/เทส/probe ที่บังคับ)
- สัจธรรมของ fleet: **สัจธรรมไม่มีกลไก = ความตั้งใจ = ล้มเหลว** — ความตั้งใจดีไม่เคยกันบั๊กซ้ำได้ กลไกเท่านั้นที่กันได้
- report: `maw hey pa-oracle "[nasri] DONE: incident <ชื่อ> ปิดแล้ว — root cause: <สาเหตุ>, gate: <เทส/กลไกที่เพิ่ม>"`
