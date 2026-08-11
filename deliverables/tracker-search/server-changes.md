# Tracker Improve Phase 1: Global Search Ctrl+K (#2) Server Changes Guide for pa Oracle

**Target Files**: 
1. `/home/po-ch/agents/maw-js-server/src/server.ts` (Backend routes)
2. `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio/tracker.html` (Frontend Header Search Trigger & Overlay Modal)

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. Import Statement Addition (บรรทัดที่ 13 ใน `src/server.ts`)

### (ก) บรรทัดที่ต้องเพิ่ม
```ts
import { searchTracker } from "./tracker-search";
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 9-16)
```ts
9: import { getHealth } from "./health-monitor";
10: import { getFleetHealthCached } from "./heartbeat-monitor";
11: import { getWorktreeDriftCached } from "./worktree-drift";
12: import { listClaims, claimTask, releaseTask, completeTask } from "./claims-store";
13: 
14: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
15: // tracker-api (4100) and enervia-api (4201) run on Windows, not WSL
16: function getWinHost(): string {
```

### (ค) บริบทหลังแทรก (AFTER Context)
```ts
10: import { getFleetHealthCached } from "./heartbeat-monitor";
11: import { getWorktreeDriftCached } from "./worktree-drift";
12: import { listClaims, claimTask, releaseTask, completeTask } from "./claims-store";
13: import { searchTracker } from "./tracker-search";
14: 
15: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
```

---

## 2. Route Declarations Addition (หลังบรรทัดที่ 346 ต่อจาก Phase 5 ใน `src/server.ts`)

### (ก) บล็อกโค้ดที่ต้องเพิ่ม (2 Routes)
```ts
// Global Search API (#2 — Tracker Improve Phase 1)
app.get("/api/tracker/search", (c) => {
  const q = c.req.query("q") || "";
  const cat = (c.req.query("category") || "all") as any;
  return c.json(searchTracker(q, cat));
});

// Tracker Search Widget / Overlay Demo Page
app.get("/tracker-search-widget", (c) => {
  const { existsSync, readFileSync } = require("fs");
  const p = "/home/po-ch/agents/maw-js-server/tracker-search-widget.html";
  if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
  return c.html("<h1>Tracker search widget not found</h1>", 404);
});
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 340-350)
```ts
340: // Task Claims Widget page
341: app.get("/task-claiming-widget", (c) => {
342:   const { existsSync, readFileSync } = require("fs");
343:   const p = "/home/po-ch/agents/maw-js-server/task-claiming-widget.html";
344:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
345:   return c.html("<h1>Task claims widget not found</h1>", 404);
346: });
347: 
348: // Oracle Studio static assets (tokens.css, style.css, app.js, etc.)
349: const ORACLE_STUDIO = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio";
350: const STATIC_EXT: Record<string, string> = {
```

### (ค) บริบทหลังแทรก (AFTER Context)
```ts
345:   return c.html("<h1>Task claims widget not found</h1>", 404);
346: });
347: 
348: // Global Search API (#2 — Tracker Improve Phase 1)
349: app.get("/api/tracker/search", (c) => {
350:   const q = c.req.query("q") || "";
351:   const cat = (c.req.query("category") || "all") as any;
352:   return c.json(searchTracker(q, cat));
353: });
354: 
355: // Tracker Search Widget / Overlay Demo Page
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

## 3. Frontend Header Trigger Integration (ใน `oracle-studio/tracker.html` บรรทัดที่ 787-805)

### (ก) บรรทัดจริงก่อน Apply ใน `tracker.html` (บรรทัดที่ 787-790)
```html
787:   <div class="header-right">
788:     <span class="last-update" id="lastUpdate">อัพเดต: —</span>
789:     <button id="btnAutoUpdate" onclick="autoUpdateStatus()" title="Auto-update..."
```

### (ข) โค้ดที่ต้องแทรกใน Header
```html
    <button id="btnGlobalSearch" onclick="openSearchModal()" title="Global Search (Ctrl+K)"
      style="background:rgba(201,168,76,0.08);border:1px solid var(--border);color:var(--gold);border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:6px;transition:all 0.15s;margin-right:4px;">
      🔍 ค้นหา... <span style="background:var(--bg3);border:1px solid var(--border);border-radius:3px;padding:0 4px;font-size:9px;">Ctrl+K</span>
    </button>
```

---

## 📋 ขั้นตอนการ Copy & Deploy สำหรับ pa Oracle

```bash
# 1. Copy โมดูลและ HTML widget ไปวางใน live checkout
cp deliverables/tracker-search/tracker-search.ts /home/po-ch/agents/maw-js-server/src/tracker-search.ts
cp deliverables/tracker-search/tracker-search-widget.html /home/po-ch/agents/maw-js-server/tracker-search-widget.html

# 2. แก้ไข src/server.ts ตามบรรทัดระบุข้างต้น

# 3. Restart server & Smoke test
cd /home/po-ch/agents/maw-js-server
bun src/server.ts

# Smoke test
curl -s "http://localhost:4000/api/tracker/search?q=health" | jq .
```
