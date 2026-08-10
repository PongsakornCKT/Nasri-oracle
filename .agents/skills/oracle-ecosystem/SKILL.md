---
name: oracle-ecosystem
description: >-
  Map of the pa Oracle ecosystem: local services, ports, key repos, data
  locations, and where things live. Use when you need to check a service,
  find a repo, read the agora feed, or understand how the fleet is wired.
---

# Oracle Ecosystem Map (สแนปช็อต 2026-08-10)

## Services (WSL, เช็คด้วย curl)

| Service | URL | หมายเหตุ |
|---|---|---|
| maw office dashboard | http://localhost:4000/#dashboard | systemd pa-maw.service (live checkout ~/agents/maw-js-server) |
| Tracker API | http://localhost:4100/health | tmux services:tracker-api |
| Fleet API Gateway | http://localhost:4300/gateway/health | routes /api/tracker /api/kb /api/enervia |
| Enervia API | http://localhost:4201/health | tmux services:enervia-api |
| arra-oracle-v3 | http://localhost:47779 | รันจาก ~/ghq/.../arra-oracle-v3 (ไม่ใช่ :3456 — นั่นคือ maw serve) |
| codebase-memory | :9749 (ฝั่ง Windows) | knowledge graph MCP |

## Repos สำคัญ

- `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2` — repo หลักของ pa + fleet scripts (scripts/boot-all.sh, boot-fleet.sh)
- `/mnt/c/Users/pO-Ch/Documents/GitHub/nasri-oracle` — บ้านเธอ (nasri)
- `/mnt/c/Users/pO-Ch/Documents/GitHub/enervia-survey` — งานหลักของบริษัท (survey/quote/payroll PWA + WP plugin)
- กติกา: โค้ดที่รันจริงบน server = live ไม่ใช่ git — เช็ค live ก่อนแตะเสมอ

## ข้อมูล + การสื่อสาร

- Agora (ข้อความ fleet): `pa-Oracle v2/ψ/inbox/agora/*.jsonl` — maw hey เขียนลงนี่
- Oracle feed: `~/.oracle/feed.log` — hook heartbeat ทุกตัวลงนี่
- ความจำ pa: `pa-Oracle v2/ψ/` (active projects, memory, learnings)
- Tracker: http://localhost:4000/tracker — โปรเจกต์ต้องมี PROJECT.md + MILESTONES.md ใน ψ/active/<project>/ ถึงโผล่

## ทีมงาน

- พี่พง (มนุษย์, ตัดสินใจสุดท้าย) → pa-oracle (orchestrator, จ่ายงาน)
  → nasri (ที่ปรึกษา/มือขวา) + engi 14 + solar 12 + research 3 + wy (local Ollama)
- Delegation tiers: <5min read-only = in-process | 5-30min เขียนโค้ด = worktree+maw
  | >30min = tmux session แยก
