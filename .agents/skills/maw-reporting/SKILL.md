---
name: maw-reporting
description: >-
  Report work status to pa Oracle and talk to fleet agents via the maw CLI.
  Use after finishing any task (DONE), when blocked (STUCK), for 5-minute
  heartbeats on long tasks, or to message any other agent in the fleet.
---

# maw — Multi-Agent Workflow CLI

CLI อยู่ที่ `~/.local/bin/maw` (อยู่ใน PATH แล้ว) รันจาก shell ได้เลย

## คำสั่งหลัก

```bash
maw ls                        # ดู sessions + windows ทั้ง fleet
maw peek <agent>              # แอบดูจอ agent (หรือ maw peek เฉยๆ = ดูทั้งหมด)
maw hey <agent> <ข้อความ>     # ส่งข้อความหา agent
maw hey <oracle>:<win> <msg>  # เจาะ tab เช่น mawjs:mawjs-dev
```

## Reporting Contract กับ pa Oracle

```bash
# งานเสร็จ (หลัง commit แล้วเท่านั้น):
maw hey pa-oracle "[nasri] DONE: สรุปงานบรรทัดเดียว + ผลเทส"

# ติดปัญหา:
maw hey pa-oracle "[nasri] STUCK: ติดอะไร ลองอะไรไปแล้ว"

# heartbeat ทุก 5 นาทีระหว่างงานยาว:
maw hey pa-oracle "[nasri] WIP: กำลังทำขั้นไหน"
```

กติกา: เซ็นชื่อ `[nasri]` เสมอ — ห้ามเซ็นชื่อ agent อื่น. DONE ต้องมีหลักฐาน
(ผลเทส/curl/commit hash) ไม่มีหลักฐาน = รายงานเป็น "คาดว่า" แทน.

## Fleet ที่คุยได้

- `pa-oracle` — orchestrator (รายงานทุกอย่างที่นี่)
- engi: horus(lead), ptah(backend), seshat(frontend), khnum(devops),
  sobek(security), bastet(qa), sekhmet(incident), imhotep, ra, thoth,
  anubis, isis, maat, nile
- research: zeus, athena, hermes | solar: 12 ตัว (จะขึ้นเฉพาะเมื่อพี่พงสั่ง boot)

หมายเหตุ: agent ที่ยังไม่ boot จะไม่ตอบ — `maw ls` เช็คก่อนว่าใครออนไลน์
