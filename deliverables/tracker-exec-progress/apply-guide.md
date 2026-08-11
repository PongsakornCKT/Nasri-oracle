# Tracker Phase 2: Real-Time Execution Progress (#7) Apply Guide for pa Oracle

**Target Files**: 
1. `/home/po-ch/agents/maw-js-server/src/server.ts` (Backend stream endpoint)
2. `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio/tracker.html` (Frontend Progress Stream Card)

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. Import Statement Addition (บรรทัดที่ 14 ใน `src/server.ts`)

### (ก) บรรทัดที่ต้องเพิ่ม
```ts
import { getActiveExecutions } from "./exec-progress";
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 10-17)
```ts
10: import { getFleetHealthCached } from "./heartbeat-monitor";
11: import { getWorktreeDriftCached } from "./worktree-drift";
12: import { listClaims, claimTask, releaseTask, completeTask } from "./claims-store";
13: import { searchTracker } from "./tracker-search";
14: 
15: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
16: // tracker-api (4100) and enervia-api (4201) run on Windows, not WSL
17: function getWinHost(): string {
```

### (ค) บริบทหลังแทรก (AFTER Context)
```ts
11: import { getWorktreeDriftCached } from "./worktree-drift";
12: import { listClaims, claimTask, releaseTask, completeTask } from "./claims-store";
13: import { searchTracker } from "./tracker-search";
14: import { getActiveExecutions } from "./exec-progress";
15: 
16: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
```

---

## 2. Route Declarations Addition (หลังบรรทัดที่ 361 ใน `src/server.ts`)

### (ก) บล็อกโค้ดที่ต้องเพิ่ม (2 Routes)
```ts
// Active Executions Progress Stream API (#7 — Tracker Improve Phase 2)
app.get("/api/tracker/active-executions", (c) => {
  return c.json(getActiveExecutions());
});

// Exec Progress Widget Demo Page
app.get("/exec-progress-widget", (c) => {
  const { existsSync, readFileSync } = require("fs");
  const p = "/home/po-ch/agents/maw-js-server/exec-progress-widget.html";
  if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
  return c.html("<h1>Exec progress widget not found</h1>", 404);
});
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 356-363)
```ts
356: app.get("/tracker-search-widget", (c) => {
357:   const { existsSync, readFileSync } = require("fs");
358:   const p = "/home/po-ch/agents/maw-js-server/tracker-search-widget.html";
359:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
360:   return c.html("<h1>Tracker search widget not found</h1>", 404);
361: });
362: 
363: // Oracle Studio static assets (tokens.css, style.css, app.js, etc.)
```

---

## 3. Frontend Card Integration (ใน `oracle-studio/tracker.html` บรรทัดที่ 860)

### (ก) บรรทัดจริงก่อน Apply ใน `tracker.html` (บรรทัดที่ 858-863)
```html
858:         </button>
859:       </div>
860:     </div>
861: 
862:     <!-- #13 Needs Attention (STALE / BLOCKED) — hidden when none -->
863:     <div id="needsAttention" style="display:none;margin:0 0 14px;padding:10px 14px;background:rgba(224,82,82,0.05);border:1px solid rgba(224,82,82,0.18);border-radius:8px"></div>
```

### (ข) โค้ดที่ต้องแทรก (คัดลอกก้อนจาก `deliverables/tracker-exec-progress/exec-progress-block.html`)
วางก้อนบล็อก HTML/CSS/JS ทั้งหมดใต้ `</div>` ของ `quickExecuteBar` (บรรทัดที่ 860) ทันที

---

## 📋 ขั้นตอนการ Copy & Deploy สำหรับ pa Oracle

```bash
# 1. Copy โมดูลและ HTML widget ไปวางใน live checkout
cp deliverables/tracker-exec-progress/exec-progress.ts /home/po-ch/agents/maw-js-server/src/exec-progress.ts
cp deliverables/tracker-exec-progress/exec-progress-block.html /home/po-ch/agents/maw-js-server/exec-progress-widget.html

# 2. แก้ไข src/server.ts และ oracle-studio/tracker.html ตามระบุข้างต้น

# 3. Restart server & Smoke test
cd /home/po-ch/agents/maw-js-server
bun src/server.ts

# Smoke test
curl -s http://localhost:4000/api/tracker/active-executions | jq .
```
