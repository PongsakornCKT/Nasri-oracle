# System Health Widget Server Changes Guide for pa Oracle

**Target File**: `/home/po-ch/agents/maw-js-server/src/server.ts`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. Import Statement Addition (Line 9)

### (ก) บรรทัดที่ต้องเพิ่ม
```ts
import { getHealth } from "./health-monitor";
```

### (ข) บริบทจริงจากไฟล์ `server.ts` (บรรทัดที่ 6-12)
```ts
6: import { FeedTailer } from "./feed-tail";
7: import { MawEngine } from "./engine";
8: import type { WSData } from "./types";
9: import { getHealth } from "./health-monitor";
10: 
11: // Auto-detect Windows host IP for WSL2 cross-boundary proxying
12: // tracker-api (4100) and enervia-api (4201) run on Windows, not WSL
```

---

## 2. Route Declarations Addition (หลังบรรทัดที่ 269)

### (ก) บล็อกโค้ดที่ต้องเพิ่ม (2 Routes)
```ts
// System Health API Endpoint (#41)
app.get("/api/system/health", async (c) => {
  const refresh = c.req.query("refresh") === "1";
  const health = await getHealth(refresh);
  return c.json(health);
});

// System Health Widget HTML Mockup View
app.get("/health-widget", async (c) => {
  const { existsSync, readFileSync } = require("fs");
  const p = require("path").resolve(__dirname, "../deliverables/health-widget/integration/health-widget.html");
  if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
  return c.html("<h1>Health widget not found</h1>", 404);
});
```

### (ข) บริบทจริงจากไฟล์ `server.ts` (บรรทัดที่ 264-274)
```ts
264: app.get("/tracker", async (c) => {
265:   const { existsSync, readFileSync } = require("fs");
266:   const p = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio/tracker.html";
267:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
268:   return c.html("<h1>Tracker not found</h1>", 404);
269: });
270: 
271: // System Health API Endpoint (#41)
272: app.get("/api/system/health", async (c) => {
273:   const refresh = c.req.query("refresh") === "1";
274:   const health = await getHealth(refresh);
275:   return c.json(health);
276: });
277: 
278: // System Health Widget HTML Mockup View
279: app.get("/health-widget", async (c) => {
280:   const { existsSync, readFileSync } = require("fs");
281:   const p = require("path").resolve(__dirname, "../deliverables/health-widget/integration/health-widget.html");
282:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
283:   return c.html("<h1>Health widget not found</h1>", 404);
284: });
285: 
286: // Oracle Studio static assets (tokens.css, style.css, app.js, etc.)
287: const ORACLE_STUDIO = "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio";
```

---

## ⚠️ สิ่งที่ pa ต้องระวังตอน Apply (Watchouts & Traps)

1. **Path Resolution ใน `/health-widget` Route**:
   - หาก pa วาง `health-widget.html` ไว้ใน `maw-js-server/public/health-widget.html` หรือ `maw-js-server/dist/` ให้ปรับ path string `p` ใน route ให้ตรงตำแหน่งจริงในเครื่อง
2. **Global Rate Limiter (บรรทัดที่ 48-59)**:
   - Route `/api/system/health` ขึ้นต้นด้วย `/api/` จึงจะผ่าน Rate Limiter middleware
   - `getHealth()` มี In-memory cache TTL 30s ในตัว ทำให้แม้ Frontend จะ auto-poll ทุก 30s จากหลาย tab ก็จะไม่ยิง HTTP probe ซ้ำเกินจำเป็น
3. **CORS Headers**:
   - Route `/api/system/health` จะได้รับ CORS Headers ตาม `ALLOWED_ORIGINS` อัตโนมัติ (บรรทัด 26-39)
