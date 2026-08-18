# Milestone ▶ Play Button → pa-dispatch (Option A / ข้อ ก.) Apply Guide for pa Oracle

**Target Files**: 
1. `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/tracker-api.ts` (Backend `handlePlay`)
2. `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio/tracker.html` (Frontend `playMilestone`)

**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 🎯 วัตถุประสงค์ตามกติกาใหม่ (Option A / ข้อ ก.)

แก้ไขพฤติกรรมปุ่ม ▶ Play บน Milestones:
- **เดิม**: ยิงงานตรงหาเอเจนต์ และเรียก `maw wake` ปลุกเอเจนต์ทันที (ขัดกติกาใหม่)
- **ใหม่ (ข้อ ก.)**: เปลี่ยนเป็นการบันทึกงานเข้าคิว `pa-dispatch` ใน Agora JSONL เพื่อรอ pa วางแผน (`pa plan`) และสั่งการตามลำดับ **โดยห้ามสั่ง `maw wake` ปลุกเอเจนต์ฝั่ง engi โดยไม่ได้รับคำสั่งจากพี่พง**

---

## 1. การแก้ไข Backend ใน `scripts/tracker-api.ts` (บรรทัดที่ 1166-1297)

### (ก) โค้ดใหม่ของ `handlePlay`
แทนที่ส่วนที่สองของ `handlePlay` (ตั้งแต่การอ่าน `PLAN.md` และสั่ง `maw wake` / `maw send`) ด้วยการเขียนลง `pa-dispatch` ใน Agora:

```ts
async function handlePlay(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || !body.projectId || !body.phase)
    return errorResponse("projectId and phase required", 400);
  if (!isSafeSegment(body.projectId) || !isSafeSegment(body.phase))
    return errorResponse("invalid projectId or phase", 400);

  const result = await updateMilestoneStatus(body.projectId, body.phase, "ACTIVE");
  if (!result.ok) return errorResponse(result.error || "Failed", 500);

  // Option A (ข้อ ก.): Enqueue to pa-dispatch (NO direct maw wake)
  const phaseName = body.name ? ` — ${body.name}` : "";
  const ownerInfo = body.owner ? ` [Target: ${body.owner}]` : "";
  const taskText = `Phase ${body.phase}${phaseName} (${body.projectId})${ownerInfo}`;

  const today = todayString();
  const entry = {
    from: "tracker-ui",
    to: "pa-oracle",
    topic_id: "pa-dispatch",
    category: "dispatch",
    title: "TRACKER PLAY DISPATCH",
    type: "event",
    ts: Date.now(),
    content: `[tracker] EXECUTE: ${taskText}`
  };

  for (const agoraDir of AGORA_DIRS) {
    try {
      await appendFile(join(agoraDir, `${today}.jsonl`), JSON.stringify(entry) + "\n");
      break;
    } catch {}
  }

  return jsonResponse({
    ok: true,
    status: "ACTIVE",
    queued: true,
    message: `Phase ${body.phase} queued to pa-dispatch (no direct maw wake)`
  });
}
```

### (ข) บริบทจริงก่อน Apply (BEFORE APPLY Context) จาก `scripts/tracker-api.ts` (บรรทัดที่ 1166-1175)
```ts
1166: async function handlePlay(req: Request): Promise<Response> {
1167:   const body = await req.json().catch(() => null);
1168:   if (!body || !body.projectId || !body.phase)
1169:     return errorResponse("projectId and phase required", 400);
1170:   if (!isSafeSegment(body.projectId) || !isSafeSegment(body.phase))
1171:     return errorResponse("invalid projectId or phase", 400);
1172: 
1173:   const result = await updateMilestoneStatus(body.projectId, body.phase, "ACTIVE");
1174:   if (!result.ok) return errorResponse(result.error || "Failed", 500);
```

---

## 2. การแก้ไข Frontend ใน `oracle-studio/tracker.html` (บรรทัดที่ 1955-1960)

### (ก) บรรทัดจริงก่อน Apply ใน `tracker.html` (บรรทัดที่ 1955-1959)
```js
1955:     if (res && res.ok) {
1956:       btn.textContent = '\u2713 Started';
1957:       btn.className = 'ctrl-btn ctrl-pause';
1958:       // Refresh data after 1s
1959:       setTimeout(function() { refreshAll(); closeModal(); }, 800);
```

### (ข) ปรับการแสดงผลข้อความบนปุ่ม
เปลี่ยน `btn.textContent = '✓ Started'` เป็น `btn.textContent = '✓ Queued to pa'` เพื่อสะท้อนพฤติกรรมจริงว่างานถูกยิงเข้าคิว `pa-dispatch` แล้ว

---

## 📋 ขั้นตอนการ Verify สำหรับ pa Oracle

```bash
# 1. รันสโมกเทสโมดูล Option A
bun deliverables/tracker-play-dispatch/handle-play-dispatch.ts

# 2. ปรับโค้ดใน scripts/tracker-api.ts และ tracker.html ตามคู่มือข้างต้น

# 3. Verify ในระบบจริง
# เปิดหน้า http://localhost:4000/tracker
# กดปุ่ม ▶ บน Milestone ใดๆ
# การ์ด Execution Queue (Phase 2) จะแสดงรายการงานพุ่งเข้าคิว pa-dispatch ทันที ปราศจากการปลุกเอเจนต์ engi
```
