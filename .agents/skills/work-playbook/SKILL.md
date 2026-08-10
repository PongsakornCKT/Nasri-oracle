---
name: work-playbook
description: >-
  Step-by-step playbook for executing any task end-to-end: receiving work,
  isolating in a worktree, implementing, testing, committing, and reporting.
  Use at the start of EVERY task assigned by pa or พี่พง. This is the how-to-work manual.
---

# Work Playbook — วงจรชีวิตของงาน 1 ชิ้น

ทุกงานเดินตาม 7 ขั้น ห้ามข้าม: **รับงาน → inventory → แผนสั้น → ทำใน worktree → เทส → commit → report**

## ขั้น 1: รับงาน + ทวนความเข้าใจ

- อ่านโจทย์ 2 รอบ. ถ้าโจทย์กำกวมใน "กติกาธุรกิจ" (สูตรเงิน, สิทธิ์เห็นข้อมูล, ลำดับ workflow) → **ถาม 1 คำถามก่อนเขียนโค้ด** ห้าม assume
- กติกาเทคนิคล้วน (ชื่อตัวแปร, โครงสร้างไฟล์, lib ที่ใช้) → ตัดสินเองได้ ไม่ต้องถาม
- งานใหญ่ (>30 นาที) → แตกเป็น subtask แล้วรายงาน pa ว่าจะแบ่งยังไงก่อนเริ่ม

## ขั้น 2: Inventory ของจริง (ห้ามเดา)

```bash
# ก่อนแตะ repo ไหน — ดูสถานะจริงเสมอ:
git -C <repo> status && git -C <repo> log --oneline -5
git -C <repo> worktree list && git -C <repo> branch -a | head -20

# หา function/route/table ที่มีอยู่แล้ว ก่อนสร้างใหม่:
grep -rn "<ชื่อที่จะสร้าง>" <repo> --include="*.php" --include="*.js" | head
```

- **โค้ดที่รันจริงคือ live ไม่ใช่ git** — repo งานบริษัท hot-deploy บ่อย. ก่อนแก้ไฟล์ production ให้ดึง live มา diff กับ git ก่อน (ถาม pa เรื่องช่องทางดึง live ของ repo นั้น)
- เคยพลาดจริง: วางแผนสร้างตาราง `wp_lf_time_events` ทั้งที่มีอยู่แล้วพร้อม function ครบ; รายงานบั๊ก 500 จาก git ทั้งที่ live แก้ไปแล้ว

## ขั้น 3: Worktree แยกเสมอ (งานที่แตะ repo ใช้ร่วมกับคนอื่น)

```bash
cd <repo>
git worktree add ../wt-<งาน> -b feat/<งาน> origin/main
cd ../wt-<งาน>   # ทำงานในนี้เท่านั้น
```

- **ห้ามสลับ branch ใน checkout หลัก** (`~/Documents/GitHub/*`, `/mnt/c/.../GitHub/*`) — เคยมี agent สลับ branch ใต้มือกันเอง งานเกือบหาย
- เสร็จแล้วลบ: `git worktree remove ../wt-<งาน>` (หลัง merge/report แล้วเท่านั้น)

## ขั้น 4: เขียนโค้ด

- แก้แบบ **surgical** — เปลี่ยนน้อยที่สุดที่แก้ปัญหาได้ อย่า refactor แถมโดยไม่มีใครขอ
- จะใช้ field/route/function ที่ยังไม่เคยแตะ → เปิดไฟล์หา `path:line` ของจริงก่อน — ห้ามเขียนจากความจำ
- เปลี่ยน format/ความหมายของตัวแปรหรือฟังก์ชัน → `grep` ชื่อนั้นทั้ง repo แก้ทุก usage ก่อน commit (เคสจริง: เปลี่ยน `$wf_url` แล้วเมนู 404 ทั้งบริษัท)
- Pin version เสมอ: `npm i pkg@1.2.3` ห้าม `@latest`
- ห้าม commit secrets — เช็ค diff ก่อน commit ทุกครั้งว่าไม่มี key/token/password

## ขั้น 5: เทส (ทุก impl ต้องมี test)

ลำดับ pipeline ที่ fleet ใช้: **unit → runtime → E2E → baseline → integration**

- Unit: เทสฟังก์ชันที่แก้ + happy path ของฟังก์ชันข้างเคียงที่แตะ
- Runtime: รันจริง curl/เปิดหน้า — "โค้ดถูก" ≠ "ระบบทำงาน"
- แก้บั๊ก 1 สาเหตุ → เขียนเทส gate อีกสาเหตุที่เจอระหว่างทาง + happy path เดิมด้วย (สาเหตุที่พูดผ่านๆ จะกลายเป็น regression site)
- **ห้ามใช้ข้อมูลลูกค้าจริงเทสบน production** — สร้าง entity test แยก ลบหลังจบ; ระบบ append-only (Google Sheet) ลบไม่ได้ = ขยะถาวร ห้ามยิงเด็ดขาด

## ขั้น 6: Commit

- Conventional Commits: `feat(scope): ...` / `fix(scope): ...` ภาษาอังกฤษ
- Commit เล็ก แยกตามเจตนา — อย่ารวมงาน 3 เรื่องใน commit เดียว
- ห้าม `git push --force` | ห้าม merge PR เอง (พี่พง approve เท่านั้น)

## ขั้น 7: Report (หลัง commit เท่านั้น)

```bash
maw hey pa-oracle "[nasri] DONE: <ทำอะไร> — <หลักฐาน: ผลเทส/commit hash/curl result>"
```

- DONE ไม่มีหลักฐาน runtime = ห้ามพูดว่าเสร็จ — รายงานเป็น "คาดว่าเสร็จ + วิธี verify" แทน
- ระหว่างงานยาว: `maw hey pa-oracle "[nasri] WIP: <ขั้นไหน>"` ทุก 5 นาที
- ติดเกิน 15 นาทีกับปัญหาเดียว: `[nasri] STUCK: <ปัญหา + ที่ลองแล้ว>` — อย่าเผา context เดาต่อ

## เมื่อไหร่หยุดถามพี่พง/pa

หยุดถามทันทีเมื่องานชน: deploy production, ลบข้อมูล, แตะเงิน/สิทธิ์, push force, merge, ส่งข้อความหาคนนอก. นอกนั้นตัดสินเองแล้วบันทึกเหตุผลไว้ใน commit/report
