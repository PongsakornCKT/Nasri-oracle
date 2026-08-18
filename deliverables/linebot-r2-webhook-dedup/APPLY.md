# R2 — Webhook Redelivery Dedup Guide (#R2)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/webhook-dedup.js` (ใหม่), `app.js`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ป้องกัน Webhook Redelivery ซ้ำ (Idempotency)**:
   - เมื่อ LINE ส่งสัญญาณ Webhook ซ้ำจากการหลุดของการเชื่อมต่อ (Network Retry/Redelivery) ระบบจะตรวจ `webhookEventId` กับตาราง SQLite `processed_events`
   - หากพบว่า `webhookEventId` เคยประมวลผลแล้ว ระบบจะข้ามการทำงานทันทีเพื่อป้องกันการออกเอกสารซ้ำ หรือตอบคำถามซ้ำ
2. **ระบบ TTL Cleanup 7 วัน**:
   - ลบประวัติ `webhookEventId` ที่เก่าเกิน 7 วันโดยอัตโนมัติ เพื่อป้องกันตารางโตเกินความจำเป็น

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/webhook-dedup.js`

```bash
cp deliverables/linebot-r2-webhook-dedup/lib/webhook-dedup.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/webhook-dedup.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// R2 (#R2): Webhook redelivery dedup engine
var _webhookDedup = require('./lib/webhook-dedup')({
  sqlitePath: SQLITE_PATH,
  ttlDays: 7
});
```

---

### Step 3: แทรกตรวจจับ `webhookEventId` ใน Event Loop ของ `app.js` (ประมาณบรรทัด 3340)

#### BEFORE Context:
```javascript
  events.forEach(function(ev) {
    handleEvent(ev).catch(function(e) {
```

#### AFTER Replacement:
```javascript
  events.forEach(function(ev) {
    // R2 (#R2): Webhook redelivery deduplication check
    var eventId = ev.webhookEventId || (ev.source && ev.source.userId ? ev.source.userId + '_' + ev.timestamp : null);
    if (eventId && _webhookDedup.isDuplicateAndRecord(eventId, ev.type)) {
      console.log('[webhook-dedup] Duplicate event ignored: ' + eventId);
      return;
    }

    handleEvent(ev).catch(function(e) {
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-r2-webhook-dedup
node test-r2.js
```
