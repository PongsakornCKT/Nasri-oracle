# Phase 2: Heartbeat & Liveness Monitor (#22) Server Changes Guide for pa Oracle

**Target File**: `/home/po-ch/agents/maw-js-server/src/server.ts`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. Import Statement Addition (บรรทัดที่ 10)

### (ก) บรรทัดที่ต้องเพิ่ม
```ts
import { getFleetHealthCached } from "./heartbeat-monitor";
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 7-13)
```ts
7: import { MawEngine } from "./engine";
8: import type { WSData } from "./types";
9: import { getHealth } from "./health-monitor";
10: 
11: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
12: // tracker-api (4100) and enervia-api (4201) run on Windows, not WSL
13: function getWinHost(): string {
```

### (ค) บริบทหลังแทรก (AFTER Context)
```ts
7: import { MawEngine } from "./engine";
8: import type { WSData } from "./types";
9: import { getHealth } from "./health-monitor";
10: import { getFleetHealthCached } from "./heartbeat-monitor";
11: 
12: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
```

---

## 2. Route Declarations Addition (หลังบรรทัดที่ 284 ต่อจาก Phase 1)

### (ก) บล็อกโค้ดที่ต้องเพิ่ม (2 Routes)
```ts
// Fleet Agent Heartbeat & Liveness API (#22 — Phase 2)
app.get("/api/fleet/health", (c) => {
  const refresh = c.req.query("refresh") === "1";
  return c.json(getFleetHealthCached(refresh));
});

// Fleet Heartbeat Widget Page
app.get("/fleet-health-widget", (c) => {
  const { existsSync, readFileSync } = require("fs");
  const p = "/home/po-ch/agents/maw-js-server/fleet-health-widget.html";
  if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
  return c.html("<h1>Fleet health widget not found</h1>", 404);
});
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 279-288)
```ts
279: app.get("/health-widget", async (c) => {
280:   const { existsSync, readFileSync } = require("fs");
281:   const p = "/home/po-ch/agents/maw-js-server/health-widget.html";
282:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
283:   return c.html("<h1>Health widget not found</h1>", 404);
284: });
285: 
286: // Oracle Studio static assets (tokens.css, style.css, app.js, etc.)
287: const ORACLE_STUDIO = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio";
288: const STATIC_EXT: Record<string, string> = {
```

### (ค) บริบทหลังแทรก (AFTER Context)
```ts
283:   return c.html("<h1>Health widget not found</h1>", 404);
284: });
285: 
286: // Fleet Agent Heartbeat & Liveness API (#22 — Phase 2)
287: app.get("/api/fleet/health", (c) => {
288:   const refresh = c.req.query("refresh") === "1";
289:   return c.json(getFleetHealthCached(refresh));
290: });
291: 
292: // Fleet Heartbeat Widget Page
293: app.get("/fleet-health-widget", (c) => {
294:   const { existsSync, readFileSync } = require("fs");
295:   const p = "/home/po-ch/agents/maw-js-server/fleet-health-widget.html";
296:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
297:   return c.html("<h1>Fleet health widget not found</h1>", 404);
298: });
299: 
300: // Oracle Studio static assets (tokens.css, style.css, app.js, etc.)
```

---

## 📋 ขั้นตอนการ Copy & Deploy สำหรับ pa Oracle

```bash
# 1. Copy โมดูลไปวางใน live checkout
cp deliverables/heartbeat-monitor/heartbeat-monitor.ts /home/po-ch/agents/maw-js-server/src/heartbeat-monitor.ts
cp deliverables/heartbeat-monitor/fleet-health-widget.html /home/po-ch/agents/maw-js-server/fleet-health-widget.html

# 2. แก้ไข src/server.ts ตามบรรทัดที่ระบุข้างต้น

# 3. Restart server & Smoke test
cd /home/po-ch/agents/maw-js-server
bun src/server.ts

# Smoke test
curl -s http://localhost:4000/api/fleet/health | jq .
```
