# Phase 4: Worktree Drift Counter (#19) Server Changes Guide for pa Oracle

**Target File**: `/home/po-ch/agents/maw-js-server/src/server.ts`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. Import Statement Addition (บรรทัดที่ 11)

### (ก) บรรทัดที่ต้องเพิ่ม
```ts
import { getWorktreeDriftCached } from "./worktree-drift";
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 8-14)
```ts
8: import type { WSData } from "./types";
9: import { getHealth } from "./health-monitor";
10: import { getFleetHealthCached } from "./heartbeat-monitor";
11: 
12: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
13: // tracker-api (4100) and enervia-api (4201) run on Windows, not WSL
14: function getWinHost(): string {
```

### (ค) บริบทหลังแทรก (AFTER Context)
```ts
9: import { getHealth } from "./health-monitor";
10: import { getFleetHealthCached } from "./heartbeat-monitor";
11: import { getWorktreeDriftCached } from "./worktree-drift";
12: 
13: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
```

---

## 2. Route Declarations Addition (หลังบรรทัดที่ 299 ต่อจาก Phase 2)

### (ก) บล็อกโค้ดที่ต้องเพิ่ม (2 Routes)
```ts
// Active Worktree Drift API (#19 — maw Office Improve Phase 4)
app.get("/api/worktrees/drift", (c) => {
  const refresh = c.req.query("refresh") === "1";
  return c.json(getWorktreeDriftCached(refresh));
});

// Worktree Drift Widget Page
app.get("/worktree-drift-widget", (c) => {
  const { existsSync, readFileSync } = require("fs");
  const p = "/home/po-ch/agents/maw-js-server/worktree-drift-widget.html";
  if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
  return c.html("<h1>Worktree drift widget not found</h1>", 404);
});
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 293-303)
```ts
293: // Fleet Heartbeat Widget page
294: app.get("/fleet-health-widget", (c) => {
295:   const { existsSync, readFileSync } = require("fs");
296:   const p = "/home/po-ch/agents/maw-js-server/fleet-health-widget.html";
297:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
298:   return c.html("<h1>Fleet health widget not found</h1>", 404);
299: });
300: 
301: // Oracle Studio static assets (tokens.css, style.css, app.js, etc.)
302: const ORACLE_STUDIO = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio";
303: const STATIC_EXT: Record<string, string> = {
```

### (ค) บริบทหลังแทรก (AFTER Context)
```ts
298:   return c.html("<h1>Fleet health widget not found</h1>", 404);
299: });
300: 
301: // Active Worktree Drift API (#19 — maw Office Improve Phase 4)
302: app.get("/api/worktrees/drift", (c) => {
303:   const refresh = c.req.query("refresh") === "1";
304:   return c.json(getWorktreeDriftCached(refresh));
305: });
306: 
307: // Worktree Drift Widget Page
308: app.get("/worktree-drift-widget", (c) => {
309:   const { existsSync, readFileSync } = require("fs");
310:   const p = "/home/po-ch/agents/maw-js-server/worktree-drift-widget.html";
311:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
312:   return c.html("<h1>Worktree drift widget not found</h1>", 404);
313: });
314: 
315: // Oracle Studio static assets (tokens.css, style.css, app.js, etc.)
```

---

## 📋 ขั้นตอนการ Copy & Deploy สำหรับ pa Oracle

```bash
# 1. Copy โมดูลและ HTML widget ไปวางใน live checkout
cp deliverables/worktree-drift/worktree-drift.ts /home/po-ch/agents/maw-js-server/src/worktree-drift.ts
cp deliverables/worktree-drift/worktree-drift-widget.html /home/po-ch/agents/maw-js-server/worktree-drift-widget.html

# 2. แก้ไข src/server.ts ตามบรรทัดที่ระบุข้างต้น

# 3. Restart server & Smoke test
cd /home/po-ch/agents/maw-js-server
bun src/server.ts

# Smoke test
curl -s http://localhost:4000/api/worktrees/drift | jq .
```
