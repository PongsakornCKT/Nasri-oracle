# Patch Guide: Fleet Health Single Source of Truth (#FleetHealthSingleSource)

**Target File**: `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/tracker-api.ts`  
**Target Functions**: 
1. `handleAgents()` (บรรทัดที่ 485)
2. `GET /api/tracker/fleet-health` (บรรทัดที่ 2071)

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 🎯 สรุปการแก้ไข

- **ชี้แหล่งข้อมูลเดี่ยว (Single Source of Truth)**: ดึงข้อมูลจากเอนจิน MAW Office Live Endpoint ที่พอร์ต 4000: `http://localhost:4000/api/fleet/health` (กำหนด Timeout 3 วินาที)
- **การแปลงสถานะ (Schema Mapping)**:
  - `status: "Active"` / `"Silent"` / `"no-heartbeat"` -> **`state: "alive"`** (รวม 3 ตัว: `pa-oracle`, `nasri-oracle`, `wy-oracle`)
  - `status: "Stale"` / Unbooted -> **`state: "dead"`**, **`task: "standby (not booted)"`** (14 ตัวฝั่ง engi)
- **Fallback**: หากบริการ Office ไม่ตอบสนอง จะ fallback กลับไปอ่าน `fleet-state.json` โดยอัตโนมัติ

---

## 1. การแก้ไขใน `scripts/tracker-api.ts`

### (ก) เพิ่ม Import ใน `scripts/tracker-api.ts` (ส่วนหัวไฟล์)
```ts
import { fetchOfficeFleetHealth } from "./fleet-health-service";
```

### (ข) ปรับเปลี่ยนฟังก์ชัน `handleAgents` (บรรทัดที่ 485)

#### BEFORE (โค้ดเดิมที่อ่าน fleet-state.json / static agents):
```ts
485: async function handleAgents(): Promise<Response> {
486:   // Primary: read fleet-state.json from khnum C1 engine (pane_markers-based detection)
487:   const fleet = await loadFleetState();
488:   if (fleet && Array.isArray(fleet.agents) && fleet.agents.length > 0) {
489:     ...
490:   }
491:   return jsonResponse(await loadStaticAgents());
492: }
```

#### AFTER (โค้ดใหม่ที่ชี้เข้า Office API):
```ts
async function handleAgents(): Promise<Response> {
  const data = await fetchOfficeFleetHealth();
  return jsonResponse(data.agents || []);
}
```

### (ค) ปรับเปลี่ยน Endpoint `GET /api/tracker/fleet-health` (บรรทัดที่ 2071)

#### BEFORE (โค้ดเดิม):
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

#### AFTER (โค้ดใหม่):
```ts
if (path === "/api/tracker/fleet-health") {
  const data = await fetchOfficeFleetHealth();
  return jsonResponse(data);
}
```

---

## 📋 ขั้นตอนการ Deploy & Verify สำหรับ pa Oracle

```bash
# 1. คัดลอกไฟล์เอนจินบริการไปยัง scripts/ ใน repo pa-Oracle v2
cp deliverables/tracker-fleet-health/handleFleetHealth-new.ts "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/fleet-health-service.ts"

# 2. แก้ไข scripts/tracker-api.ts ตามคู่มือข้างต้น

# 3. รันเทสเซิร์ฟเวอร์
cd "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2"
bun scripts/tracker-api.ts

# 4. Verify ผลลัพธ์ด้วย curl
curl -s http://localhost:4199/api/tracker/fleet-health | jq .summary
# ผลลัพธ์ที่ถูกต้อง: { "alive": 3, "idle": 0, "busy": 0, "dead": 14, "stuck": 0, "unknown": 0 }

curl -s http://localhost:4199/api/tracker/agents | jq '.[0..2]'
# ผลลัพธ์ที่ถูกต้อง: 3 เอเจนต์แรก (pa-oracle, nasri-oracle, wy-oracle) มี state: "alive"

# 5. เปิดหน้า http://localhost:4000/tracker
# Section Fleet Health จะแสดงป้ายสีเขียว 3/17 พร้อมแสดงสถานะ "standby (not booted)" สำหรับ 14 เอเจนต์ที่เหลืออย่างถูกต้อง
```
