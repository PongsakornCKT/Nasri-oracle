# Audit Log & Agora Writer Complete Fix Guide (#AuditLogCompleteFix)

**Target Files**: 
1. `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/tracker-api.ts`
2. `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio/tracker.html`

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 🔍 ผลการสืบสวนรหัสโค้ด (Code Audit & Root Cause Analysis)

1. **ทำไม `/api/tracker/audit-log` ถึงได้ `[]` (ว่างเปล่า)**:
   - **`handleArchiveDoneMilestones` (บรรทัดที่ 1012)** และ **`dailyArchiveCompleted` (บรรทัดที่ 2160)** ทำการปรับปรุงไฟล์ `MILESTONES.md` ให้ติดป้าย `**Archived**: true` แต่ **ไม่ได้เขียน Agora Event เลย** แม้แต่รายการเดียว
   - **`handleAutoUpdateStatus` (บรรทัดที่ 1560)** จะเขียน Agora Event เฉพาะเมื่อมีรายการเปลี่ยนสถานะ `ACTIVE` -> `DONE`/`STALE` เท่านั้น หากไม่มีการเปลี่ยนสถานะในรอบการตรวจ 2 นาทีนั้น จะไม่มีการเขียน Event ใดๆ
   - **`handleAuditLog` (บรรทัดที่ 1720)** อ่านเฉพาะ `e.topic === "auto-update-status"` แต่เมื่อไม่มี Event ถูกบันทึก คำตอบจึงได้ `[]`

2. **การทำงานของปุ่ม ↩ Undo (`handleRevert`)**:
   - `POST /api/tracker/revert` มีอยู่จริงในระบบ (บรรทัดที่ 1766) โดยทำการเปลี่ยนสถานะกลับเป็น `${toStatus} <!-- no-auto -->` (เพื่อไม่ให้ auto-loop ปรับกลับ) และบันทึก Agora Event `content: "↩ Manual revert..."` เรียบร้อยแล้ว

---

## ⚠️ คำเตือนเรื่อง String Escape (บทเรียนจาก `play-fix`)

> **IMPORTANT TRIPWIRE**:  
> เมื่อทำการคัดลอก/เขียนสตริงคำสั่งข้ามไฟล์ใน bash/WSL หรือ Bun script ระวังปัญหาการหลุดอักขระขึ้นบรรทัดใหม่ `\n` ในข้อความสคริปต์ ให้ใช้ `JSON.stringify()` หรือใช้ `appendFile` โดยตรงเสมอ ห้ามเขียนสตริงแบบ concat ด้วย `\n` ดิบๆ ใน shell execution

---

## 1. การแก้ไขใน `scripts/tracker-api.ts`

### (ก) เพิ่ม Import ใน `scripts/tracker-api.ts`
```ts
import { writeAgoraAuditEvent, handleAuditLogEngine, recordAutoUpdateScan } from "./audit-log-service";
```

### (ข) เพิ่มการเขียน Agora Log ใน `handleArchiveDoneMilestones` (บรรทัดที่ 1041)

```ts
// BEFORE (บรรทัดที่ 1041):
if (archived > 0) await writeFileAtomic(filePath, rebuilt);

// AFTER:
if (archived > 0) {
  await writeFileAtomic(filePath, rebuilt);
  await writeAgoraAuditEvent([
    {
      projectId: body.projectId,
      phase: "ALL_DONE",
      previousStatus: "DONE",
      newStatus: "ARCHIVED",
      reason: `Archive Done Milestones: ${archived} phase(s)`
    }
  ], `Archived ${archived} done milestone(s) for ${body.projectId}`, "tracker-api");
}
```

### (ค) ปรับปรุง `handleAutoUpdateStatus` (บรรทัดที่ 1560 & 1700)

```ts
// BEFORE (บรรทัดที่ 1560):
async function handleAutoUpdateStatus(): Promise<Response> {
  const projects = await listProjects(true);
  ...

// AFTER:
async function handleAutoUpdateStatus(): Promise<Response> {
  recordAutoUpdateScan(); // บันทึก timestamp การสแกนรอบล่าสุด
  const projects = await listProjects(true);
  ...
```

### (ง) ปรับปรุง `handleAuditLog` (บรรทัดที่ 1720)

```ts
// BEFORE (บรรทัดที่ 1720):
async function handleAuditLog(url: URL): Promise<Response> {
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") || 7)));
  const out: any[] = [];
  ...

// AFTER:
async function handleAuditLog(url: URL): Promise<Response> {
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") || 7)));
  const resData = await handleAuditLogEngine(days);
  return jsonResponse(resData);
}
```

---

## 2. การปรับปรุง Frontend UX ใน `oracle-studio/tracker.html` (Case-Study #10)

### ปรับเปลี่ยน `loadAuditTrail` ใน `oracle-studio/tracker.html` (บรรทัดที่ 2379-2384)

#### BEFORE (บรรทัดที่ 2382-2384):
```js
2382:     var data = await fetchAPI('/api/tracker/audit-log?days=7');
2383:     if (data === null) { el.innerHTML = '<div style="font-size:11px;color:var(--red)">⚠ offline</div>'; return; }
2384:     if (!data.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text-dim)">ไม่มีการเปลี่ยนสถานะอัตโนมัติใน 7 วัน</div>'; return; }
```

#### AFTER:
```js
    var raw = await fetchAPI('/api/tracker/audit-log?days=7');
    if (raw === null) { el.innerHTML = '<div style="font-size:11px;color:var(--red)">⚠ offline</div>'; return; }

    var items = Array.isArray(raw) ? raw : (raw.items || []);
    var checkedTime = (raw && raw.formattedCheckedTime) ? raw.formattedCheckedTime : (new Date().getHours() + ':' + String(new Date().getMinutes()).padStart(2, '0'));

    if (!items.length) {
      el.innerHTML = '<div style="font-size:11px;color:var(--text-dim)">ยังไม่มีเหตุการณ์ 7 วันล่าสุด · ตรวจล่าสุด ' + esc(checkedTime) + '</div>';
      return;
    }
```

---

## 📋 ขั้นตอนการ Deploy & Verify สำหรับ pa Oracle

```bash
# 1. คัดลอกไฟล์บริการใหม่ไปวางที่ scripts/
cp deliverables/tracker-audit-log/handleAuditLog-new.ts "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/audit-log-service.ts"

# 2. แก้ไข scripts/tracker-api.ts และ oracle-studio/tracker.html ตามคู่มือข้างต้น

# 3. รันเทสเซิร์ฟเวอร์
cd "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2"
bun scripts/tracker-api.ts

# 4. Verify ด้วย curl
curl -s "http://localhost:4199/api/tracker/audit-log?days=7" | jq .

# Expected Response:
# {
#   "items": [...],
#   "lastCheckedAt": "2026-08-11T18:38:00.000Z",
#   "formattedCheckedTime": "18:38"
# }

# 5. ทดสอบปุ่ม ↩ Undo (revert)
curl -X POST http://localhost:4199/api/tracker/revert \
  -H "Content-Type: application/json" \
  -d '{"projectId":"p-maw-office","phase":"27","toStatus":"ACTIVE"}'
# Expected: {"ok": true}
```
