# Tracker Phase 3: Batch Execute Multi-Select Toolbar (#4) Apply Guide for pa Oracle

**Target Files**: 
1. `/home/po-ch/agents/maw-js-server/src/server.ts` (Backend Batch Execute Route)
2. `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio/tracker.html` (Frontend Multi-Select & Batch Toolbar)

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. Import Statement Addition (บรรทัดที่ 15 ใน `src/server.ts`)

### (ก) บรรทัดที่ต้องเพิ่ม
```ts
import { executeBatchTasks } from "./batch-exec";
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 12-18)
```ts
12: import { listClaims, claimTask, releaseTask, completeTask } from "./claims-store";
13: import { searchTracker } from "./tracker-search";
14: import { getActiveExecutions } from "./exec-progress";
15: 
16: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
17: // tracker-api (4100) and enervia-api (4201) run on Windows, not WSL
```

---

## 2. Route Declarations Addition (ใน `src/server.ts` หลัง Phase 2)

### (ก) บล็อกโค้ดที่ต้องเพิ่ม (2 Routes)
```ts
// Batch Execute API (#4 — Tracker Improve Phase 3)
app.post("/api/tracker/batch-execute", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.items || !Array.isArray(body.items)) return c.json({ ok: false, error: "items array required" }, 400);
  return c.json(executeBatchTasks(body));
});

// Batch Exec Widget Demo Page
app.get("/batch-exec-widget", (c) => {
  const { existsSync, readFileSync } = require("fs");
  const p = "/home/po-ch/agents/maw-js-server/batch-exec-widget.html";
  if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
  return c.html("<h1>Batch exec widget not found</h1>", 404);
});
```

---

## 3. Frontend Card Integration (ใน `oracle-studio/tracker.html` บรรทัดที่ 3024)

### (ก) บรรทัดจริงก่อน Apply ใน `tracker.html` (บรรทัดที่ 3022-3026)
```html
3022: </script>
3023: 
3024: </body>
3025: </html>
```

### (ข) โค้ดที่ต้องแทรก (คัดลอกก้อนจาก `deliverables/tracker-batch-exec/batch-exec-block.html`)
วางก้อนบล็อก HTML/CSS/JS ทั้งหมดจาก `batch-exec-block.html` ก่อนปิด `</body>` (บรรทัดที่ 3024)

---

## 📋 ขั้นตอนการ Copy & Deploy สำหรับ pa Oracle

```bash
# 1. Copy โมดูลและ HTML widget ไปวางใน live checkout
cp deliverables/tracker-batch-exec/batch-exec.ts /home/po-ch/agents/maw-js-server/src/batch-exec.ts
cp deliverables/tracker-batch-exec/batch-exec-block.html /home/po-ch/agents/maw-js-server/batch-exec-widget.html

# 2. แก้ไข src/server.ts และ oracle-studio/tracker.html ตามระบุข้างต้น

# 3. Verification
# เปิดเบราว์เซอร์เข้า http://localhost:4000/tracker
# ตรวจสอบปุ่ม ☑ Select All ข้าง Agent Proposals
# เลือกข้อเสนอที่ต้องการ แล้วกดปุ่ม ⚡ Execute Selected ที่แถบด้านล่าง
```
