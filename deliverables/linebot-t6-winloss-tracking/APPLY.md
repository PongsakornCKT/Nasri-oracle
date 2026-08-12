# T6 — Win/Loss Deal Tracking Guide (#B9)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/winloss-tracker.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:3305` (ในคำสั่ง Admin LINE)  
**Business Decision (พี่พงเคาะ B9)**: หมวดเหตุผลแพ้ 4 หมวดเป๊ะ (**แพง / คู่แข่ง / เลื่อน / อื่นๆ**)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **ระบบบันทึก Win/Loss และหมวดเหตุผล (`winloss-tracker.js`)**:
   - รองรับคำสั่งปิดงาน:
     - `"ปิดงาน <QT id> ได้งาน"` ➔ บันทึก `status = 'win'`
     - `"ปิดงาน <QT id> ไม่ได้ <เหตุผล>"` ➔ บันทึก `status = 'loss'` พร้อมจัดหมวดเหตุผลเป็น 4 หมวดตามสั่งพี่พง (**แพง / คู่แข่ง / เลื่อน / อื่นๆ**) และเก็บข้อความดั้งเดิมใน `reason_note`
2. **คำสั่ง Admin "close rate" สรุปจากข้อมูลจริงใน SQLite**:
   - คืนค่าอัตราปิดการขาย (Close Rate %) และสรุปสถิติเหตุผลการแพ้จากตาราง SQLite `qt_outcomes` จริง **โดยตัดตัวเลขสถิติปลอม 0.72 เดิมออกถาวร**

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/winloss-tracker.js`

```bash
cp deliverables/linebot-t6-winloss-tracking/lib/winloss-tracker.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/winloss-tracker.js"
```

---

### Step 2: แทรกใน `app.js` (ประมาณบรรทัด 866)

```javascript
// T6 (#B9): Win/loss deal tracking engine (P'Phong decision B9: 4 reason categories)
var _winLossTracker = require('./lib/winloss-tracker')({
  sqlitePath: SQLITE_PATH
});
```

---

### Step 3: แทรกคำสั่ง LINE ปิดงาน และ "close rate" ใน `app.js` (บรรทัด 3305 Verified by Grep)

```javascript
  // T6 (#B9): Win/Loss deal tracking command
  var _closeM = lo.match(/^ปิดงาน\s+(.+?)\s+(ได้งาน|ไม่ได้(?:\s+(.+))?)$/i);
  if (_closeM) {
    var _closeQtId = _closeM[1].trim();
    var _closeType = _closeM[2].trim().toLowerCase();
    var _closeReason = _closeM[3] ? _closeM[3].trim() : '';

    var _isWin = _closeType === 'ได้งาน';
    var _recRes = _winLossTracker.recordOutcome(_closeQtId, _isWin ? 'win' : 'loss', _closeReason, _userId);

    if (_recRes.ok) {
      if (_isWin) {
        await rText(rt, '🎉 บันทึกปิดงานสำเร็จ! ใบเสนอราคา ' + _closeQtId + ' (ปิดงานสำเร็จ)');
      } else {
        await rText(rt, '📝 บันทึกปิดงานเรียบร้อย: ' + _closeQtId + '\n• หมวดเหตุผล: ' + _recRes.category + (_recRes.note ? '\n• รายละเอียด: ' + _recRes.note : ''));
      }
    } else {
      await rText(rt, '❌ เกิดข้อผิดพลาดในการบันทึก: ' + _recRes.error);
    }
    return;
  }

  // T6 (#B9): Admin "close rate" summary command from real SQLite data
  if (/^close\s*rate$/i.test(lo)) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    var _crStats = _winLossTracker.getCloseRateSummary();
    var _crReply = '📊 สรุป อัตราการปิดการขาย (Close Rate Report)\n━━━━━━━━━━━━━━━━━━━━\n';
    _crReply += '• เสนอราคาทั้งหมด: ' + _crStats.total + ' รายการ\n';
    _crReply += '• ปิดงานได้ (Win): ' + _crStats.wins + ' รายการ\n';
    _crReply += '• ไม่ได้งาน (Loss): ' + _crStats.losses + ' รายการ\n';
    _crReply += '• อัตราปิดงานสำเร็จ: ' + _crStats.close_rate_pct + '%\n\n';
    _crReply += '🏷️ สรุปสาเหตุที่ไม่ลุล่วง (Loss Categories):\n';
    _crReply += '   - 💰 ราคาแพง: ' + (_crStats.category_breakdown['แพง'] || 0) + ' รายการ\n';
    _crReply += '   - ⚔️ เสียให้คู่แข่ง: ' + (_crStats.category_breakdown['คู่แข่ง'] || 0) + ' รายการ\n';
    _crReply += '   - ⏳ เลื่อนโครงการ: ' + (_crStats.category_breakdown['เลื่อน'] || 0) + ' รายการ\n';
    _crReply += '   - 📌 อื่นๆ: ' + (_crStats.category_breakdown['อื่นๆ'] || 0) + ' รายการ\n';
    _crReply += '━━━━━━━━━━━━━━━━━━━━\nรายงานจากฐานข้อมูลจริง nasri.sqlite';
    await rText(rt, _crReply.trim());
    return;
  }
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-t6-winloss-tracking
node test-t6.js
```
