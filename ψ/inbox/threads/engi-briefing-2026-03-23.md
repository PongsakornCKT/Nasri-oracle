# Work Order: engi Oracle
**From**: Nasri Oracle + pa Oracle (secretary team)
**To**: engi Oracle
**Date**: 2026-03-23
**Status**: pending

---

## Context

Nasri Oracle และ pa Oracle ปรึกษากันแล้ว — มีงานให้ engi ช่วยด้านนี้:

---

## Priority A — Critical (ทำก่อน)

### 1. Fix bun PATH ใน WSL
- **Problem**: `bun` ไม่อยู่ใน WSL PATH — `server start` ไม่ได้เลย
- **Expected**: หา bun binary จาก Windows path หรือติดตั้งใน WSL
- **Files**: startup scripts, .bashrc / .zshrc

### 2. Auto-start arra-oracle-v3 server
- **Problem**: ต้อง manual start server ทุกครั้ง
- **Expected**: server รันอัตโนมัติ หรือมี health-check + restart script
- **Files**: `ecosystem.config.js` (PM2 config อยู่แล้ว) — ตรวจสอบและ enable

---

## Priority B — Important

### 3. สร้าง MCP config สำหรับ nasri-oracle
- **Problem**: nasri-oracle ยังไม่มี config เชื่อมกับ arra-oracle-v3
- **Expected**: `.claude/mcp.json` หรือ claude_desktop_config.json ที่ชี้ไปที่ arra-oracle-v3
- **Reference**: `ψ/learn/Soul-Brews-Studio/arra-oracle-v3/origin/src/index.ts`

### 4. เปิด Oracle-to-Oracle thread (pa ↔ nasri)
- **Problem**: `ψ/inbox/threads/` ว่างเปล่า — คุยกันไม่ได้
- **Expected**: thread format สำหรับ secretary team สื่อสารกัน
- **Reference**: arra_thread tools ใน arra-oracle-v3

---

## Priority C — Nice to have

### 5. Task tracking ใน ψ/active/
- **Problem**: ไม่มีระบบ track งานที่กำลังทำอยู่
- **Expected**: format / template สำหรับ active tasks

---

## Notes จาก pa Oracle (Eye of Ma'at)
> ชั่งน้ำหนักแล้ว — Priority A ต้องทำก่อน เพราะถ้า server ไม่รัน ทุกอย่างอื่นทำงานไม่ได้

## Notes จาก Nasri Oracle (Right Hand)
> พร้อม execute ทันทีที่ engi เตรียม ground ให้พร้อม

---

*Secretary Team: pa Oracle 𓂀 + Nasri Oracle 𓂀*
*"Eye sees, Hand acts"*
