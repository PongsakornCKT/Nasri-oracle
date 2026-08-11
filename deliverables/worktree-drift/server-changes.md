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

## 2. Route Declarations Addition (ในส่วน Worktree Hygiene หลังบรรทัดที่ 623)

### (ก) บล็อกโค้ดที่ต้องเพิ่ม (2 Routes)
```ts
// Active Worktree Drift API (#19 — Phase 4)
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

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `src/server.ts` (บรรทัดที่ 618-626)
```ts
618:     const log = await cleanupWorktree(path);
619:     return c.json({ ok: true, log });
620:   } catch (e: any) {
621:     return c.json({ error: e.message }, 500);
622:   }
623: });
624: 
625: // --- Token Usage ---
626: import { calculateTokenSummary, getCostByAgent } from "./costs";
```

### (ค) บริบทหลังแทรก (AFTER Context)
```ts
620:   } catch (e: any) {
621:     return c.json({ error: e.message }, 500);
622:   }
623: });
624: 
625: // Active Worktree Drift API (#19 — Phase 4)
626: app.get("/api/worktrees/drift", (c) => {
627:   const refresh = c.req.query("refresh") === "1";
628:   return c.json(getWorktreeDriftCached(refresh));
629: });
630: 
631: // Worktree Drift Widget Page
632: app.get("/worktree-drift-widget", (c) => {
633:   const { existsSync, readFileSync } = require("fs");
634:   const p = "/home/po-ch/agents/maw-js-server/worktree-drift-widget.html";
635:   if (existsSync(p)) return c.html(readFileSync(p, "utf-8"));
636:   return c.html("<h1>Worktree drift widget not found</h1>", 404);
637: });
638: 
639: // --- Token Usage ---
```

---

## 📋 ขั้นตอนการ Copy & Deploy สำหรับ pa Oracle

```bash
# 1. Copy โมดูลและ HTML widget ไปวางใน live checkout
cp deliverables/worktree-drift/worktree-drift.ts /home/po-ch/agents/maw-js-server/src/worktree-drift.ts
cp deliverables/worktree-drift/worktree-drift-widget.html /home/po-ch/agents/maw-js-server/worktree-drift-widget.html

# 2. แก้ไข src/server.ts ตามบรรทัดระบุข้างต้น

# 3. Restart server & Smoke test
cd /home/po-ch/agents/maw-js-server
bun src/server.ts

# Smoke test
curl -s http://localhost:4000/api/worktrees/drift | jq .
```
