# System Health Widget Integration Package (#41)

**Target Repository**: `maw-js-server` (`/home/po-ch/agents/maw-js-server`)  
**Package Origin**: `nasri-oracle` (`deliverables/health-widget/integration/`)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 📦 Package Contents

| Source File in Package | Destination Path in `maw-js-server` | Description |
|------------------------|-------------------------------------|-------------|
| `health-monitor.ts` | `src/health-monitor.ts` | Backend zero-dep monitoring module with 30s cache TTL |
| `SystemHealthWidget.tsx` | `office/src/components/SystemHealthWidget.tsx` | React UI Widget component with CSS circle status dots |
| `server.ts.patch` | Patch applied to `src/server.ts` | Diff adding `GET /api/system/health` route |
| `DashboardView.tsx.patch` | Patch applied to `office/src/components/DashboardView.tsx` | Diff mounting `<SystemHealthWidget />` in Dashboard |

---

## 🛠️ Step-by-Step Integration & Deployment Procedure for pa Oracle

### Step 1: Copy Module Files to Live Checkout
```bash
cp deliverables/health-widget/integration/health-monitor.ts /home/po-ch/agents/maw-js-server/src/health-monitor.ts
cp deliverables/health-widget/integration/SystemHealthWidget.tsx /home/po-ch/agents/maw-js-server/office/src/components/SystemHealthWidget.tsx
```

### Step 2: Apply Route Integration in `src/server.ts`
1. Open `/home/po-ch/agents/maw-js-server/src/server.ts`
2. Add import at top:
   ```ts
   import { getHealth } from "./health-monitor";
   ```
3. Add GET endpoint route around L260:
   ```ts
   // ── System Health Monitor API (#41) ──────────────────────────────────
   app.get("/api/system/health", async (c) => {
     const refresh = c.req.query("refresh") === "1";
     const health = await getHealth(refresh);
     return c.json(health);
   });
   ```

### Step 3: Mount Component in `office/src/components/DashboardView.tsx`
1. Open `/home/po-ch/agents/maw-js-server/office/src/components/DashboardView.tsx`
2. Add import at top:
   ```tsx
   import { SystemHealthWidget } from "./SystemHealthWidget";
   ```
3. Place `<SystemHealthWidget />` inside the dashboard layout (e.g. above `CostByAgent` or under controls).

### Step 4: Rebuild Frontend Bundle
```bash
cd /home/po-ch/agents/maw-js-server/office
npm run build
```

### Step 5: Restart Service & Verification
```bash
# Restart maw-js-server
cd /home/po-ch/agents/maw-js-server
bun src/server.ts
```

### Smoke Test Command:
```bash
curl -s http://localhost:4000/api/system/health | jq .
```
Expected output: JSON containing 5 services with `online: true/false`, `latencyMs`, and `checkedAt`.
