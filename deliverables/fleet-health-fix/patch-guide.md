# Patch Guide: Fleet Health & Agents Feed Engine Fix (#FleetHealthFix)

**Target File**: `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/tracker-api.ts`  
**Target Endpoints**: 
1. `GET /api/tracker/fleet-health` (บรรทัดที่ 2071)
2. `GET /api/tracker/agents` (บรรทัดที่ 485)

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 🎯 ปัญหาและสาเหตุที่พบ (Root Cause Analysis)

1. **`GET /api/tracker/fleet-health`**:
   - พึ่งพาไฟล์ `fleet-state.json` (ไฟล์เก่าที่ลบหายจาก repo ตั้งแต่ ก.ค.) ทำให้คืนค่าเป็น `0/17 DEAD` หรือ `fleet-state.json ไม่พบ`
2. **`GET /api/tracker/agents`**:
   - โหลด `tracker-agents.json` แบบ static ซึ่งไม่มีฟิลด์ `state` ทำให้ UI แสดงสถานะเป็น `unknown`

---

## 🛠️ แนวทางการแก้ไข

ใช้เอนจิน `fleet-health-service.ts` อ่านไฟล์ `/home/po-ch/.oracle/feed.log` (tail 100KB) เพื่อคำนวณสถานะ heartbeat ที่แท้จริงของเอเจนต์ทั้ง 17 ตัว:
- เอเจนต์ `secretary` (3 ตัว: `pa-oracle`, `nasri-oracle`, `wy-oracle`) -> **`alive`** (3/3)
- เอเจนต์ `engi` (14 ตัวที่ยังไม่ boot) -> **`dead`** (14/14)

---

## 1. การแก้ไขใน `scripts/tracker-api.ts`

### (ก) Import ฟังก์ชันใน `scripts/tracker-api.ts`
```ts
import { getFleetHealthData } from "./fleet-health-service";
```

### (ข) ปรับเปลี่ยน Endpoint `GET /api/tracker/fleet-health` (บรรทัดที่ 2071)

#### BEFORE (โค้ดเดิมที่อ่าน fleet-state.json):
```ts
2071: if (path === "/api/tracker/fleet-health") {
2072:   try {
2073:     const raw = await readFile(FLEET_STATE_PATH, "utf-8");
2074:     return jsonResponse(JSON.parse(raw));
2075:   } catch {
2076:     return jsonResponse({ error: "fleet-state.json not found", agents: [], total: 0, alive: 0, dead: 0, unknown: 0 });
2077:   }
2078: }
```

#### AFTER (โค้ดใหม่ที่ใช้ feed.log tail):
```ts
if (path === "/api/tracker/fleet-health") {
  return jsonResponse(getFleetHealthData());
}
```

### (ค) ปรับเปลี่ยน Endpoint `GET /api/tracker/agents` (บรรทัดที่ 485)

#### BEFORE (โค้ดเดิม):
```ts
485: async function handleAgents(): Promise<Response> {
486:   const fleet = await loadFleetState();
487:   ...
```

#### AFTER (โค้ดใหม่):
```ts
async function handleAgents(): Promise<Response> {
  const data = getFleetHealthData();
  return jsonResponse(data.agents);
}
```

---

## 📋 ขั้นตอนการ Deploy & Verification สำหรับ pa Oracle

```bash
# 1. Copy โมดูลบริการใหม่ไปวางที่ scripts/
cp deliverables/fleet-health-fix/fleet-health-service.ts "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/fleet-health-service.ts"

# 2. แก้ไข scripts/tracker-api.ts ตามคำแนะนำข้างต้น

# 3. รันเทสเซิร์ฟเวอร์
cd "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2"
bun scripts/tracker-api.ts

# 4. Verification ด้วย curl
curl -s http://localhost:4199/api/tracker/fleet-health | jq .summary
# Expected: { "alive": 3, "idle": 0, "busy": 0, "dead": 14, "stuck": 0, "unknown": 0 }

curl -s http://localhost:4199/api/tracker/agents | jq '.[0..2]'
# Expected: รายการ 3 เอเจนต์แรก (pa-oracle, nasri-oracle, wy-oracle) มี state: "alive"
```
