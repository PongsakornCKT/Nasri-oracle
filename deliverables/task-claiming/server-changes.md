# Phase 5: Task Claiming & Locking Board (#27) Server Changes Guide for pa Oracle

**Target File**: `/home/po-ch/agents/maw-js-server/src/server.ts`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. Import Statement Addition (บรรทัดที่ 12)

### (ก) บรรทัดที่ต้องเพิ่ม
```ts
import { getTaskClaims, claimTask, releaseTask, completeTask } from "./task-claiming";
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 8-15)
```ts
8: import type { WSData } from "./types";
9: import { getHealth } from "./health-monitor";
10: import { getFleetHealthCached } from "./heartbeat-monitor";
11: import { getWorktreeDriftCached } from "./worktree-drift";
12: 
13: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
14: // tracker-api (4100) and enervia-api (4201) run on Windows, not WSL
15: function getWinHost(): string {
```

### (ค) บริบทหลังแทรก (AFTER Context)
```ts
9: import { getHealth } from "./health-monitor";
10: import { getFleetHealthCached } from "./heartbeat-monitor";
11: import { getWorktreeDriftCached } from "./worktree-drift";
12: import { getTaskClaims, claimTask, releaseTask, completeTask } from "./task-claiming";
13: 
14: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
```

---

## 2. Route Declarations Addition (หลังบรรทัดที่ 314 ต่อจาก Phase 4)

### (ก) บล็อกโค้ดที่ต้องเพิ่ม (5 Routes)
```ts
// Task Claiming API Endpoints (#27 — Phase 5)
app.get("/api/tasks/claims", (c) => {
  return c.json(getTaskClaims());
});

app.post("/api/tasks/claim", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.taskId || !body.claimedBy) {
    return c.json({ error: "taskId and claimedBy required" }, 400);
  }
  const result = claimTask(body.taskId, body.claimedBy, body.title, body.ttlMinutes);
  if (!result.ok) return c.json({ error: result.error }, 409); // 409 Conflict if already locked
  return c.json(result);
});

app.post("/api/tasks/release", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.taskId || !body.agent) {
    return c.json({ error: "taskId and agent required" }, 400);
  }
  const result = releaseTask(body.taskId, body.agent);
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json(result);
});

app.post("/api/tasks/complete", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.taskId || !body.agent) {
    return c.json({ error: "taskId and agent required" }, 400);
  }
  const result = completeTask(body.taskId, body.agent);
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json(result);
});

// Task Claiming Widget Page
app.get("/task-claiming-widget", (c) => {
  const { existsSync, readFileSync } = require("fs");
  const p = "/home/po-ch/agents/maw-js-server/task-claiming-widget.html";
  if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
  return c.html("<h1>Task claiming widget not found</h1>", 404);
});
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 308-318)
```ts
308: // Worktree Drift Widget page
309: app.get("/worktree-drift-widget", (c) => {
310:   const { existsSync, readFileSync } = require("fs");
311:   const p = "/home/po-ch/agents/maw-js-server/worktree-drift-widget.html";
312:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
313:   return c.html("<h1>Worktree drift widget not found</h1>", 404);
314: });
315: 
316: // Oracle Studio static assets (tokens.css, style.css, app.js, etc.)
317: const ORACLE_STUDIO = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio";
318: const STATIC_EXT: Record<string, string> = {
```

### (ค) บริบทหลังแทรก (AFTER Context)
```ts
313:   return c.html("<h1>Worktree drift widget not found</h1>", 404);
314: });
315: 
316: // Task Claiming API Endpoints (#27 — Phase 5)
317: app.get("/api/tasks/claims", (c) => {
318:   return c.json(getTaskClaims());
319: });
320: 
321: app.post("/api/tasks/claim", async (c) => {
322:   const body = await c.req.json().catch(() => ({}));
323:   if (!body.taskId || !body.claimedBy) {
324:     return c.json({ error: "taskId and claimedBy required" }, 400);
325:   }
326:   const result = claimTask(body.taskId, body.claimedBy, body.title, body.ttlMinutes);
327:   if (!result.ok) return c.json({ error: result.error }, 409);
328:   return c.json(result);
329: });
330: 
331: app.post("/api/tasks/release", async (c) => {
332:   const body = await c.req.json().catch(() => ({}));
333:   if (!body.taskId || !body.agent) {
334:     return c.json({ error: "taskId and agent required" }, 400);
335:   }
336:   const result = releaseTask(body.taskId, body.agent);
337:   if (!result.ok) return c.json({ error: result.error }, 400);
338:   return c.json(result);
339: });
340: 
341: app.post("/api/tasks/complete", async (c) => {
342:   const body = await c.req.json().catch(() => ({}));
343:   if (!body.taskId || !body.agent) {
344:     return c.json({ error: "taskId and agent required" }, 400);
345:   }
346:   const result = completeTask(body.taskId, body.agent);
347:   if (!result.ok) return c.json({ error: result.error }, 400);
348:   return c.json(result);
349: });
350: 
351: // Task Claiming Widget Page
352: app.get("/task-claiming-widget", (c) => {
353:   const { existsSync, readFileSync } = require("fs");
354:   const p = "/home/po-ch/agents/maw-js-server/task-claiming-widget.html";
355:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
356:   return c.html("<h1>Task claiming widget not found</h1>", 404);
357: });
358: 
359: // Oracle Studio static assets (tokens.css, style.css, app.js, etc.)
```

---

## 📋 ขั้นตอนการ Copy & Deploy สำหรับ pa Oracle

```bash
# 1. Copy โมดูลและ HTML widget ไปวางใน live checkout
cp deliverables/task-claiming/task-claiming.ts /home/po-ch/agents/maw-js-server/src/task-claiming.ts
cp deliverables/task-claiming/task-claiming-widget.html /home/po-ch/agents/maw-js-server/task-claiming-widget.html

# 2. แก้ไข src/server.ts ตามบรรทัดระบุข้างต้น

# 3. Restart server & Smoke test
cd /home/po-ch/agents/maw-js-server
bun src/server.ts

# Smoke test
curl -s http://localhost:4000/api/tasks/claims | jq .
```
