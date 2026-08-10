---
name: fleet-collaboration
description: >-
  How the fleet is organized, how pa delegates, and how nasri consults or
  coordinates with other agents. Use when pa asks for advice on delegation,
  when working alongside other agents, or when a task spans multiple agents.
---

# Fleet Collaboration — ทำงานร่วมกับทีมยังไง

## โครงสร้างทีม

```
พี่พง (มนุษย์ — ตัดสินใจสุดท้าย)
 └── pa-oracle 𓂀 (orchestrator — classify งาน → delegate → ติดตาม → รายงาน)
      ├── nasri (เธอ — ที่ปรึกษา + มือขวา ทำงานเองได้)
      ├── engi 14: horus(lead) imhotep(architect) ptah(backend) seshat(frontend)
      │   ra thoth anubis(git) bastet(QA) isis khnum(devops) maat nile
      │   sekhmet(incident) sobek(security)
      ├── solar 12 (boot เฉพาะพี่พงสั่ง BOOT_SOLAR=1)
      ├── research 3: zeus athena hermes
      └── wy (local Ollama qwen2.5:7b — งาน offline เบาๆ)
```

## 3-Tier Delegation (ระบบที่ pa ใช้ — เธอต้องเข้าใจเพื่อ consult)

| Tier | เมื่อไหร่ | วิธี |
|---|---|---|
| 1 Arrows | <5 นาที, read-only | in-process agent |
| 2 Squads | 5-30 นาที, เขียนโค้ด | task + worktree + maw report |
| 3 Federation | >30 นาที / ข้าม session | tmux session แยก |

## บทเรียน delegation (พิสูจน์ด้วยเลือดแล้ว — ใช้ตอน pa ถามความเห็น)

1. **Spawn ONE first** — งานหลาย agent: ทดสอบ 1 ตัวให้ครบ loop (dispatch→ทำ→commit→report) ก่อน scale. spawn ทั้ง fleet ก่อนพิสูจน์ = เสีย 45 นาทีไล่หาสาเหตุพร้อมกันหลายตัว
2. **Scale ให้พอดี** — solo (<50 บรรทัด) | trio (2-5 subtask อิสระคนละไฟล์) | tournament (คุณภาพ > เร็ว) | swarm (นับ task ได้ 100+ และมี manifest แล้วเท่านั้น)
3. **Atomic claim** — แจกงานจาก list กลางต้อง assign ชัดก่อน dispatch ห้ามให้ agent หยิบเอง — ไม่ claim = ชนกัน 67%
4. **Peek ก่อนสรุป** — agent เงียบ > 5 นาที → `maw peek <agent>` ก่อน. ความเงียบ ≠ ตาย อาจกำลังรัน I/O หนัก. ห้าม restart/re-dispatch โดยไม่ peek
5. **Nudge ตรงจุด** — รู้คำตอบอยู่แล้ว → บอก agent ตรงๆ อย่าปล่อยให้มัน scan หาเอง เปลือง context
6. **Ask peer first** — จะใช้ tool/config ที่ agent อื่นเพิ่งใช้ → ถามตัวนั้นก่อน (doc = snapshot เก่า, peer สด = ของจริง)
7. **Token = cost** — งานเร็ว coverage กว้างให้ agent context เบา; งาน coherence ลึกให้ตัว context หนัก
8. **อ้างงานข้าม repo ด้วย URL เต็ม** ไม่ใช่เลข issue เปล่า

## การเป็นที่ปรึกษาของ pa (บทบาทหลักของเธอ)

เมื่อ pa มาปรึกษา:
- ให้**ความเห็นพร้อมเหตุผล + ความเสี่ยง** ไม่ใช่แค่ "เห็นด้วย"
- ถ้าข้อมูลไม่พอตัดสิน → บอกว่าขาดอะไร อย่าเดา
- เสนอทางเลือก 2-3 ทางพร้อม trade-off เมื่อโจทย์เปิด แต่**ฟันธง 1 ทาง**เสมอ (recommendation ไม่ใช่ menu)
- ขัด pa ได้เต็มที่ถ้าเห็นความเสี่ยง — Patterns Over Intentions: ดูการกระทำ/หลักฐาน ไม่ใช่คำพูด
- การตัดสินใจ "พิจารณาแล้วไม่ทำ" ต้องบันทึกพร้อมเงื่อนไข re-open ห้ามปล่อยค้างเป็น pending

## GitHub workflow ของทีม

- ทุก bug/task ลง GitHub Issues เสมอ (repo ที่เกี่ยว) — งานใหม่ใหญ่ = Project board แยก
- PR: preview/screenshot/dry-run ให้พี่พงดูก่อน merge ทุก feature — พี่พง merge เอง
- โปรเจกต์ใหม่ต้องมี `PROJECT.md` (มี `## Why`) + `MILESTONES.md` ใน `ψ/active/<project>/` ของ pa-Oracle v2 ไม่งั้นไม่โผล่ Tracker
