# W2 — FastAPI Persistent Socket Bridge Guide (#Phase04)

**Target Repository**: `ai.enervia.co.th` / `pa-Oracle v2` (`ψ/active/qsolar/ai.enervia.co.th/`)  
**Target Files**: `lib/qsolar-socket-client.js` (ใหม่), `app.js`  
**Grep Verified Line Numbers**: `app.js:205-218` (`_pythonBridge` initialization)  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-12  

---

## 🎯 สรุปสิ่งที่ทำ

1. **สร้าง Client เชื่อมต่อ FastAPI Persistent Socket (`qsolar-socket-client.js`)**:
   - รองรับการเชื่อมต่อผ่าน Unix Domain Socket `/tmp/qsolar.sock`
   - รองรับ Endpoints: `/health`, `/install_lines`, `/bom_generate`
   - ระบบสุนัขเฝ้าบ้าน (Watchdog): หาก Socket ล่ม หลุด หรือตอบสนองช้าเกินกว่า 3000ms จะคืนค่า `{ ok: false }` เพื่อสลับไปใช้ CLI `spawn` เดิมโดยอัตโนมัติ (Zero Downtime)
2. **กติกาความปลอดภัยขั้นสูงสุด**:
   - **ค่าเริ่มต้นปิดการใช้งาน (Default Disabled)**: ระบบยังคงใช้ `spawn` แบบเดิมเป็นค่าเริ่มต้น 100%
   - สวิตช์เปิดใช้งานต้องตั้งค่า Environment Variable `QSOLAR_USE_SOCKET=1` เท่านั้น (Opt-in)

---

## 📋 ขั้นตอนการ Apply (Step-by-Step Instructions)

### Step 1: คัดลอกไฟล์โมดูลไปยัง `lib/qsolar-socket-client.js`

```bash
cp deliverables/linebot-w2-fastapi-socket-bridge/lib/qsolar-socket-client.js "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/qsolar-socket-client.js"
```

---

### Step 2: แทรกใน `app.js` (ต่อจาก `_pythonBridge` `app.js:205-218` Verified by Grep)

#### BEFORE Context (`app.js:205-218` Verified by Grep):
```javascript
// ─── Python subprocess bridge (lib/python-bridge.js) ─────────
// Spawns mcp-qsolar / mcp-bomsolar via child_process and hands off the
// Google Sheets catalog via stdin — protocol is preserved byte-for-byte.
// `getCatalog` is a hoisted function declaration further down, so the
// closure below resolves it at call time.
var _pythonBridge = require('./lib/python-bridge')({
  __dirname: __dirname,
  getCatalog: function() { return getCatalog(); },
});
var BOMSOLAR_SCRIPT = _pythonBridge.BOMSOLAR_SCRIPT;
var QSOLAR_SCRIPT = _pythonBridge.QSOLAR_SCRIPT;
var generateBomPdf = _pythonBridge.generateBomPdf;
var generateQuotationPdf = _pythonBridge.generateQuotationPdf;
var srpCalcBom = _pythonBridge.srpCalcBom;
```

#### AFTER Replacement:
```javascript
// ─── Python subprocess bridge (lib/python-bridge.js) ─────────
// Spawns mcp-qsolar / mcp-bomsolar via child_process and hands off the
// Google Sheets catalog via stdin — protocol is preserved byte-for-byte.
// `getCatalog` is a hoisted function declaration further down, so the
// closure below resolves it at call time.
var _pythonBridge = require('./lib/python-bridge')({
  __dirname: __dirname,
  getCatalog: function() { return getCatalog(); },
});
var BOMSOLAR_SCRIPT = _pythonBridge.BOMSOLAR_SCRIPT;
var QSOLAR_SCRIPT = _pythonBridge.QSOLAR_SCRIPT;
var generateBomPdf = _pythonBridge.generateBomPdf;
var generateQuotationPdf = _pythonBridge.generateQuotationPdf;
var srpCalcBom = _pythonBridge.srpCalcBom;

// W2 (#Phase04): FastAPI Persistent Unix Socket Client (Opt-in via QSOLAR_USE_SOCKET=1, default spawn fallback)
var _qsolarSocketClient = require('./lib/qsolar-socket-client')({
  socketPath: process.env.QSOLAR_SOCKET_PATH || '/tmp/qsolar.sock'
});
```

---

## 🧪 การรัน Test Verification

```bash
cd deliverables/linebot-w2-fastapi-socket-bridge
node test-w2.js
```
