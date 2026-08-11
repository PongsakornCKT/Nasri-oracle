# Patch Guide: Auto-Update Audit Log Fix (#AuditLogFix)

**Target File**: `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/tracker-api.ts`  
**Target Functions**: 
1. `handleArchiveDoneMilestones` (บรรทัดที่ 1012)
2. `handleAutoUpdateStatus` (บรรทัดที่ 1560)
3. `handleAuditLog` (บรรทัดที่ 1720)

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 🎯 สรุปการแก้ไข

- **ปัญหา**: หน้า Tracker UI เรียก `/api/tracker/audit-log?days=7` แล้วได้ `[]` (ว่างเปล่า)
- **สาเหตุ**:
  1. `handleArchiveDoneMilestones` และการเก็บคลัง ไม่เคยเขียนบันทึก Agora Log เลยเมื่อทำการ archive
  2. `handleAutoUpdateStatus` เขียนบันทึกเฉพาะตอนที่เปลี่ยนสถานะ `ACTIVE` -> `DONE`/`STALE` เท่านั้น
  3. `handleAuditLog` กรอง topic แคบเกินไป และไม่มี fallback เมื่อ Agora logs ไม่มี entry
- **การแก้ไข**:
  1. บันทึก Agora Event ทุกครั้งที่มีการ Archive หรือเปลี่ยนสถานะ Milestone
  2. ปรับปรุงเอนจิน `getAuditTrail(days)` ให้ดึงบันทึกย้อนหลังพร้อมรองรับ Fallback ทำให้ `/api/tracker/audit-log` ไม่ว่างเปล่าอีกต่อไป

---

## 1. การแก้ไขใน `scripts/tracker-api.ts`

### (ก) เพิ่ม Import ใน `scripts/tracker-api.ts`
```ts
import { logAuditEvent, getAuditTrail } from "./audit-log-service";
```

### (ข) เพิ่มการบันทึก Log ใน `handleArchiveDoneMilestones` (บรรทัดที่ 1041)

#### BEFORE:
```ts
1041: if (archived > 0) await writeFileAtomic(filePath, rebuilt);
1042: });
1043: }
1044: return jsonResponse({ ok: true, projectId: body.projectId, archived });
```

#### AFTER:
```ts
if (archived > 0) {
  await writeFileAtomic(filePath, rebuilt);
  await logAuditEvent([
    {
      projectId: body.projectId,
      phase: "ALL_DONE",
      previousStatus: "DONE",
      newStatus: "ARCHIVED",
      reason: `Archive Done Milestones: ${archived} phase(s)`
    }
  ], `Archived ${archived} done milestone(s) for ${body.projectId}`, "archive-done-milestones");
}
```

### (ค) ปรับเปลี่ยนฟังก์ชัน `handleAuditLog` (บรรทัดที่ 1720)

#### BEFORE:
```ts
1720: async function handleAuditLog(url: URL): Promise<Response> {
1721:   const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") || 7)));
1722:   const out: any[] = [];
1723:   ...
```

#### AFTER:
```ts
async function handleAuditLog(url: URL): Promise<Response> {
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") || 7)));
  const items = await getAuditTrail(days);
  return jsonResponse(items);
}
```

---

## 📋 ขั้นตอนการ Deploy & Verify สำหรับ pa Oracle

```bash
# 1. Copy โมดูลใหม่ไปวางที่ scripts/
cp deliverables/tracker-audit-log-fix/audit-log-service.ts "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/audit-log-service.ts"

# 2. แก้ไข scripts/tracker-api.ts ตามคู่มือข้างต้น

# 3. รันเทสเซิร์ฟเวอร์
cd "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2"
bun scripts/tracker-api.ts

# 4. Verify ด้วย curl
curl -s "http://localhost:4199/api/tracker/audit-log?days=7" | jq .
# Expected: ได้รับรายการ Audit Log ย้อนหลัง ไม่ว่างเปล่า ([]) อีกต่อไป!
```
