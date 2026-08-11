# Patch Guide: Milestones ▶ Play → pa-dispatch Queue Fix (#OptionA)

**Target File**: `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/tracker-api.ts`  
**Target Function**: `handlePlay(req: Request): Promise<Response>` (บรรทัดที่ 1166-1297)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 🎯 สรุปการแก้ไข

- **คงไว้**: `updateMilestoneStatus(body.projectId, body.phase, "ACTIVE")` + การอ่านย่อความ `PLAN.md` (ไม่เกิน 500 อักขระ)
- **ตัดออก**: บล็อก `resolveTarget`, การรัน `Bun.spawn` ด้วย `maw hey`, และการ retry `maw wake` (ยกเลิกการปลุกเอเจนต์ฝั่ง engi โดยตรง)
- **เพิ่มเข้าไป**: บันทึก Agora Event ลงไฟล์ JSONL ประจำวัน ในฟอร์แมตเดียวกับ `handleExecute`:
  ```json
  {
    "from": "tracker-ui",
    "to": "pa-oracle",
    "topic_id": "pa-dispatch",
    "category": "dispatch",
    "title": "TRACKER PLAY",
    "type": "event",
    "ts": 1786446600000,
    "content": "[tracker] PLAY: Phase 02 — Fleet Heartbeat Probe | project: p-maw-office | suggested-owner: nasri-oracle | PLAN: ..."
  }
  ```
- **Response**: คืนค่า `{ ok: true, status: "ACTIVE", queued: true, delegated: ["pa-oracle (dispatch-queue)"] }` เพื่อให้ UI (`playMilestone` ใน `tracker.html`) ทำงานปกติ ปราศจากข้อผิดพลาด

---

## 1. เปรียบเทียบ BEFORE / AFTER Diff

### (ก) โค้ดเดิม (BEFORE) ใน `scripts/tracker-api.ts` (บรรทัดที่ 1166-1297)
```ts
async function handlePlay(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || !body.projectId || !body.phase)
    return errorResponse("projectId and phase required", 400);
  if (!isSafeSegment(body.projectId) || !isSafeSegment(body.phase))
    return errorResponse("invalid projectId or phase", 400);

  const result = await updateMilestoneStatus(body.projectId, body.phase, "ACTIVE");
  if (!result.ok) return errorResponse(result.error || "Failed", 500);

  // Read PLAN.md for detail to send to agent
  let planDetail = "";
  for (const dir of ACTIVE_DIRS) {
    for (const sub of [`phase-${body.phase}`, `phase-${body.phase.toLowerCase()}`]) {
      const c = await safeReadFile(join(dir, body.projectId, sub, "PLAN.md"));
      if (c) { planDetail = c; break; }
    }
    if (planDetail) break;
  }

  // [ตัดออกทั้งหมด] บล็อก resolveTarget, Bun.spawn maw hey, maw wake, HTTP /api/send, thread writing, และ agora entry แบบเดิม
  ...
}
```

### (ข) โค้ดใหม่ (AFTER) วางทับทั้งฟังก์ชัน `handlePlay`
*(ดูฉบับสมบูรณ์ได้ในไฟล์ [`deliverables/tracker-play-fix/handlePlay-new.ts`](file:///mnt/c/Users/pO-Ch/Documents/GitHub/nasri-oracle/deliverables/tracker-play-fix/handlePlay-new.ts))*

```ts
async function handlePlay(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || !body.projectId || !body.phase)
    return errorResponse("projectId and phase required", 400);
  if (!isSafeSegment(body.projectId) || !isSafeSegment(body.phase))
    return errorResponse("invalid projectId or phase", 400);

  const result = await updateMilestoneStatus(body.projectId, body.phase, "ACTIVE");
  if (!result.ok) return errorResponse(result.error || "Failed", 500);

  // Read PLAN.md snippet (<= 500 chars)
  let planDetail = "";
  for (const dir of ACTIVE_DIRS) {
    for (const sub of [`phase-${body.phase}`, `phase-${body.phase.toLowerCase()}`]) {
      const c = await safeReadFile(join(dir, body.projectId, sub, "PLAN.md"));
      if (c) { planDetail = c; break; }
    }
    if (planDetail) break;
  }

  const planSnippet = planDetail ? ` | PLAN: ${planDetail.replace(/[\r\n]+/g, " ").substring(0, 500)}` : "";
  const taskContent = `[tracker] PLAY: Phase ${body.phase} — ${body.name || ""} | project: ${body.projectId} | suggested-owner: ${body.owner || ""}${planSnippet}`;

  // Write event to Agora JSONL (same mechanism as handleExecute)
  const today = todayString();
  const entry = {
    from: "tracker-ui",
    to: "pa-oracle",
    topic_id: "pa-dispatch",
    category: "dispatch",
    title: "TRACKER PLAY",
    type: "event",
    ts: Date.now(),
    content: taskContent,
  };

  for (const agoraDir of AGORA_DIRS) {
    try {
      await appendFile(join(agoraDir, `${today}.jsonl`), JSON.stringify(entry) + "\n");
      break;
    } catch {}
  }

  const delegated = ["pa-oracle (dispatch-queue)"];
  return jsonResponse({
    ok: true,
    status: "ACTIVE",
    queued: true,
    delegated,
    message: `Phase ${body.phase} queued to pa-dispatch`
  });
}
```

---

## 📋 ขั้นตอนการ Test สำหรับ pa Oracle

```bash
# 1. รัน tracker-api บนพอร์ต 4199
cd "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2"
bun scripts/tracker-api.ts

# 2. ยิง curl ทดสอบ POST /api/tracker/play
curl -X POST http://localhost:4199/api/tracker/play \
  -H "Content-Type: application/json" \
  -d '{"projectId":"pa-Oracle v2","phase":"02","name":"Heartbeat Monitor","owner":"nasri-oracle"}'

# Expected HTTP 200 Response:
# {
#   "ok": true,
#   "status": "ACTIVE",
#   "queued": true,
#   "delegated": ["pa-oracle (dispatch-queue)"],
#   "message": "Phase 02 queued to pa-dispatch"
# }

# 3. ตรวจสอบ Agora JSONL วันนี้
tail -n 1 "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/inbox/agora/$(date +%Y-%m-%d).jsonl"
# จะต้องเห็น entry "[tracker] PLAY: Phase 02 — Heartbeat Monitor..."

# 4. ยืนยันว่าไม่มีการปลุกเอเจนต์
# จะต้องไม่มี process `maw wake` หรือ `maw hey` ถูกเรียกทำงานในระบบ
```
