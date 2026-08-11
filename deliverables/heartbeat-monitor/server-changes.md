# Phase 2: Heartbeat & Liveness Monitor (#22) Server Changes Guide for pa Oracle

**Target File**: `/home/po-ch/agents/maw-js-server/src/server.ts`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. Import Statement Addition (Line 10)

### (ก) บรรทัดที่ต้องเพิ่ม
```ts
import { getFleetHeartbeat, recordHeartbeat } from "./heartbeat-monitor";
```

### (ข) บริบทจริงจากไฟล์ `server.ts` (บรรทัดที่ 7-13)
```ts
7: import { MawEngine } from "./engine";
8: import type { WSData } from "./types";
9: import { getHealth } from "./health-monitor";
10: import { getFleetHeartbeat, recordHeartbeat } from "./heartbeat-monitor";
11: 
12: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
13: // tracker-api (4100) and enervia-api (4201) run on Windows, not WSL
```

---

## 2. Route Declarations Addition (ต่อจาก Phase 1 หลังบรรทัดที่ 284)

### (ก) บล็อกโค้ดที่ต้องเพิ่ม (2 Routes)
```ts
// Fleet Agent Heartbeat API (#22 — maw Office Improve Phase 2)
app.get("/api/fleet/heartbeat", async (c) => {
  const refresh = c.req.query("refresh") === "1";
  return c.json(getFleetHeartbeat(refresh));
});

// Record Heartbeat POST endpoint
app.post("/api/fleet/heartbeat", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (body && typeof body.agent === "string") {
    recordHeartbeat(body.agent);
    return c.json({ ok: true, agent: body.agent, ts: Date.now() });
  }
  return c.json({ error: "agent is required" }, 400);
});

// Heartbeat Widget page
app.get("/heartbeat-widget", async (c) => {
  const { existsSync, readFileSync } = require("fs");
  const p = "/home/po-ch/agents/maw-js-server/heartbeat-widget.html";
  if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
  return c.html("<h1>Heartbeat widget not found</h1>", 404);
});
```

### (ข) บริบทจริงจากไฟล์ `server.ts` (บรรทัดที่ 279-290)
```ts
279: app.get("/health-widget", async (c) => {
280:   const { existsSync, readFileSync } = require("fs");
281:   const p = "/home/po-ch/agents/maw-js-server/health-widget.html";
282:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
283:   return c.html("<h1>Health widget not found</h1>", 404);
284: });
285: 
286: // Fleet Agent Heartbeat API (#22 — maw Office Improve Phase 2)
287: app.get("/api/fleet/heartbeat", async (c) => {
288:   const refresh = c.req.query("refresh") === "1";
289:   return c.json(getFleetHeartbeat(refresh));
290: });
291: 
292: // Record Heartbeat POST endpoint
293: app.post("/api/fleet/heartbeat", async (c) => {
294:   const body = await c.req.json().catch(() => ({}));
295:   if (body && typeof body.agent === "string") {
296:     recordHeartbeat(body.agent);
297:     return c.json({ ok: true, agent: body.agent, ts: Date.now() });
298:   }
299:   return c.json({ error: "agent is required" }, 400);
300: });
301: 
302: // Heartbeat Widget page
303: app.get("/heartbeat-widget", async (c) => {
304:   const { existsSync, readFileSync } = require("fs");
305:   const p = "/home/po-ch/agents/maw-js-server/heartbeat-widget.html";
306:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
307:   return c.html("<h1>Heartbeat widget not found</h1>", 404);
308: });
309: 
310: // Oracle Studio static assets (tokens.css, style.css, app.js, etc.)
```

---

## ⚠️ ข้อควรระวังสำหรับ pa ตอน Apply (Watchouts & Traps)

1. **การวางไฟล์**:
   - Copy `heartbeat-monitor.ts` ไปที่ `/home/po-ch/agents/maw-js-server/src/heartbeat-monitor.ts`
   - Copy `heartbeat-widget.html` ไปที่ `/home/po-ch/agents/maw-js-server/heartbeat-widget.html`
2. **Heartbeat Hooks/Cli Integration**:
   - สามารถส่ง POST ไปที่ `/api/fleet/heartbeat` ด้วย body `{"agent": "horus"}` เมื่อ agent มีการทำงาน เพื่ออัพเดตสถานะเป็น Active ล่าสุดได้ทันที
3. **Cache TTL 15 วินาที**:
   - `getFleetHeartbeat()` ใช้ In-memory cache 15 วินาที คืนค่าทันที ไม่บล็อก event loop
