/**
 * Nasri LINE OA Bot — Node.js + Phusion Passenger (Plesk)
 * CommonJS, zero dependencies, Passenger-compatible.
 * v2.0.0 — Rate limiting + Audit log + Admin notify + QT history
 *
 * Triggers: "นัด" / "nasri" / "ไอ่นัด" → Nasri wakes up
 * BOM: "bom" / "ขอbom" / "solar" → auto-build from catalog (Google Sheets)
 * PDF: "pdf" / "ขอpdf" / "สร้างpdf" / "file pdf" → generate PDF from last BOM
 * QT: "ทำใบเสนอราคา [brand] [kW] [phase]" → generate quotation PDF
 * History: "ดูใบเสนอราคาของฉัน" → list personal QT history
 *
 * Smart parsing: "atmoce 5kw 1phase แผง JA625 + batt + backup"
 *   → auto-lookup catalog, calculate quantities, build BOM
 *
 * Env (new in v2.0):
 *   ADMIN_LINE_USER_ID  — LINE userId to receive new-QT notifications
 *   RATE_LIMIT_MAX_QT   — max quotations per user per day (default 20)
 *   RATE_LIMIT_MAX_BOM  — max BOM auto-builds per user per day (default 30)
 *   BASE_URL            — public URL base (default https://ai.enervia.co.th)
 */
'use strict';

// Build marker — bump on each deploy so prod can be probed via /__build to confirm Passenger reloaded.
var BUILD_MARKER = '2026-04-29-sheet-sync';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Enervia v2.5 Archive + Catalog libs ──────────────────────
// archive-api: serves /api/archive* (doc list + PDF stream)
// archive-catalog-api: serves /api/v2/catalog* (equipment catalog)
//   NOTE: /api/catalog is the existing admin-only Google Sheets endpoint (sobek).
//   New equipment catalog uses /api/v2/catalog to avoid conflict.
// basic-auth: HTTP Basic Auth gate for archive + catalog routes
var _archiveApi = require('./lib/archive-api');
var _archiveCatalogApi = require('./lib/archive-catalog-api');
var _basicAuth = require('./lib/basic-auth');

// ─── Passenger ────────────────────────────────────────────────
if (typeof PhusionPassenger !== 'undefined') {
  PhusionPassenger.configure({ autoInstall: false });
}

// ─── Load .env ────────────────────────────────────────────────
(function loadEnv() {
  try {
    var envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      var lines = fs.readFileSync(envPath, 'utf8').split('\n');
      lines.forEach(function(line) {
        line = line.trim();
        if (!line || line.charAt(0) === '#') return;
        var eq = line.indexOf('=');
        if (eq < 0) return;
        var key = line.slice(0, eq).trim();
        var val = line.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      });
      console.log('[env] Loaded .env (' + lines.length + ' lines)');
    }
  } catch (e) { console.error('[env] Failed to load .env:', e.message); }
})();

// ─── Config ───────────────────────────────────────────────────
const LINE_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const TMP_DIR = path.join(__dirname, 'tmp');
const BOM_DIR = path.join(__dirname, 'boms');
// LEGACY: bom-index.json — kept as backup after SQLite migration (Task #16).
// SQLite at BOM_DIR/nasri.sqlite is the source of truth. Set USE_LEGACY_JSON=1
// to re-enable dual writes during the 1-week migration safety window.
const BOM_INDEX = path.join(BOM_DIR, 'bom-index.json');
const ARCHIVE_DIR = path.join(BOM_DIR, 'archive');
const API = 'https://api.line.me/v2/bot';

// ─── v2.0 additions ───────────────────────────────────────────
const ADMIN_LINE_USER_ID = process.env.ADMIN_LINE_USER_ID || ''; // push notification recipient
// LN9 / INT5: whitelist of LINE userIds that can use admin commands via chat
// Comma-separated in .env: ADMIN_LINE_USER_IDS=Uabc123,Udef456
const ADMIN_LINE_USER_IDS = (process.env.ADMIN_LINE_USER_IDS || ADMIN_LINE_USER_ID)
  .split(',').map(function(s) { return s.trim(); }).filter(Boolean);
// sobek: Admin API Bearer token — required for all /api/* diagnostic+data endpoints
// Set ADMIN_API_TOKEN in .env — if unset, admin endpoints are CLOSED (fail-closed by design)
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || '';
// sobek K1: HMAC-SHA256 signed URL secret — set in .env, fail-closed if unset
const SIGNED_URL_SECRET = process.env.SIGNED_URL_SECRET || '';
const SIGNED_URL_TTL_SEC = 24 * 60 * 60; // 24 hours
const LOG_DIR = path.join(__dirname, 'logs');
// LEGACY: qt-index.json — kept as backup after SQLite migration (Task #16).
const QT_INDEX_PATH = path.join(BOM_DIR, 'qt-index.json');
const RATE_LIMIT_MAX_QT = parseInt(process.env.RATE_LIMIT_MAX_QT || '50', 10);  // max quotations/day/user
const RATE_LIMIT_MAX_BOM = parseInt(process.env.RATE_LIMIT_MAX_BOM || '30', 10); // max BOM auto-builds/day/user
const BASE_URL = process.env.BASE_URL || 'https://ai.enervia.co.th';
const USE_LEGACY_JSON = process.env.USE_LEGACY_JSON === '1'; // dual-write to legacy JSON during migration

// ─── Enervia v2.5: Archive + Catalog + Auth instances ─────────
// DOC_DIR: ~/ai.enervia.co.th/document/  (all PDFs/BOMs post v2.5 migration)
// DB_PATH:  nasri.sqlite (same as SQLITE_PATH below, declared after BOM_DIR)
// Basic Auth: ENERVIA_AUTH_USER + ENERVIA_AUTH_PASS_HASH (bcrypt, prod)
//             or ENERVIA_AUTH_PASS (plain, dev only) — fail-open if unset
var _enerviaDocDir  = path.join(__dirname, 'document');
var _enerviaArchive = _archiveApi({
  DOC_DIR:  _enerviaDocDir,
  DB_PATH:  path.join(__dirname, 'boms', 'nasri.sqlite'),
  BASE_URL: process.env.BASE_URL || 'https://ai.enervia.co.th',
});
var _enerviaArchiveCatalog = _archiveCatalogApi({
  CATALOG_DIR:  process.env.CATALOG_DIR || '',
  CACHE_TTL_MS: 5 * 60 * 1000,
});
var _enerviaAuth = _basicAuth({
  USER:       process.env.ENERVIA_AUTH_USER  || '',
  PASS_HASH:  process.env.ENERVIA_AUTH_PASS_HASH || '',
  PASS_PLAIN: process.env.ENERVIA_AUTH_PASS  || '',
  REALM:      'Enervia Archive',
  PROTECTED:  ['/api/archive', '/api/v2/catalog'],
  AUDIT_LOG:  path.join(__dirname, 'logs', 'auth.log'),
});

// ─── SQLite Persistence (Task #16) ────────────────────────────
// All BOM/QT persistence logic lives in lib/persistence.js now.
// The persistence module is a factory that initialises better-sqlite3
// (or falls back to legacy JSON file mode) and exposes the same function
// names the rest of app.js used to call inline. See lib/persistence.js
// for the implementation — behaviour is byte-identical to before.
const SQLITE_PATH = path.join(BOM_DIR, 'nasri.sqlite');

// In-memory "last BOM per source" map — persistence.saveBom writes into it.
// Declared here so we can pass it to the persistence factory below AND keep
// direct access throughout handleText.
const lastBom = new Map();

// Forward declaration for generateBomHtml + auditLog — persistence.saveBom
// calls them at request time, so we only need the names to resolve *later*.
var _persistence = require('./lib/persistence')({
  BOM_DIR: BOM_DIR,
  TMP_DIR: TMP_DIR,
  BOM_INDEX: BOM_INDEX,
  QT_INDEX_PATH: QT_INDEX_PATH,
  SQLITE_PATH: SQLITE_PATH,
  USE_LEGACY_JSON: USE_LEGACY_JSON,
  lastBom: lastBom,
  // Wrapped in closures so hoisting order doesn't matter — the inner refs
  // are resolved at call time.
  generateBomHtml: function(data) { return generateBomHtml(data); },
  auditLog: function(action, userId, detail) { return auditLog(action, userId, detail); },
});

// Expose the same names the rest of app.js used to define inline.
var sqliteDb = _persistence.sqliteDb;
var sqliteAvailable = _persistence.sqliteAvailable;
var sqliteInitError = _persistence.sqliteInitError;

var loadBomIndex = _persistence.loadBomIndex;
var saveBomIndex = _persistence.saveBomIndex;
var upsertBom = _persistence.upsertBom;
var findBomBySourceAndProject = _persistence.findBomBySourceAndProject;
var searchBoms = _persistence.searchBoms;

// ── v2.1 P4: SQLite-backed rate limiting ─────────────────────
// Replaces rateLimitMap (in-memory Map) — survives process restarts.
// Falls back to Map if sqliteDb is not available (sqliteAvailable = false).
var _rlStore = require('./lib/rate-limit-store')(sqliteAvailable ? sqliteDb : null);

// ── v2.1 P5: BOM result cache (TTL 1h) ──────────────────────
var _bomCacheStore = require('./lib/bom-cache-store')(sqliteAvailable ? sqliteDb : null);

// ─── v2.0 Quotation CRUD bridge (lib/quotation-bridge.js) ────
// Wraps scripts/enervia/quotation-crud.ts via Bun subprocess.
// Persists QT to nasri.sqlite using the v2 schema (migrate-v2.ts).
// Env: BUN_PATH (if bun not in PATH), NASRI_DB_PATH (path to nasri.sqlite).
var qtCrud = require('./lib/quotation-bridge');
var _bomParser = require('./bom-parser');


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

// Pre-spawn persistent Python workers (no-op in spawn mode)
_pythonBridge.init();

// ── v2.1 I3: Start catalog pre-warm — MUST be called after _catalogCacheImpl
//    is constructed (see line ~197). Moved there to fix TDZ-style use-before-init.

// ── v2.1 P5: BOM cache hourly purge ──────────────────────────
var _bomPurgeTimer = setInterval(function() {
  var n = _bomCacheStore.purge();
  if (n > 0) console.log('[bom-cache-store] purged', n, 'expired entries');
}, 60 * 60 * 1000);
if (_bomPurgeTimer.unref) _bomPurgeTimer.unref();

// Graceful shutdown — close persistent workers on process exit
process.on('SIGTERM', function() { _catalogCacheImpl.stopPreWarm(); _pythonBridge.shutdown(); process.exit(0); });
process.on('SIGINT',  function() { _catalogCacheImpl.stopPreWarm(); _pythonBridge.shutdown(); process.exit(0); });
process.on('exit',    function() { _pythonBridge.shutdown(); });

function loadBomData(filename) {
  var fp = path.join(BOM_DIR, filename);
  if (!fs.existsSync(fp)) {
    // Try old tmp dir
    fp = path.join(TMP_DIR, filename);
  }
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) { return null; }
}

// ─── Google Sheets Catalog ───────────────────────────────────
// SHEET_ID must be set via env var — never hardcode (sobek P0 #3, 2026-04-13)
const SHEET_ID = process.env.QSOLAR_SHEET_ID;
if (!SHEET_ID) { throw new Error('[app] QSOLAR_SHEET_ID env var not set — cannot start'); }
const SHEET_GIDS = {
  'Finalprice': 1639151553,
  'Solar Panels': 1094845924, 'Inverters - Huawei': 1605263729,
  'Inverters - Solis': 984571681, 'Inverters - Deye': 1499264869,
  'Inverters - ATMOCE': 1829589831, 'Inverters - Sigenergy': 524887216,
  'Inverters - Hoymiles': 447913208, 'Inverters - Enphase': 1146681998,
  'Batteries': 1623780871, 'Cables': 1682681584,
  'Mounting - Keenoc': 1345585929, 'Optimizers': 1835933691,
  'Combiner Box & Others': 113577748, 'Labor & Fees': 1264003568,
};
// ── v2.1 P3+I3: ETag catalog cache + 5-min TTL + pre-warm ────
var _catalogCacheImpl = require('./lib/catalog-cache')({
  sheetId: SHEET_ID, sheetGids: SHEET_GIDS, ttlMs: 5 * 60 * 1000,
});
// v2.1 I3: start pre-warm now that _catalogCacheImpl is constructed
_catalogCacheImpl.startPreWarm();

function parseCSV(text) {
  var rows = [], row = [], cell = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { cell += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { cell += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { row.push(cell.trim()); cell = ''; }
      else if (c === '\n' || (c === '\r' && text[i+1] === '\n')) {
        if (c === '\r') i++;
        row.push(cell.trim()); cell = '';
        if (row.some(function(v) { return v; })) rows.push(row);
        row = [];
      } else { cell += c; }
    }
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(function(v) { return v; })) rows.push(row); }
  if (!rows.length) return [];
  var headers = rows[0];
  return rows.slice(1).map(function(r) {
    var obj = {};
    headers.forEach(function(h, idx) { obj[h] = (r[idx] || '').trim(); });
    return obj;
  });
}

// fetchSheet: kept for any direct GID callers; does NOT use ETag cache
async function fetchSheet(gid) {
  var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&gid=' + gid;
  try {
    var r = await fetch(url, { headers: { 'User-Agent': 'NasriBot/2.1' } });
    if (!r.ok) return [];
    return parseCSV(await r.text());
  } catch (e) { console.error('[sheet]', gid, e.message); return []; }
}

// getCatalog — v2.1 P3+I3: delegates to catalog-cache (ETag + pre-warm)
async function getCatalog() { return _catalogCacheImpl.get(); }

function searchCatalog(catalog, query) {
  var q = query.toLowerCase();
  var matches = [];
  Object.keys(catalog).forEach(function(sheet) {
    catalog[sheet].forEach(function(row) {
      var text = Object.values(row).join(' ').toLowerCase();
      if (text.indexOf(q) >= 0) {
        var m = Object.assign({}, row);
        m._sheet = sheet;
        matches.push(m);
      }
    });
  });
  return matches;
}

function extractPrice(row) {
  var keys = Object.keys(row);
  // Priority 1: columns with "฿" in header (explicit price columns)
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf('฿') >= 0 && k.toLowerCase().indexOf('ราคาสั่งซื้อ') >= 0) {
      var v = parseFloat(String(row[k]).replace(/[,฿บาท\s]/g, ''));
      if (v > 0) return v;
    }
  }
  // Priority 2: short header with "ราคาสั่งซื้อ" (not the long title header)
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.length < 30 && k.toLowerCase().indexOf('ราคาสั่งซื้อ') >= 0) {
      var v = parseFloat(String(row[k]).replace(/[,฿บาท\s]/g, ''));
      if (v > 0) return v;
    }
  }
  // Priority 3: columns with "ราคา" + "฿" in header
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf('฿') >= 0 && k.toLowerCase().indexOf('ราคา') >= 0) {
      var v = parseFloat(String(row[k]).replace(/[,฿บาท\s]/g, ''));
      if (v > 0) return v;
    }
  }
  // Priority 4: any short "ราคา" column
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.length < 30 && k.toLowerCase().indexOf('ราคา') >= 0) {
      var v = parseFloat(String(row[k]).replace(/[,฿บาท\s]/g, ''));
      if (v > 0) return v;
    }
  }
  return 0;
}

function extractField(row, keywords) {
  var keys = Object.keys(row);
  for (var i = 0; i < keys.length; i++) {
    var kl = keys[i].toLowerCase();
    for (var j = 0; j < keywords.length; j++) {
      if (kl.indexOf(keywords[j]) >= 0 && row[keys[i]]) return row[keys[i]];
    }
  }
  return '';
}

// ─── LINE helpers (lib/line-api.js) ──────────────────────────
// Factory takes a getter for LINE_TOKEN so the module always reads the
// latest value (tests can monkey-patch, hot-reload still works, etc).
var _lineApi = require('./lib/line-api')({
  api: API,
  getToken: function() { return LINE_TOKEN; },
});
var lHeaders = _lineApi.lHeaders;
var lReply = _lineApi.lReply;
var lPush = _lineApi.lPush;
var rText = _lineApi.rText;
var _trackLine = _lineApi._trackLine;
// The diagnostic route reads `_lastLineResults` as a live array reference —
// the line-api module returns the same internal array from getLastLineResults,
// so grabbing it once here keeps the reference live.
var _lastLineResults = _lineApi.getLastLineResults();

// ─── Catalog Price Search ─────────────────────────────────────
function isPriceQuestion(text) {
  return /ราคา|price|cost|เท่าไหร่|เท่าไร|กี่บาท|บาท|฿|ค่า/.test(text);
}

// Stop words to ignore when extracting product keywords
var PRICE_STOP_WORDS = ['nasri','นัด','ไอ่นัด','ราคา','price','cost','เท่าไหร่','เท่าไร','กี่บาท','บาท','ค่า','แผง','อยาก','ได้','ให้','หน่อย','ครับ','ค่ะ','นะ','รุ่น','คือ','มี','ขอ','ดู','อะ','pv','solar','panel','โซลาร์','เซลล์','แผงโซลาร์','อินเวอร์เตอร์','inverter'];

async function priceSearch(text) {
  try {
    var catalog = await getCatalog();
    // Split on whitespace AND on Thai/English boundaries (e.g. "ราคาแผงAIKO" → ["aiko"])
    var normalized = text.toLowerCase().replace(/[ก-๙]+/g, function(m) { return ' ' + m + ' '; });
    var words = normalized.split(/[\s\/\-_,]+/).filter(function(w) {
      return w.length > 1 && PRICE_STOP_WORDS.indexOf(w) < 0;
    });
    // Also extract any standalone ASCII tokens from the original text (catches "AIKO650" → "aiko" + "aiko650")
    var asciiTokens = text.match(/[a-zA-Z][a-zA-Z0-9\-]*/g) || [];
    asciiTokens.forEach(function(t) {
      var tl = t.toLowerCase();
      if (tl.length > 1 && PRICE_STOP_WORDS.indexOf(tl) < 0 && words.indexOf(tl) < 0) {
        words.push(tl);
      }
      // Strip trailing digits to also get pure brand name ("AIKO650" → "aiko")
      var alpha = tl.replace(/\d+$/, '');
      if (alpha.length > 1 && alpha !== tl && PRICE_STOP_WORDS.indexOf(alpha) < 0 && words.indexOf(alpha) < 0) {
        words.push(alpha);
      }
    });
    // Also extract any digit sequences (model numbers like "650")
    var digitTokens = text.match(/\d{3,}/g) || [];
    digitTokens.forEach(function(t) {
      if (words.indexOf(t) < 0) words.push(t);
    });
    if (!words.length) return [];
    var seen = {};
    var results = [];
    Object.keys(catalog).forEach(function(sheetName) {
      (catalog[sheetName] || []).forEach(function(row) {
        var vals = Object.values(row).join(' ').toLowerCase();
        if (words.some(function(w) { return vals.indexOf(w) >= 0; })) {
          var price = extractPrice(row);
          if (price <= 0) return;
          var name = '';
          Object.keys(row).forEach(function(k) {
            var kl = k.toLowerCase();
            if (!name && (kl.indexOf('รุ่น') >= 0 || kl.indexOf('model') >= 0)) name = String(row[k]);
          });
          if (!name) name = String(Object.values(row)[1] || Object.values(row)[0] || '');
          var key = sheetName + '|' + name;
          if (!seen[key]) { seen[key] = true; results.push({ sheet: sheetName, name: name, price: price }); }
        }
      });
    });
    return results.slice(0, 15);
  } catch (e) {
    console.error('[priceSearch] Error:', e.message);
    return [];
  }
}

// ─── Claude API ───────────────────────────────────────────────
// askClaude(question, catalogContext) — calls Anthropic API, returns response text
// Uses claude-haiku-4-5-20251001 for cost efficiency
// Falls back gracefully if API key missing or network fails
function askClaude(question, catalogContext) {
  return new Promise(function(resolve) {
    var apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      console.warn('[claude] ANTHROPIC_API_KEY not set');
      resolve('ขออภัย ไม่สามารถตอบคำถามได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
      return;
    }

    var userContent = question + (catalogContext ? '\n\n' + catalogContext : '');
    var body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: 'คุณคือ "นัด" (Nasri) ผู้ช่วยดิจิทัลของ Enervia Group เชี่ยวชาญโซลาร์เซลล์ พูดเป็นกันเอง ใช้ emoji ได้ ตอบสั้น 2-4 ประโยค สำคัญ: อ่านข้อความให้ครบก่อนตอบ วิเคราะห์ความต้องการหลัก กฎราคา: ถ้ามีข้อมูลจาก Catalog ด้านล่าง ให้ใช้ข้อมูลนั้นตอบราคาเสมอ ห้ามบอกว่าไม่มีขาย สินค้าทุกชนิดในแค็ตตาล็อก Enervia ถือว่าเราขาย ไม่ว่ายี่ห้อใด ห้ามแต่งราคาเอง ใช้ราคาจาก catalog เท่านั้น ถ้าผู้ใช้ต้องการ BOM/ใบเสนอราคา แต่ไม่ระบุรายละเอียด ให้ถามก่อน: 1.ยี่ห้อ 2.ขนาดkW 3.กี่เฟส 4.ใส่แบตมั้ย 5.หลังคาแบบไหน 6.กันนกมั้ย ถ้าระบุครบ แนะนำพิมพ์ "นัด ทำใบเสนอราคา [ยี่ห้อ] [ขนาด]kw [เฟส] [แบท]" กฎ BOM: Solis/Huawei/Deye hybrid ต้องมีตู้ Combiner+ATS(1P=9500,3P=15850) ATMOCE ใช้ MI-500 สำหรับบ้าน MI-1250 สำหรับ C&I Hoymiles ต้องมี DTU+meter ยี่ห้ออินเวอร์เตอร์สำหรับ BOM: ATMOCE, Sigenergy, Huawei, Deye, Solis, Hoymiles ถ้าไม่รู้คำตอบ ให้ตอบ "ขอไปหาข้อมูลในเวปก่อนนะ 🔍"',
      messages: [{ role: 'user', content: userContent }],
    });

    var https = require('https');
    var options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    var req = https.request(options, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          var text = (parsed.content && parsed.content[0] && parsed.content[0].text) || '';
          if (!text) {
            console.error('[claude] Empty response:', JSON.stringify(parsed).slice(0, 200));
            resolve('ขออภัย ไม่สามารถตอบคำถามได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
          } else {
            resolve(text);
          }
        } catch (e) {
          console.error('[claude] Parse error:', e.message);
          resolve('ขออภัย ไม่สามารถตอบคำถามได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
        }
      });
    });

    req.on('error', function(e) {
      console.error('[claude] Request error:', e.message);
      resolve('ขออภัย ไม่สามารถตอบคำถามได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
    });

    req.setTimeout(15000, function() {
      console.error('[claude] Timeout');
      req.destroy();
      resolve('ขออภัย ไม่สามารถตอบคำถามได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
    });

    req.write(body);
    req.end();
  });
}

// ─── Thai Input Normalizer + LLM Validator ──────────────────
// Extracted to lib/thai-normalize.js and lib/validate-spec.js — see
// those files for the implementations. These aliases keep the rest of
// app.js wiring identical.
var normalizeThaiInput = require('./lib/thai-normalize').normalizeThaiInput;
var validateSolarSpec = require('./lib/validate-spec').validateSolarSpec;

// ─── Claude AI Solar Analyzer (tool_use) ─────────────────────
// Uses Claude API with tool_use to analyze solar requests intelligently.
// Claude reads the catalog data, thinks about the request, and returns
// structured parameters for qsolar (quotation) or bomsolar (BOM).
function askClaudeForSolar(userText, catalogData, intent) {
  return new Promise(function(resolve) {
    var apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      resolve(null); // fallback to regex parsing
      return;
    }
    // Normalize Thai input before sending to LLM (consistent with regex path)
    try { userText = normalizeThaiInput(userText || ''); } catch (_) { /* keep original */ }

    var tools = [{
      name: 'solar_spec',
      description: 'Output the parsed solar system specification from user request',
      input_schema: {
        type: 'object',
        properties: {
          brand: { type: 'string', enum: ['ATMOCE','Sigenergy','Huawei','Deye','Solis','Hoymiles'], description: 'Inverter brand' },
          size_kw: { type: 'number', description: 'System size in kW. If panel_count and panel_watt given, calculate: panel_count * panel_watt / 1000' },
          phase: { type: 'string', enum: ['1P', '3P'], description: 'Phase. Default 1P for <15kW, 3P for >=15kW unless specified' },
          panel_brand: { type: 'string', description: 'PV panel brand from catalog (e.g. AIKO, JA Solar, Trina Solar, LONGi, JINKO, VOLS). Empty if not specified' },
          panel_watt: { type: 'integer', description: 'Panel wattage (e.g. 625, 650, 670, 715). 0 if not specified' },
          panel_count: { type: 'integer', description: 'Number of panels. 0 if not specified (auto-calculate from kW)' },
          has_battery: { type: 'boolean', description: 'Whether battery is requested' },
          battery_qty: { type: 'integer', description: 'Number of battery units (as opposed to kWh) when user says "batt 4" or "x6ลูก"' },
          battery_kwh: { type: 'number', description: 'Battery capacity in kWh (e.g. "batt 7kw" = 7). 0 if qty only' },
          has_backup: { type: 'boolean', description: 'Whether backup system is requested. For ATMOCE, battery implies backup unless "no backup" stated' },
          has_optimizer: { type: 'boolean', description: 'True when user mentions "optimizer" / "optim"' },
          lump_sum: { type: 'boolean', description: 'True when user says "รวมราคา" / "รวม N" / "ราคารวม" — item 1 shows full grand_total, other items show 0' },
          customer_name: { type: 'string', description: 'Customer name if mentioned (e.g. "คุณสมชาย")' },
          grand_total: { type: 'number', description: 'Selling price override if specified (e.g. "ขาย 350000"). 0 for auto' },
          full_price: { type: 'number', description: 'Original price before discount, when user says "จากราคาเต็ม N". 0 if none' },
          discount: { type: 'number', description: 'Discount amount in THB. 0 if none' },
          remarks: { type: 'string', description: 'Promo remarks separated by |. E.g. "ฟรีติดตั้งตะแกรงกันนก"' },
        },
        required: ['brand', 'size_kw', 'phase']
      }
    }];

    var systemPrompt = 'You are a solar system specification parser for Enervia Group. '
      + 'Analyze the user message and extract the solar system specification using the solar_spec tool. '
      + 'IMPORTANT RULES:\n'
      + '- ALWAYS calculate size_kw from DC watts: panel_count × panel_watt / 1000 (if both given)\n'
      + '- Panel brands available: ' + (catalogData.panelBrands || 'AIKO, JA Solar, Trina Solar, LONGi, JINKO, VOLS') + '\n'
      + '- ATMOCE battery is MS-7K = 7kWh each. If "batt N" where N >= 7, treat N as kWh (e.g. "batt 14" = 14kWh = battery_kwh:14). If N < 7, treat as quantity (e.g. "batt 2" = 2 units = battery_qty:2)\n'
      + '- For non-ATMOCE: "batt N" where N is small (1-20) without kw/kwh → N battery units\n'
      + '- If user says "batt Nkw" or "batt Nkwh" → it means N kWh capacity\n'
      + '- For ATMOCE: battery implies backup unless user says "no backup"\n'
      + '- If user does NOT mention a panel brand or wattage, leave panel_brand="" and panel_watt=0. Never guess a default — Python decides from catalog.\n'
      + '- "PV" or "แผง" after a number = panel count\n'
      + '- Intent: ' + intent + '\n';

    // Only include the full panel table when the user text references a panel brand.
    // Keeps token cost low on the common case while still giving Claude context when needed.
    var panelBrandRegex = /aiko|vols|\bja\b|trina|longi|jinko|canadian/i;
    var includePanelTable = catalogData.panels && panelBrandRegex.test(userText || '');
    var catalogCtxText = includePanelTable
      ? ('Available panels from catalog:\n' + catalogData.panels + '\n')
      : '';

    // Anthropic prompt caching: break system into cacheable blocks so the
    // long static instructions + catalog text are reused across calls.
    var systemBlocks = [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ];
    if (catalogCtxText) {
      systemBlocks.push({ type: 'text', text: catalogCtxText, cache_control: { type: 'ephemeral' } });
    }

    var body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: systemBlocks,
      tools: tools,
      tool_choice: { type: 'tool', name: 'solar_spec' },
      messages: [{ role: 'user', content: userText }],
    });

    var https = require('https');
    var req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          // Extract tool_use result
          var toolUse = parsed.content && parsed.content.find(function(c) { return c.type === 'tool_use'; });
          if (toolUse && toolUse.input) {
            console.log('[claude-solar] AI parsed:', JSON.stringify(toolUse.input));
            resolve(toolUse.input);
          } else {
            console.error('[claude-solar] No tool_use in response:', JSON.stringify(parsed).slice(0, 300));
            resolve(null);
          }
        } catch (e) {
          console.error('[claude-solar] Parse error:', e.message);
          resolve(null);
        }
      });
    });
    req.on('error', function() { resolve(null); });
    req.setTimeout(20000, function() { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// Build catalog context for Claude Solar Analyzer
async function getSolarCatalogContext() {
  try {
    var catalog = await getCatalog();
    var panelRows = catalog['Solar Panels'] || [];
    var panelText = '';
    panelRows.forEach(function(r) {
      var brand = Object.values(r)[0] || '';
      var model = r['รุ่น (Model)'] || '';
      var watt = r['กำลังไฟ (W)'] || '';
      var price = r['ราคาขาย (฿/แผง)'] || r['ราคาสั่งซื้อ (฿)'] || '';
      if (brand && watt) {
        panelText += brand + ' ' + model + ' ' + watt + 'W ฿' + price + '\n';
      }
    });
    var brands = [];
    panelRows.forEach(function(r) {
      var b = (Object.values(r)[0] || '').trim();
      if (b && brands.indexOf(b) < 0) brands.push(b);
    });
    return { panels: panelText, panelBrands: brands.join(', ') };
  } catch (e) {
    return { panels: '', panelBrands: '' };
  }
}

// ─── INT3: LLM Intent Bridge + CRUD Bridge ──────────────────
var _intentBridge = require('./lib/intent-bridge');
var _qtCrud       = require('./lib/qt-crud-bridge');

// ─── LN-STATE: Conversation State Machine ───────────────────
var _Database  = null;
try { _Database = require('better-sqlite3'); } catch(e) {}
var _convState = null;
(function _initConvState() {
  if (!_Database) { console.warn('[conv-state] better-sqlite3 unavailable — state disabled'); return; }
  try {
    var _csDb = new _Database(SQLITE_PATH);
    _convState = require('./lib/conversation-state')({ db: _csDb });
    // Cleanup expired rows every hour
    setInterval(function() {
      var n = _convState.cleanExpired();
      if (n > 0) console.log('[conv-state] cleaned ' + n + ' expired rows');
    }, 60 * 60 * 1000);
    console.log('[conv-state] initialized → ' + SQLITE_PATH);
  } catch(e) { console.error('[conv-state] init error:', e.message); }
})();

// ─── LN-LOCALE: Locale Detection ────────────────────────────
var _localeDetect = require('./lib/locale-detect');

// ─── Flex Messages (lib/flex-builders.js) ───────────────────
var _flex = require('./lib/flex-builders');
var menuFlex                  = _flex.menuFlex;
var addItemFlex               = _flex.addItemFlex;
// buildBomResultFlex / buildPreviewFlex are aliased further below where
// they were originally declared, after generateBomHtml etc.

// INT4 — v2.0 Phase B/C/D Flex functions
var buildQuotationDetailFlex        = _flex.buildQuotationDetailFlex;
var buildQuotationDiffFlex          = _flex.buildQuotationDiffFlex;
var buildQuotationHistoryFlex       = _flex.buildQuotationHistoryFlex;
var buildQuotationSearchResultFlex  = _flex.buildQuotationSearchResultFlex;
var buildVersionHistoryFlex   = _flex.buildVersionHistoryFlex;
var buildMonthlySummaryFlex   = _flex.buildMonthlySummaryFlex;
var buildTopProductsFlex      = _flex.buildTopProductsFlex;
var buildSalesFunnelFlex      = _flex.buildSalesFunnelFlex;
var buildQuotationListFlex    = _flex.buildQuotationListFlex;
var buildPriceUpdateDiffFlex  = _flex.buildPriceUpdateDiffFlex;
var buildProductPriceEditFlex = _flex.buildProductPriceEditFlex;
var buildFormulaEditFlex      = _flex.buildFormulaEditFlex;
var buildPdfPreviewFlex       = _flex.buildPdfPreviewFlex;

// ─── Rich Menu Manager (lib/rich-menu.js) ───────────────────
// LN9 — 3-tab rich menu: Customer / Sales / Admin
var _createRichMenuManager = require('./lib/rich-menu');
var _richMenuMgr = _createRichMenuManager({ getToken: function() { return LINE_TOKEN; } });

// ─── Rate Limiting (v2.1 P4: SQLite-backed via _rlStore) ─────
// _rlStore delegates to rate-limit-store.js → rate_limits table.
// Falls back to in-memory Map automatically if sqliteDb is unavailable.
function checkRate(userId, type, max) { return _rlStore.check(userId, type, max); }
function incrementRate(userId, type)  { _rlStore.increment(userId, type); }
function getRateCount(userId, type)   { return _rlStore.count(userId, type); }

// Purge old rate-limit rows daily (midnight-ish — run at startup + every 24h)
function _purgeRateLimits() {
  var n = _rlStore.purgeOld();
  if (n > 0) console.log('[rate-limit-store] purged', n, 'stale rows');
}
_purgeRateLimits();
var _rlPurgeTimer = setInterval(_purgeRateLimits, 24 * 60 * 60 * 1000);
if (_rlPurgeTimer.unref) _rlPurgeTimer.unref();

// ─── Audit Log ────────────────────────────────────────────────
/**
 * sobek: Admin API auth — Bearer token check.
 * Fail-closed: if ADMIN_API_TOKEN not set in env → always deny.
 * Usage: if (!requireAdminAuth(req, res)) return;
 */
function requireAdminAuth(req, res) {
  var authHeader = req.headers['authorization'] || '';
  var token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  // Fail-closed: empty ADMIN_API_TOKEN = nobody can access (not open)
  if (!ADMIN_API_TOKEN || !token || token !== ADMIN_API_TOKEN) {
    auditLog('admin_auth_fail', '', req.url + ' ip=' + (req.socket.remoteAddress || ''));
    res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer realm="admin"' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  return true;
}

/**
 * sobek K1: Sign a PDF filename → signed URL (HMAC-SHA256, 24h TTL).
 * If SIGNED_URL_SECRET not set → returns unsigned URL (degraded, logs warning).
 */
var _crypto = require('crypto');
function signPdfUrl(filename) {
  var fn = path.basename(filename);
  if (!SIGNED_URL_SECRET) {
    console.warn('[sobek-K1] SIGNED_URL_SECRET not set — PDF URLs are unsigned');
    return BASE_URL + '/api/bom/' + encodeURIComponent(fn);
  }
  var exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SEC;
  var payload = fn + ':' + exp;
  var sig = _crypto.createHmac('sha256', SIGNED_URL_SECRET).update(payload).digest('hex');
  return BASE_URL + '/api/bom/' + encodeURIComponent(fn) + '?exp=' + exp + '&sig=' + sig;
}

/** Verify signed URL — returns true if valid and not expired. */
function verifySignedPdfUrl(filename, exp, sig) {
  if (!SIGNED_URL_SECRET) return true; // unsigned mode — allow all (degraded)
  if (!exp || !sig) return false;
  var now = Math.floor(Date.now() / 1000);
  if (parseInt(exp, 10) < now) return false; // expired
  var expected = _crypto.createHmac('sha256', SIGNED_URL_SECRET)
    .update(filename + ':' + exp).digest('hex');
  // Timing-safe compare
  try { return _crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); }
  catch (e) { return false; }
}

// LN9/INT5: check if a LINE userId is in the admin whitelist
function isAdminUser(userId) {
  return !!userId && ADMIN_LINE_USER_IDS.length > 0 && ADMIN_LINE_USER_IDS.indexOf(userId) !== -1;
}

// sobek INT5: intents that require admin role — fail-closed
var ADMIN_ONLY_INTENTS = {
  update_price: true, set_price: true, update_formula: true,
  update_tier: true, retention_run: true, analytics_summary: true,
  export_other_user: true, delete_customer_data: true, edit_pricing_formula: true,
};

/**
 * sobek INT5: Admin intent guard for LINE webhook handlers.
 * Call BEFORE executing any admin-only command.
 * Logs every attempt (granted or denied) to access_logs + audit file.
 * Returns true if allowed, false if denied (denial reply already sent).
 */
async function checkAdminIntent(userId, intent, rt, inputLen) {
  var allowed = isAdminUser(userId);
  _persistence.logAccess(
    userId, intent, allowed, inputLen || 0,
    allowed ? 'admin_granted' : 'admin_denied_not_in_whitelist'
  );
  auditLog(allowed ? 'admin_cmd_granted' : 'admin_cmd_denied', userId, 'intent=' + intent);
  if (!allowed) {
    try { await lReply(rt, [{ type: 'text', text: 'คำสั่งนี้สำหรับ admin เท่านั้นครับ' }]); } catch (e) {}
    return false;
  }
  return true;
}

function auditLog(action, userId, detail) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    var today = new Date().toISOString().slice(0, 10);
    var file = path.join(LOG_DIR, 'audit-' + today + '.jsonl');
    var entry = JSON.stringify({ ts: new Date().toISOString(), action: action, userId: userId || '', detail: detail || '' });
    fs.appendFileSync(file, entry + '\n', 'utf8');
  } catch (e) { /* non-blocking */ }
}

// ─── QT History (per userId) — delegated to lib/persistence.js ──
// Backed by SQLite (Task #16). The shape of the objects returned by
// loadQtIndex uses the legacy camelCase `userId` field so /api/qt-list
// JSON stays bit-identical to before. See lib/persistence.js for impl.
var _qtRowToLegacy = _persistence._qtRowToLegacy;
var loadQtIndex = _persistence.loadQtIndex;
var saveQtIndex = _persistence.saveQtIndex;
var insertQt = _persistence.insertQt;
var saveQtHistory = _persistence.saveQtHistory;
var getQtHistoryForUser = _persistence.getQtHistoryForUser;

// ─── Admin Push Notification ──────────────────────────────────
async function notifyAdmin(text) {
  if (!ADMIN_LINE_USER_ID || !LINE_TOKEN) return;
  try {
    await fetch(API + '/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LINE_TOKEN },
      body: JSON.stringify({ to: ADMIN_LINE_USER_ID, messages: [{ type: 'text', text: text }] }),
    });
  } catch (e) { console.error('[admin-notify]', e.message); }
}

// ─── BOM Session ──────────────────────────────────────────────
const sessions = new Map();
const TIMEOUT = 30 * 60 * 1000;
// `lastBom` is declared near the top so persistence.saveBom can write to it.

// Load saved BOMs into lastBom on startup
(function restoreLastBoms() {
  try {
    var index = loadBomIndex();
    index.boms.forEach(function(b) {
      if (b.source_key && b.filename) {
        lastBom.set(b.source_key, { filename: b.filename, data: null });
      }
    });
    console.log('[bom] Restored ' + index.boms.length + ' BOMs from index');
  } catch (e) { console.error('[bom] Restore error:', e.message); }
})();

function sKey(src) { return src.type === 'group' ? 'g:' + src.groupId : 'u:' + src.userId; }
function getSess(k) { const s = sessions.get(k); if (!s) return null; if (Date.now() - s.up > TIMEOUT) { sessions.delete(k); return null; } return s; }

function newSess(k) {
  const now = Date.now();
  const s = { step: 'name', data: { company_name: 'Enervia Group co.,ltd', project_name: '', project_address: '', order_date: new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }), notes: '', items: [] }, up: now };
  sessions.set(k, s);
  return s;
}

function guessCat(n) {
  const l = n.toLowerCase();
  if (/panel|module|โมดูล|แผง/.test(l)) return 'โมดูล';
  if (/inverter|อินเวอร์เตอร์|micro/i.test(l)) return 'อินเวอร์เตอร์';
  if (/batt|แบต|แบท/i.test(l)) return 'battery';
  if (/cable|สาย|wire/i.test(l)) return 'cable';
  if (/mount|clamp|rail|ราง/i.test(l)) return 'mounting';
  if (/backup|combiner/i.test(l)) return 'general';
  if (/charger|ev/i.test(l)) return 'EV charger';
  return 'general';
}

// ─── Inverter Design Engine ─────────────────────────────────
// When no exact kW match exists, design optimal inverter combination
function designInverters(invRows, targetKw, phase, brand) {
  if (targetKw <= 0) return [];

  // Collect available inverters matching phase
  var available = [];
  invRows.forEach(function(r) {
    var vals = Object.values(r).join(' ').toLowerCase();
    // Phase filter — check multiple notations used across catalogs
    var is1P = /\b1p\b|1-phase|1phase|single.?phase|สาย\s*2|single/i.test(vals);
    var is3P = /\b3p\b|3-phase|3phase|three.?phase|สาย\s*4/i.test(vals);
    // If neither marker found, include the row (some catalogs omit phase label)
    var phaseMatch = (!is1P && !is3P) || (phase === '1P' && is1P) || (phase === '3P' && is3P);
    if (!phaseMatch) return;
    // Skip accessories
    var itype = (extractField(r, ['ประเภท', 'type']) || '').toLowerCase();
    if (/sensor|dongle|logger|meter|pqm|accessory/.test(itype)) return;
    var firstKey = Object.keys(r)[0];
    var kwVal = parseFloat(String(r[firstKey]).replace(/[^\d.]/g, ''));
    if (kwVal > 0 && kwVal <= 1000) {
      var model = extractField(r, ['รุ่น', 'model', 'sku']) || brand + ' ' + kwVal + 'kW';
      var itypeDisplay = extractField(r, ['ประเภท', 'type']) || '';
      available.push({ row: r, model: model, kw: kwVal, type: itypeDisplay });
    }
  });

  if (!available.length) return [];
  available.sort(function(a, b) { return b.kw - a.kw; });

  // 1) Exact match
  for (var i = 0; i < available.length; i++) {
    if (available[i].kw === targetKw) {
      return [{ row: available[i].row, model: available[i].model, kw: available[i].kw, type: available[i].type, qty: 1 }];
    }
  }

  // Overshoot tolerance: prefer exact/zero-overshoot combos, allow up to 30% overshoot as last resort
  var OVERSHOOT_LIMIT = 0.30;

  // 2) Single model × N
  var bestSingle = null, bestSingleScore = Infinity;
  available.forEach(function(inv) {
    if (inv.kw > targetKw) {
      var overshoot = (inv.kw - targetKw) / targetKw;
      if (overshoot <= OVERSHOOT_LIMIT) {
        var score = 1 + overshoot * 10;
        if (score < bestSingleScore) {
          bestSingleScore = score;
          bestSingle = [{ row: inv.row, model: inv.model, kw: inv.kw, type: inv.type, qty: 1 }];
        }
      }
    } else if (inv.kw > 0) {
      var qty = Math.ceil(targetKw / inv.kw);
      var total = inv.kw * qty;
      var overshoot = (total - targetKw) / targetKw;
      if (overshoot <= OVERSHOOT_LIMIT) {
        var score = qty + overshoot * 10;
        if (score < bestSingleScore) {
          bestSingleScore = score;
          bestSingle = [{ row: inv.row, model: inv.model, kw: inv.kw, type: inv.type, qty: qty }];
        }
      }
    }
  });

  // 3) Two-model mix — prefer lowest overshoot, then fewest units
  var bestMix = null, bestMixScore = Infinity;
  for (var i = 0; i < available.length; i++) {
    for (var j = i; j < available.length; j++) {
      var maxA = Math.min(10, Math.max(2, Math.ceil(targetKw / available[i].kw) + 1));
      for (var a = 1; a < maxA; a++) {
        var remaining = targetKw - (available[i].kw * a);
        if (remaining <= 0) break;
        var b = Math.ceil(remaining / available[j].kw);
        var total = available[i].kw * a + available[j].kw * b;
        if (total >= targetKw) {
          var overshoot = (total - targetKw) / targetKw;
          if (overshoot <= OVERSHOOT_LIMIT) {
            var units = a + b;
            // Score: overshoot is primary (exact fit wins), then fewest units
            var score = overshoot * 100 + units;
            if (score < bestMixScore) {
              bestMixScore = score;
              if (available[i].model === available[j].model) {
                bestMix = [{ row: available[i].row, model: available[i].model, kw: available[i].kw, type: available[i].type, qty: a + b }];
              } else {
                bestMix = [
                  { row: available[i].row, model: available[i].model, kw: available[i].kw, type: available[i].type, qty: a },
                  { row: available[j].row, model: available[j].model, kw: available[j].kw, type: available[j].type, qty: b }
                ];
              }
            }
          }
        }
      }
    }
  }

  // Pick best: prefer lowest overshoot (mix wins if it's cleaner)
  if (bestSingle && bestMix) {
    // Normalize scores to same scale for comparison
    var singleOvNorm = bestSingleScore - (bestSingle[0].qty);
    var mixOvNorm = bestMixScore / 100;
    return mixOvNorm < singleOvNorm - 0.01 ? bestMix : bestSingle;
  }
  return bestSingle || bestMix || [];
}

// ─── Smart System Spec Parser ────────────────────────────────
// Parses natural language like "atmoce 5kw 1phase แผง JA625 + batt + backup"
// into BOM items from the Google Sheets catalog

async function parseSystemSpec(text) {
  var catalog = await getCatalog();
  if (!catalog) return [];
  text = normalizeThaiInput(text);
  var lo = text.toLowerCase();
  var items = [];

  // Detect system size (kW) — must come before phase detection
  var kwMatch = lo.match(/(\d+(?:\.\d+)?)\s*kw(?!h)/);
  var systemKw = kwMatch ? parseFloat(kwMatch[1]) : 5; // default 5kW
  if (systemKw <= 0) systemKw = 5;

  // Detect phase
  // Default: systems ≥15kW are 3P unless explicitly stated as 1P
  var phase = '1P';
  if (/3\s*(?:phase|เฟส|p\b)/i.test(text)) phase = '3P';
  else if (/1\s*(?:phase|เฟส|p\b)/i.test(text)) phase = '1P';
  else if (systemKw >= 15) phase = '3P'; // Large systems auto-upgrade to 3P

  // Detect inverter brand
  var invBrand = '';
  if (/atmoce/i.test(lo)) invBrand = 'ATMOCE';
  else if (/huawei/i.test(lo)) invBrand = 'Huawei';
  else if (/sol[io]s/i.test(lo)) invBrand = 'Solis';
  else if (/deye/i.test(lo)) invBrand = 'Deye';
  else if (/sig(?:energy)?/i.test(lo)) invBrand = 'Sigenergy';
  else if (/hoymiles/i.test(lo)) invBrand = 'Hoymiles';
  else if (/enphase/i.test(lo)) invBrand = 'Enphase';

  // ── Detect "atmoce batt ... ต่อกับ [other brand]" — battery-only kit mode ──
  // e.g. "huawei 10kw 1phase atmoce batt 14kw ต่อกับ"
  // When detected: primary inverter = other brand, ATMOCE contributes only batt kit + MS-7K-U
  var atmoceBattKit = false;
  if (/atmoce/i.test(lo) && /batt|แบต|แบท/i.test(lo) && /ต่อกับ|พ่วง|\bwith\b/i.test(lo)) {
    var otherBrand = '';
    if (/huawei/i.test(lo)) otherBrand = 'Huawei';
    else if (/sol[io]s/i.test(lo)) otherBrand = 'Solis';
    else if (/deye/i.test(lo)) otherBrand = 'Deye';
    else if (/sig(?:energy)?/i.test(lo)) otherBrand = 'Sigenergy';
    else if (/hoymiles/i.test(lo)) otherBrand = 'Hoymiles';
    else if (/enphase/i.test(lo)) otherBrand = 'Enphase';
    if (otherBrand) {
      atmoceBattKit = true;
      invBrand = otherBrand; // primary inverter is the other brand
    }
  }

  // ── ATMOCE & Sigenergy Python Engine Integration (#N2) ──
  if ((invBrand === 'ATMOCE' || invBrand === 'Sigenergy') && !atmoceBattKit) {
    var parsedReq = _bomParser.parseBomRequest(text);
    if (parsedReq.isAtmoceQuickReply) return { isAtmoceQuickReply: true, quickReplyMsg: parsedReq.quickReplyMsg };
    if (parsedReq.isSigenergyQuickReply) return { isSigenergyQuickReply: true, quickReplyMsg: parsedReq.quickReplyMsg };
    if (parsedReq.isSigenergyCiPrompt) return { isSigenergyCiPrompt: true, promptMsg: parsedReq.promptMsg };

    try {
      var pyRes = await srpCalcBom(parsedReq);
      if (pyRes && pyRes.items) {
        var resItems = pyRes.items.map(function(i) {
          return {
            k: i.k,
            part_number: i.part_number || i.k || '',
            part_name: i.part_name,
            manufacturer: i.manufacturer,
            category: i.category,
            quantity: i.quantity,
            unit: i.unit,
            unit_cost: i.unit_cost !== null ? i.unit_cost : 0,
            total_cost: i.total_cost !== null ? i.total_cost : 0,
            notes: i.notes || ''
          };
        });

        resItems._summaryText = pyRes.summary_text;
        return resItems;
      }
    } catch (e) {
      return { isSurveyError: true, errorMsg: e.message };
    }
  }


  // Detect panel brand + watts — dynamic, supports any brand from catalog
  var panelBrand = '', panelWatts = 0;
  if (/trina\s*(?:solar\s*)?(\d{3,4})?(?:\s*w)?/i.test(lo)) { panelBrand = 'Trina Solar'; panelWatts = RegExp.$1 ? parseInt(RegExp.$1) : 0; }
  else if (/ja\s*(?:solar\s*)?(\d{3,4})?(?:\s*w)?/i.test(lo) && !invBrand.match(/ja/i)) { panelBrand = 'JA Solar'; panelWatts = RegExp.$1 ? parseInt(RegExp.$1) : 0; }
  else if (/aiko\s*(\d{3,4})?(?:\s*w)?/i.test(lo)) { panelBrand = 'AIKO'; panelWatts = RegExp.$1 ? parseInt(RegExp.$1) : 0; }
  else if (/longi\s*(\d{3,4})?(?:\s*w)?/i.test(lo)) { panelBrand = 'LONGi'; panelWatts = RegExp.$1 ? parseInt(RegExp.$1) : 0; }
  else if (/jinko\s*(\d{3,4})?(?:\s*w)?/i.test(lo)) { panelBrand = 'JINKO'; panelWatts = RegExp.$1 ? parseInt(RegExp.$1) : 0; }
  else if (/vols\s*(\d{3,4})?(?:\s*w)?/i.test(lo)) { panelBrand = 'VOLS'; panelWatts = RegExp.$1 ? parseInt(RegExp.$1) : 0; }
  else if (/แผง\s*(\d{3,4})/i.test(lo)) { panelWatts = parseInt(RegExp.$1); }

  // Parse explicit panel count (e.g. "42แผง", "42 แผง", "32 PV", "38pv", "12panels")
  var explicitPanelQty = 0;
  var pqMatch = lo.match(/(\d+)\s*(?:แผ[งง่]|pv|panels?)/i);
  if (pqMatch) {
    var pqVal = parseInt(pqMatch[1]);
    // Only treat as panel count if it's a reasonable qty (1-400), not watts
    if (pqVal > 0 && pqVal < 400) explicitPanelQty = pqVal;
  }
  // DC watt calculation: panel_count × panel_watt = actual system size
  // Layer A guard: if user explicitly stated kW (kwMatch), DO NOT overwrite
  // — snap logic in Layer B will handle any inverter-model constraints.
  if (explicitPanelQty > 0 && panelWatts > 0 && !kwMatch) {
    systemKw = Math.round(explicitPanelQty * panelWatts / 10) / 100;
  }

  // Want battery?
  var wantBatt = /batt|แบต|แบท/i.test(lo);
  var battKwh = 0;
  var battQty = 1;

  // Battery kWh: only treat number as kWh if explicitly followed by "kw"/"kwh"
  var battKwhMatch = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s*(\d+(?:\.\d+)?)\s*(?:kw|kwh)/);
  if (battKwhMatch) battKwh = parseFloat(battKwhMatch[1]);
  else { battKwhMatch = lo.match(/(\d+(?:\.\d+)?)\s*(?:kw|kwh)\s*(?:batt|แบต|แบท)/); if (battKwhMatch) battKwh = parseFloat(battKwhMatch[1]); }

  // Battery quantity — "batt 4", "batt *3", "x6ลูก", "4ลูก", "batt 7 *2"
  var battQtyMatch = text.match(/batt(?:ery)?\s*\d+\s*(?:kw|kwh)?\s*[*x×]\s*(\d+)/i)
    || text.match(/[*x×]\s*(\d+)\s*ลูก/)
    || text.match(/(\d+)\s*ลูก/)
    || text.match(/batt(?:ery)?\s*\d+\s*(?:kw|kwh)?\s+(\d+)\s*ลูก/i);
  if (battQtyMatch) battQty = parseInt(battQtyMatch[1]);

  // "batt N" where N is reasonable and no kWh unit → qty or kWh for ATMOCE
  if (battQty <= 1 && !battKwhMatch) {
    var battNumMatch = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s+(\d+)(?:\s|$|\+)/);
    if (battNumMatch) {
      var bn = parseInt(battNumMatch[1]);
      // ATMOCE MS-7K = 7kWh each: N >= 7 means kWh (up to 50), N < 7 means qty
      if (invBrand === 'ATMOCE' && bn >= 7 && bn <= 50) {
        battKwh = bn;
      } else if (bn >= 1 && bn <= 20) {
        battQty = bn;
      }
    }
  }

  // If battKwh specified with explicit quantity multiplier
  if (battKwh > 0 && battQtyMatch) {
    var bqVal = parseInt(battQtyMatch[1]);
    if (bqVal > 1) battKwh = battKwh * bqVal;
  }

  // Want backup?
  var wantBackup = /backup|สำรอง/i.test(lo);

  // Want optimizer?
  var wantOptimizer = /optim/i.test(lo);

  // Want DC charger / EV charger?
  var wantEV = /dc\s*charg|ev\s*charg|ชาร์จ/i.test(lo);

  // Detect roof type (default: เมทัลชีท → L-Feet 8cm)
  var roofType = 'metal';
  if (/tile|กระเบื้อง/i.test(lo)) roofType = 'tile';
  else if (/hangerbolt|ลอนคู่/i.test(lo)) roofType = 'hangerbolt';
  else if (/kliplock/i.test(lo)) roofType = 'kliplock';

  // ── Find inverter ──
  var srpModeItems = false; // True when ATMOCE SRP Calculator builds items (skip panels/mounting/cables)
  if (invBrand) {
    var invSheet = 'Inverters - ' + invBrand;
    var invRows = catalog[invSheet] || [];

    if (invBrand === 'ATMOCE') {
      // Detect explicit micro-inverter model from user input
      var forceMI500 = /mi[\-\s]*500/i.test(lo) || /ใช้\s*mi[\-\s]*500/i.test(lo);
      var forceMI1250 = /mi[\-\s]*1250/i.test(lo) || /ใช้\s*mi[\-\s]*1250/i.test(lo);
      var miModel, miName, miKw, miFallbackPrice, miRow, miQty;
      if (forceMI1250 && !forceMI500) {
        // Only when user explicitly asks for MI-1250
        miModel = 'MI-1250';
        miName = 'Micro Inverter MI-1250 (1.25kW)';
        miKw = 1.25;
        miFallbackPrice = 4750;
        miRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MI-1250') >= 0 && Object.values(r).join(' ').toLowerCase().indexOf('warranty') >= 0; });
        if (!miRow) miRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MI-1250') >= 0; });
      } else {
        // Default for ALL ATMOCE: MI-500 (regardless of system size)
        miModel = 'MI-500';
        miName = 'Micro Inverter MI-500 (0.5kW)';
        miKw = 0.5;
        miFallbackPrice = 4400;
        miRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MI-500') >= 0 && Object.values(r).join(' ').toLowerCase().indexOf('warranty') >= 0; });
        if (!miRow) miRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MI-500') >= 0; });
      }
      // MI-500: 1 per panel (micro-inverter); MI-1250: kW-based
      if (miModel === 'MI-500') {
        miQty = explicitPanelQty > 0 ? explicitPanelQty : Math.ceil(systemKw / miKw);
      } else {
        miQty = Math.ceil(systemKw / miKw);
      }

      // ── SRP Calculator path (primary) ────────────────────────
      // Mirrors 'SRP Calculation' sheet formulas — correct pricing + BOM structure.
      // Falls back to catalog build if CLI unavailable.
      var _srpOk = false;
      var _srpConfig = (forceMI1250 && !forceMI500 ? '2:1' : '1:1') + '-' + phase;
      var _srpPanels = explicitPanelQty > 0 ? explicitPanelQty
        : (forceMI1250 && !forceMI500 ? miQty * 2 : miQty);
      var _srpBattKwh = wantBatt ? (battKwh > 0 ? battKwh : (battQty >= 7 ? battQty : battQty * 7)) : 0;
      try {
        var _srpData = await srpCalcBom(_srpConfig, _srpPanels, _srpBattKwh, wantBackup);
        if (_srpData && _srpData.items && !_srpData.error) {
          _srpData.items.forEach(function(line) {
            items.push({
              part_number: line.part_number,
              part_name: line.part_name,
              manufacturer: line.manufacturer,
              category: line.category,
              quantity: line.quantity,
              unit_cost: line.unit_cost,
              total_cost: line.total_cost,
              notes: line.notes || '',
            });
          });
          items._srpSummary = {
            srp_config: _srpData.config,
            srp_panels: _srpData.panels,
            srp_kwp: _srpData.kwp,
            srp_inverter_count: _srpData.inverter_count,
            equipment_total: _srpData.total_cost,
            profit_30pct: _srpData.profit,
            vat_7pct: _srpData.vat,
            grand_total: _srpData.offer_price,
            battery_kwh: _srpData.battery_kwh || 0,
            has_backup: _srpData.has_backup || false,
            warranty_years: _srpData.warranty_years || 0,
            note: 'SRP Calculation sheet formula — offer_price includes 30% profit + 7% VAT',
          };
          _srpOk = true;
          srpModeItems = true;
          wantBatt = false;
          wantBackup = false;
        }
      } catch (_srpErr) {
        console.error('[atmoce-srp-calc]', _srpErr.message);
      }

      if (!_srpOk) {
      // ── Catalog fallback (if SRP CLI unavailable) ─────────────
      var miPrice = miRow ? extractPrice(miRow) : miFallbackPrice;
      items.push({ part_number: miModel, part_name: miName, manufacturer: 'ATMOCE', category: 'อินเวอร์เตอร์', quantity: miQty, unit_cost: miPrice, total_cost: miQty * miPrice, notes: '' });
      // Combiner box: 3P=MC100T, 1P=MC100L (≤12 panels) or MC100 (>12 panels)
      var combinerSku;
      if (phase === '3P') combinerSku = 'MC100T';
      else if (miQty <= 12) combinerSku = 'MC100L';
      else combinerSku = 'MC100';
      var combiner;
      if (combinerSku === 'MC100') {
        // Exact match MC100 (not MC100T or MC100L)
        combiner = invRows.find(function(r) {
          var vals = Object.values(r).join(' ');
          return vals.indexOf('MC100') >= 0 && vals.indexOf('MC100T') < 0 && vals.indexOf('MC100L') < 0 && vals.indexOf('Wye') < 0;
        });
      } else {
        combiner = invRows.find(function(r) { return Object.values(r).join(' ').indexOf(combinerSku) >= 0; });
      }
      if (combiner) {
        var cPrice = extractPrice(combiner);
        var cName = extractField(combiner, ['sku', 'รายการ']) || combinerSku;
        var cDesc = extractField(combiner, ['description', 'คำอธิบาย', 'รายละเอียด']) || 'M-Combiner';
        items.push({ part_number: cName, part_name: cName + ' ' + cDesc, manufacturer: 'ATMOCE', category: 'general', quantity: 1, unit_cost: cPrice, total_cost: cPrice, notes: '' });
      }
      // ── ATMOCE cables/accessories ──
      // MW-025013-A: 1 per MI-500 (= panels)
      var mw13Row = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MW-025013-A') >= 0; });
      if (mw13Row && miQty > 0) {
        var mw13Price = extractPrice(mw13Row);
        var mw13Name = extractField(mw13Row, ['sku', 'รายการ']) || 'MW-025013-A';
        var mw13Desc = extractField(mw13Row, ['description', 'คำอธิบาย', 'รายละเอียด']) || 'DC extension cable';
        items.push({ part_number: mw13Name, part_name: mw13Name + ' ' + mw13Desc, manufacturer: 'ATMOCE', category: 'cable', quantity: miQty, unit_cost: mw13Price, total_cost: mw13Price * miQty, notes: '' });
      }
      // MW-025020-B0: 1 per 8 panels (ceil)
      var mw20Row = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MW-025020-B0') >= 0; });
      if (mw20Row && miQty > 0) {
        var mw20Qty = Math.ceil(miQty / 8);
        var mw20Price = extractPrice(mw20Row);
        var mw20Name = extractField(mw20Row, ['sku', 'รายการ']) || 'MW-025020-B0';
        var mw20Desc = extractField(mw20Row, ['description', 'คำอธิบาย', 'รายละเอียด']) || 'AC trunk cable';
        items.push({ part_number: mw20Name, part_name: mw20Name + ' ' + mw20Desc, manufacturer: 'ATMOCE', category: 'cable', quantity: mw20Qty, unit_cost: mw20Price, total_cost: mw20Price * mw20Qty, notes: '' });
      }
      // MT-04002-2in1: 1 unit when > 10 panels
      if (miQty > 10) {
        var mtRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MT-04002') >= 0; });
        if (mtRow) {
          var mtPrice = extractPrice(mtRow);
          var mtName = extractField(mtRow, ['sku', 'รายการ']) || 'MT-04002-2in1';
          var mtDesc = extractField(mtRow, ['description', 'คำอธิบาย', 'รายละเอียด']) || '2-in-1 T-connector';
          items.push({ part_number: mtName, part_name: mtName + ' ' + mtDesc, manufacturer: 'ATMOCE', category: 'accessory', quantity: 1, unit_cost: mtPrice, total_cost: mtPrice, notes: '' });
        }
      }
      // ATMOCE battery — MS-7K = 7kWh each
      // Pricing: 1P first=110k +99k each additional; 3P first=130k +99k each additional
      if (wantBatt) {
        var abatt = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MS-7K') >= 0; });
        if (abatt) {
          var abQty;
          if (battKwh > 0) {
            abQty = Math.max(1, Math.ceil(battKwh / 7));
          } else if (battQty >= 7) {
            // "batt 14" = 14kWh → 2 units (not 14 units)
            abQty = Math.max(1, Math.ceil(battQty / 7));
          } else if (battQty > 1) {
            abQty = battQty;
          } else {
            abQty = 1;
          }
          if (phase === '1P' && abQty > 3) abQty = 3; // ATMOCE 1P max 3 batteries
          var firstBattPrice = phase === '1P' ? 110000 : 130000;
          var additionalBattPrice = 99000;
          var battTotalCost = firstBattPrice + Math.max(0, abQty - 1) * additionalBattPrice;
          items.push({ part_number: 'MS-7K-U', part_name: 'M-Battery 7kWh', manufacturer: 'ATMOCE', category: 'battery', quantity: abQty, unit_cost: Math.round(battTotalCost / abQty), total_cost: battTotalCost, notes: '' });
        }
        wantBatt = false; // handled
      }
      // ATMOCE backup
      if (wantBackup) {
        var bu = phase === '3P'
          ? invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MU100T') >= 0; })
          : invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MU100S') >= 0; });
        if (bu) {
          var buPrice = extractPrice(bu);
          var buName = phase === '3P' ? 'MU100T' : 'MU100S';
          items.push({ part_number: buName, part_name: buName + ' Backup Box', manufacturer: 'ATMOCE', category: 'general', quantity: 1, unit_cost: buPrice, total_cost: buPrice, notes: '' });
        }
        wantBackup = false;
      }
      } // end catalog fallback (!_srpOk)
    } else if (invBrand === 'Sigenergy') {
      // Sigenergy: search EC inverters by phase suffix + kW from รายละเอียด
      var phaseSuffix = phase === '1P' ? 'SP' : 'TP';
      var ecRows = invRows.filter(function(r) {
        var vals = Object.values(r).join(' ');
        return vals.indexOf('Inverter (EC)') >= 0 && vals.indexOf(phaseSuffix) >= 0;
      });
      if (!ecRows.length) {
        // Fallback to Hybrid
        ecRows = invRows.filter(function(r) {
          var vals = Object.values(r).join(' ');
          return vals.indexOf('Hybrid') >= 0 && vals.indexOf(phaseSuffix) >= 0;
        });
      }
      var bestInv = null, bestDiff = 9999;
      ecRows.forEach(function(r) {
        var detail = r['รายละเอียด'] || Object.values(r)[2] || '';
        var m = detail.match(/([\d.]+)\s*kW/i);
        if (m) {
          var diff = Math.abs(parseFloat(m[1]) - systemKw);
          if (diff < bestDiff) { bestDiff = diff; bestInv = r; }
        }
      });
      if (bestInv) {
        var invPrice = extractPrice(bestInv);
        var invModel = bestInv['รุ่น (Model)'] || extractField(bestInv, ['รุ่น', 'model']) || 'SigenStor EC ' + systemKw + 'kW';
        var invDetail = bestInv['รายละเอียด'] || '';
        items.push({ part_number: invModel, part_name: invModel + (invDetail ? ' (' + invDetail + ')' : ''), manufacturer: 'Sigenergy', category: 'อินเวอร์เตอร์', quantity: 1, unit_cost: invPrice, total_cost: invPrice, notes: '' });
      }
    } else {
      // Inverter Design Engine — handles exact match + smart combinations
      var designed = designInverters(invRows, systemKw, phase, invBrand);
      if (designed.length > 0) {
        designed.forEach(function(d) {
          var invPrice = extractPrice(d.row);
          var note = '';
          if (designed.length > 1) {
            note = 'AI designed: ' + designed.length + ' models combined for ' + systemKw + 'kW';
          } else if (d.qty > 1) {
            note = 'AI designed: ' + d.qty + 'x ' + d.kw + 'kW = ' + (d.qty * d.kw) + 'kW';
          }
          items.push({ part_number: d.model, part_name: d.model + (d.type ? ' (' + d.type + ')' : ''), manufacturer: invBrand, category: 'อินเวอร์เตอร์', quantity: d.qty, unit_cost: invPrice, total_cost: d.qty * invPrice, notes: note });
        });
      } else {
        // Fallback: closest single inverter
        var bestInv = null, bestDiff = 9999;
        invRows.forEach(function(r) {
          var vals = Object.values(r).join(' ').toLowerCase();
          var fb1P = /\b1p\b|1-phase|1phase|single.?phase/i.test(vals);
          var fb3P = /\b3p\b|3-phase|3phase|three.?phase/i.test(vals);
          var fbMatch = (!fb1P && !fb3P) || (phase === '1P' && fb1P) || (phase === '3P' && fb3P);
          if (!fbMatch) return;
          var firstKey = Object.keys(r)[0];
          var fv = parseFloat(String(r[firstKey]).replace(/[^\d.]/g, ''));
          if (fv > 0 && fv <= 1000) {
            var diff = Math.abs(fv - systemKw);
            if (diff < bestDiff) { bestDiff = diff; bestInv = r; }
          }
        });
        if (bestInv) {
          var invPrice = extractPrice(bestInv);
          var invModel = extractField(bestInv, ['รุ่น', 'model', 'sku']) || invBrand + ' ' + systemKw + 'kW';
          var invType = extractField(bestInv, ['ประเภท', 'type']) || '';
          items.push({ part_number: invModel, part_name: invModel + (invType ? ' (' + invType + ')' : ''), manufacturer: invBrand, category: 'อินเวอร์เตอร์', quantity: 1, unit_cost: invPrice, total_cost: invPrice, notes: 'Note: closest available to ' + systemKw + 'kW' });
        }
      }
      if (invBrand === 'Huawei') {
        // Smart Dongle WIFI
        items.push({ part_number: 'Smart Dongle WIFI', part_name: 'Smart Dongle WIFI', manufacturer: 'Huawei', category: 'general', quantity: 1, unit_cost: 1730, total_cost: 1730, notes: '' });
        // Power Sensor
        var ctPrice = phase === '1P' ? 1750 : 3230;
        var ctName = phase === '1P' ? 'Power Sensor 1P (CT)' : 'Power Sensor 3P (CT)';
        items.push({ part_number: ctName, part_name: ctName, manufacturer: 'Huawei', category: 'general', quantity: 1, unit_cost: ctPrice, total_cost: ctPrice, notes: '' });
      }
    }

    // Sigenergy EV charger
    if (wantEV && invBrand === 'Sigenergy') {
      var evRows = (catalog['Inverters - Sigenergy'] || []).filter(function(r) {
        return Object.values(r).join(' ').toLowerCase().indexOf('evdc') >= 0;
      });
      if (evRows.length) {
        var ev = evRows[0];
        var evPrice = extractPrice(ev);
        var evModel = extractField(ev, ['รุ่น', 'model']) || 'EVDC 25';
        items.push({ part_number: evModel, part_name: evModel + ' DC EV Charger', manufacturer: 'Sigenergy', category: 'EV charger', quantity: 1, unit_cost: evPrice, total_cost: evPrice, notes: '' });
      }
      wantEV = false;
    }

    // Sigenergy accessories (gateway, sensor, kit, switch, ADCU — all MANDATORY)
    if (invBrand === 'Sigenergy') {
      // Gateway: 1P=HomePro SP-F, 3P 10kW=Home TP 30K, 3P 20-25kW=C60-2
      var gwSearchKey, gwFallbackName, gwFallbackPrice;
      if (phase === '1P') {
        gwSearchKey = 'HomePro SP-F';
        gwFallbackName = 'Gateway HomePro SP-F';
        gwFallbackPrice = 33400;
      } else if (systemKw >= 20) {
        gwSearchKey = 'C60-2';
        gwFallbackName = 'Gateway C60-2';
        gwFallbackPrice = 35000;
      } else {
        gwSearchKey = 'Home TP 30K';
        gwFallbackName = 'Gateway Home TP 30K';
        gwFallbackPrice = 15800;
      }
      var gwRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf(gwSearchKey) >= 0; });
      var gwPrice = gwRow ? (extractPrice(gwRow) || gwFallbackPrice) : gwFallbackPrice;
      var gwName = gwRow ? (extractField(gwRow, ['รุ่น (Model)', 'รุ่น', 'model']) || gwFallbackName) : gwFallbackName;
      items.push({ part_number: gwName, part_name: gwName, manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: gwPrice, total_cost: gwPrice, notes: '' });

      // Power Sensor
      var sensorName = phase === '1P' ? 'Sensor SP-CT100' : 'Sensor TP-CT100';
      var sensorPrice = phase === '1P' ? 2400 : 4600;
      var sensorRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf(sensorName) >= 0; });
      if (sensorRow) sensorPrice = extractPrice(sensorRow) || sensorPrice;
      items.push({ part_number: sensorName, part_name: sensorName, manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: sensorPrice, total_cost: sensorPrice, notes: '' });

      // Ground-mounted Kit Adjustable (mandatory for all Sigenergy)
      var gmKitRow = invRows.find(function(r) {
        var v = Object.values(r).join(' ');
        return /Ground.?mounted.*Kit/i.test(v) && /Adjust/i.test(v);
      });
      var gmKitPrice = gmKitRow ? (extractPrice(gmKitRow) || 4600) : 4600;
      var gmKitName = gmKitRow ? (extractField(gmKitRow, ['รุ่น (Model)', 'รุ่น', 'model']) || 'Ground-mounted Kit Adjustable') : 'Ground-mounted Kit Adjustable';
      items.push({ part_number: gmKitName, part_name: gmKitName, manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: gmKitPrice, total_cost: gmKitPrice, notes: '' });

      // ADCU WIFI LAN 10 str (mandatory)
      var adcuRow = invRows.find(function(r) { return /ADCU/i.test(Object.values(r).join(' ')); });
      var adcuPrice = adcuRow ? (extractPrice(adcuRow) || 3330) : 3330;
      items.push({ part_number: 'ADCU WIFI LAN 10 str', part_name: 'ADCU WIFI LAN 10 str', manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: adcuPrice, total_cost: adcuPrice, notes: '' });

      // Emergency Switch (mandatory)
      var emgRow = invRows.find(function(r) { return /Emergency\s*Switch/i.test(Object.values(r).join(' ')); });
      var emgPrice = emgRow ? (extractPrice(emgRow) || 700) : 700;
      items.push({ part_number: 'Emergency Switch', part_name: 'Emergency Switch', manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: emgPrice, total_cost: emgPrice, notes: '' });
    }

    // Sigenergy battery — BAT 6.0 (6kWh) / BAT 10.0 (9kWh) combination to match target, max 6 units
    if (wantBatt && invBrand === 'Sigenergy') {
      var bat6Row = invRows.find(function(r) {
        var v = Object.values(r).join(' ');
        return /BAT\s*6(?:\.0)?/i.test(v);
      });
      var bat10Row = invRows.find(function(r) {
        var v = Object.values(r).join(' ');
        return /BAT\s*10(?:\.0)?/i.test(v);
      });
      var bat6Price = bat6Row ? extractPrice(bat6Row) : 66000;   // fallback estimate
      var bat10Price = bat10Row ? extractPrice(bat10Row) : 95000; // fallback estimate

      // BAT 6.0 = 6 kWh, BAT 10.0 = 9 kWh (per sheet spec)
      var K6 = 6, K10 = 9;

      // Target kWh: explicit battKwh OR battQty × 6
      var targetKwh = battKwh > 0 ? battKwh : (battQty > 0 ? battQty * K6 : K6);
      // Find combination (n6, n10) with total kWh >= targetKwh, min waste, max 6 units total
      var best = null;
      for (var n10 = 0; n10 <= 6; n10++) {
        for (var n6 = 0; n6 <= 6 - n10; n6++) {
          if (n6 === 0 && n10 === 0) continue;
          var totalKwh = n6 * K6 + n10 * K10;
          if (totalKwh < targetKwh) continue;
          var waste = totalKwh - targetKwh;
          var totalCost = n6 * bat6Price + n10 * bat10Price;
          if (!best || waste < best.waste || (waste === best.waste && totalCost < best.totalCost)) {
            best = { n6: n6, n10: n10, waste: waste, totalCost: totalCost, totalKwh: totalKwh };
          }
        }
      }
      // If target > max (6 × 9 = 54 kWh), cap at 6×BAT 10.0
      if (!best) {
        best = { n6: 0, n10: 6, waste: 0, totalCost: 6 * bat10Price, totalKwh: 54 };
      }
      if (best.n6 > 0) {
        items.push({ part_number: 'SigenStor BAT 6.0', part_name: 'SigenStor BAT 6.0 Battery (6kWh)', manufacturer: 'Sigenergy', category: 'battery', quantity: best.n6, unit_cost: bat6Price, total_cost: bat6Price * best.n6, notes: bat6Row ? '' : 'ราคาประมาณการ' });
      }
      if (best.n10 > 0) {
        items.push({ part_number: 'SigenStor BAT 10.0', part_name: 'SigenStor BAT 10.0 Battery (9kWh)', manufacturer: 'Sigenergy', category: 'battery', quantity: best.n10, unit_cost: bat10Price, total_cost: bat10Price * best.n10, notes: bat10Row ? '' : 'ราคาประมาณการ' });
      }
      wantBatt = false;
    }
  }

  // ── Sigenergy Optimizer (mandatory — 2:1 per panel count) ──
  var _sigOptData = null;
  if (invBrand === 'Sigenergy') {
    // Fetch optimizer price from Sigenergy sheet
    var optPrice = 1660;
    (invRows || []).forEach(function(r) {
      var m = (r['รุ่น (Model)'] || '').trim();
      var c = parseFloat((r['ราคาสั่งซื้อ (฿)'] || '0').replace(/,/g, ''));
      if (/Optimizer/i.test(m) && c > 0) optPrice = c;
    });
    _sigOptData = { optPrice: optPrice };
  }

  // ── Find panels — default to AIKO 670W for all inverter brands ──
  // Skipped for ATMOCE SRP mode — panel item is already in SRP BOM lines.
  if (!panelWatts && systemKw) panelWatts = 670;
  if (!panelBrand && panelWatts) panelBrand = 'AIKO';
  var panelQty = explicitPanelQty > 0 ? explicitPanelQty : (panelWatts > 0 ? Math.ceil((systemKw * 1000) / panelWatts) : 8);

  if (!srpModeItems && (panelBrand || panelWatts)) {
    var panelRows = catalog['Solar Panels'] || [];
    var bestPanel = null, bestPDiff = 9999;
    panelRows.forEach(function(r) {
      var vals = Object.values(r).join(' ').toLowerCase();
      if (panelBrand && vals.indexOf(panelBrand.toLowerCase()) < 0) return;
      // Match watts
      var wMatch = vals.match(/(\d{3,4})/g);
      if (wMatch) {
        wMatch.forEach(function(w) {
          var ww = parseInt(w);
          if (ww >= 400 && ww <= 900) {
            var d = Math.abs(ww - (panelWatts || 625));
            if (d < bestPDiff) { bestPDiff = d; bestPanel = r; }
          }
        });
      }
    });
    if (bestPanel) {
      var pPrice = extractPrice(bestPanel);
      var pModel = extractField(bestPanel, ['รุ่น', 'model']) || panelBrand + ' ' + panelWatts + 'W';
      var pBrand = extractField(bestPanel, ['แบรนด์']) || Object.values(bestPanel)[0] || panelBrand;
      var pWatts = '';
      var pKeys = Object.keys(bestPanel);
      for (var pi = 0; pi < pKeys.length; pi++) {
        if (pKeys[pi].toLowerCase().indexOf('กำลังไฟ') >= 0 || pKeys[pi].toLowerCase().indexOf('w') >= 0) { pWatts = bestPanel[pKeys[pi]]; break; }
      }
      items.push({ part_number: pModel, part_name: pModel + ' (' + (pWatts || panelWatts) + 'W)', manufacturer: pBrand, category: 'โมดูล', quantity: panelQty, unit_cost: pPrice, total_cost: panelQty * pPrice, notes: '' });
    }
  }

  // ── Sigenergy Optimizer items (mandatory — 2:1 after panels are determined) ──
  if (invBrand === 'Sigenergy' && _sigOptData && panelQty > 0) {
    var sigOptQty = Math.max(1, Math.ceil(panelQty / 2));
    items.push({ part_number: 'Optimizer 1200-1500', part_name: 'Optimizer 1200-1500W 2:1', manufacturer: 'Sigenergy', category: 'general', quantity: sigOptQty, unit_cost: _sigOptData.optPrice, total_cost: _sigOptData.optPrice * sigOptQty, notes: '2:1 ratio (1 per 2 panels)' });
  }

  // ── Find battery (generic) ──
  // Brand compatibility map (inverter → compatible battery brands)
  var battBrandCompat = {
    'Sigenergy': ['sigenergy'],
    'Deye': ['deye', 'dyness'],
    'Solis': ['dyness', 'solis'],
    'Huawei': ['huawei'],
    'Hoymiles': ['hoymiles'],
    'ATMOCE': ['atmoce'],
  };
  if (wantBatt) {
    var battRows = catalog['Batteries'] || [];
    var battCandidates = [];
    var compatBrands = battBrandCompat[invBrand] || [];
    battRows.forEach(function(r) {
      var vals = Object.values(r).join(' ').toLowerCase();
      // Skip rows without recognized battery brand
      if (vals.indexOf('dyness') < 0 && vals.indexOf('deye') < 0 && vals.indexOf('eenovance') < 0 && vals.indexOf('sigenergy') < 0 && vals.indexOf('atmoce') < 0 && vals.indexOf('huawei') < 0) return;
      // Filter by brand compatibility
      if (invBrand && compatBrands.length > 0) {
        var brandOk = compatBrands.some(function(cb) { return vals.indexOf(cb) >= 0; });
        if (!brandOk) return;
      }
      // Skip controller/accessory rows
      if (vals.indexOf('controller') >= 0) return;
      var price = extractPrice(r);
      if (price <= 0) return;
      var keys = Object.keys(r);
      for (var bi = 0; bi < keys.length; bi++) {
        if (keys[bi].toLowerCase().indexOf('kwh') >= 0 || keys[bi].toLowerCase().indexOf('ขนาด') >= 0) {
          var bkwh = parseFloat(r[keys[bi]]);
          if (bkwh > 0) {
            battCandidates.push({ row: r, kwh: bkwh, price: price });
          }
          break;
        }
      }
    });
    var bestBatt = null;
    if (battCandidates.length > 0 && battKwh > 0) {
      // Find best model × qty: prefer total_kwh >= requested, smallest overshoot
      var bestCombo = null;
      battCandidates.forEach(function(c) {
        var qtyCeil = Math.max(1, Math.ceil(battKwh / c.kwh));
        var qtyFloor = Math.max(1, Math.floor(battKwh / c.kwh));
        [qtyFloor, qtyCeil].forEach(function(q) {
          var totalKwh = c.kwh * q;
          var over = totalKwh - battKwh;
          if (!bestCombo) { bestCombo = { c: c, qty: q, over: over }; return; }
          // Prefer >= requested (over >= 0)
          if (over >= 0 && bestCombo.over < 0) { bestCombo = { c: c, qty: q, over: over }; return; }
          if (over >= 0 && bestCombo.over >= 0 && over < bestCombo.over) { bestCombo = { c: c, qty: q, over: over }; return; }
          if (over < 0 && bestCombo.over < 0 && over > bestCombo.over) { bestCombo = { c: c, qty: q, over: over }; return; }
        });
      });
      if (bestCombo) {
        var bc = bestCombo.c;
        var bPrice = bc.price;
        var bModel = extractField(bc.row, ['รุ่น', 'model']) || 'Battery';
        var bBrand = Object.values(bc.row)[0] || '';
        var gbQty = battQty > 1 ? battQty : bestCombo.qty;
        items.push({ part_number: bModel, part_name: bModel + ' Battery', manufacturer: bBrand, category: 'battery', quantity: gbQty, unit_cost: bPrice, total_cost: bPrice * gbQty, notes: '' });
        bestBatt = bc.row;
      }
    } else if (battCandidates.length > 0) {
      // No specific kWh — pick smallest battery × 1
      var smallest = battCandidates.reduce(function(a, b) { return a.kwh < b.kwh ? a : b; });
      var bPrice = smallest.price;
      var bModel = extractField(smallest.row, ['รุ่น', 'model']) || 'Battery';
      var bBrand = Object.values(smallest.row)[0] || '';
      var gbQty = battQty > 1 ? battQty : 1;
      items.push({ part_number: bModel, part_name: bModel + ' Battery', manufacturer: bBrand, category: 'battery', quantity: gbQty, unit_cost: bPrice, total_cost: bPrice * gbQty, notes: '' });
      bestBatt = smallest.row;
    }
    if (!bestBatt && battRows.length) {
      // Absolute fallback: first battery with a price
      bestBatt = battRows.find(function(r) { return extractPrice(r) > 0; });
      if (bestBatt) {
        var bPrice = extractPrice(bestBatt);
        var bModel = extractField(bestBatt, ['รุ่น', 'model']) || 'Battery';
        var bBrand = Object.values(bestBatt)[0] || '';
        var gbQty = battQty > 1 ? battQty : 1;
        items.push({ part_number: bModel, part_name: bModel + ' Battery', manufacturer: bBrand, category: 'battery', quantity: gbQty, unit_cost: bPrice, total_cost: bPrice * gbQty, notes: '' });
      }
    }
  }

  // ── Find backup box (generic) ──
  if (wantBackup) {
    var cbRows = catalog['Combiner Box & Others'] || [];
    if (cbRows.length) {
      var cb = cbRows[0];
      var cbPrice = extractPrice(cb);
      var cbName = extractField(cb, ['รายการ', 'description']) || 'Combiner Box';
      items.push({ part_number: '', part_name: cbName, manufacturer: 'Enervia', category: 'general', quantity: 1, unit_cost: cbPrice, total_cost: cbPrice, notes: '' });
    }
  }

  // ── Keenoc mounting — skipped for ATMOCE SRP mode (MOUNTING lump-sum covers it) ──
  if (srpModeItems) { return items; } // SRP BOM complete — panels/mounting/cables already included
  var keenocRows = catalog['Mounting - Keenoc'] || [];
  function keenocSearch(keyword) {
    for (var ki = 0; ki < keenocRows.length; ki++) {
      var vals = Object.values(keenocRows[ki]).join(' ').toLowerCase();
      if (vals.indexOf(keyword.toLowerCase()) >= 0) {
        var p = extractPrice(keenocRows[ki]);
        if (p > 0) return { row: keenocRows[ki], price: p };
      }
    }
    return null;
  }

  // Rail 4200mm — 1 per panel
  var rail = keenocSearch('4200') || keenocSearch('Rail');
  if (rail) {
    var railName = extractField(rail.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Rail 4200mm';
    items.push({ part_number: 'RAIL-4200', part_name: railName, manufacturer: 'Keenoc', category: 'mounting_rail', quantity: panelQty, unit_cost: rail.price, total_cost: panelQty * rail.price, notes: '1 rail per panel' });
  }

  // End Clamp — panel_qty * 2
  var ec = keenocSearch('End Clamp') || keenocSearch('End');
  if (ec) {
    var ecQty = panelQty * 2;
    var ecName = extractField(ec.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'End Clamp';
    items.push({ part_number: 'END-CLAMP', part_name: ecName, manufacturer: 'Keenoc', category: 'mounting_clamp', quantity: ecQty, unit_cost: ec.price, total_cost: ecQty * ec.price, notes: '' });
  }

  // Mid Clamp — (panel_qty - 1) * 2
  var mc = keenocSearch('Mid Clamp') || keenocSearch('Mid');
  if (mc) {
    var mcQty = Math.max(0, (panelQty - 1) * 2);
    var mcName = extractField(mc.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Mid Clamp';
    items.push({ part_number: 'MID-CLAMP', part_name: mcName, manufacturer: 'Keenoc', category: 'mounting_clamp', quantity: mcQty, unit_cost: mc.price, total_cost: mcQty * mc.price, notes: '' });
  }

  // ── Roof Anchor (by roof type) — 2 per panel ──
  var raQty = panelQty * 2;
  var raPn, raFallback, raItem;
  if (roofType === 'tile') {
    raPn = 'TILE-HOOK'; raFallback = 'Tile Roof Hook';
    raItem = keenocSearch('Tile Roof Hook') || keenocSearch('Tile');
  } else if (roofType === 'hangerbolt') {
    raPn = 'HANGERBOLT'; raFallback = 'Hangerbolt';
    raItem = keenocSearch('Hangerbolt') || keenocSearch('Hanger');
  } else if (roofType === 'kliplock') {
    raPn = 'KLIPLOCK-717'; raFallback = 'Kliplock 717';
    raItem = keenocSearch('Kliplock 717') || keenocSearch('Kliplock');
  } else {
    // default: เมทัลชีท → L-Feet 8cm
    raPn = 'L-FEET-8CM'; raFallback = 'L-Feet 8cm';
    raItem = keenocSearch('L-Feet 8cm') || keenocSearch('L-Feet');
  }
  if (raItem) {
    var raName = extractField(raItem.row, ['รุ่น', 'model', 'รายการ', 'description']) || raFallback;
    items.push({ part_number: raPn, part_name: raName, manufacturer: 'Keenoc', category: 'mounting_roof_anchor', quantity: raQty, unit_cost: raItem.price, total_cost: raQty * raItem.price, notes: '2 per panel (' + roofType + ')' });
  } else {
    items.push({ part_number: raPn, part_name: raFallback, manufacturer: 'Keenoc', category: 'mounting_roof_anchor', quantity: raQty, unit_cost: 0, total_cost: 0, notes: '2 per panel (' + roofType + ') — price TBC' });
  }

  // ── Grounding Accessories ──
  // Grounding Lug — 1 per panel
  var glu = keenocSearch('Grounding Lug') || keenocSearch('Lug');
  if (glu) {
    var gluName = extractField(glu.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Grounding Lug';
    items.push({ part_number: 'GND-LUG', part_name: gluName, manufacturer: 'Keenoc', category: 'mounting_other', quantity: panelQty, unit_cost: glu.price, total_cost: panelQty * glu.price, notes: '1 per panel' });
  } else {
    items.push({ part_number: 'GND-LUG', part_name: 'Grounding Lug', manufacturer: 'Keenoc', category: 'mounting_other', quantity: panelQty, unit_cost: 0, total_cost: 0, notes: '1 per panel — price TBC' });
  }

  // Earthing Clip — 2 per panel
  var ecl = keenocSearch('Earthing Clip') || keenocSearch('Earth');
  var eclQty = panelQty * 2;
  if (ecl) {
    var eclName = extractField(ecl.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Earthing Clip';
    items.push({ part_number: 'EARTH-CLIP', part_name: eclName, manufacturer: 'Keenoc', category: 'mounting_other', quantity: eclQty, unit_cost: ecl.price, total_cost: eclQty * ecl.price, notes: '2 per panel' });
  } else {
    items.push({ part_number: 'EARTH-CLIP', part_name: 'Earthing Clip', manufacturer: 'Keenoc', category: 'mounting_other', quantity: eclQty, unit_cost: 0, total_cost: 0, notes: '2 per panel — price TBC' });
  }

  // Cable Clip — 5 per panel
  var ccl = keenocSearch('Cable Clip') || keenocSearch('Clip');
  var cclQty = panelQty * 5;
  if (ccl) {
    var cclName = extractField(ccl.row, ['รุ่น', 'model', 'รายการ', 'description']) || 'Cable Clip';
    items.push({ part_number: 'CABLE-CLIP', part_name: cclName, manufacturer: 'Keenoc', category: 'mounting_other', quantity: cclQty, unit_cost: ccl.price, total_cost: cclQty * ccl.price, notes: '5 per panel' });
  } else {
    items.push({ part_number: 'CABLE-CLIP', part_name: 'Cable Clip', manufacturer: 'Keenoc', category: 'mounting_other', quantity: cclQty, unit_cost: 0, total_cost: 0, notes: '5 per panel — price TBC' });
  }

  // ── Cables ──
  var cableRows = catalog['Cables'] || [];
  function cableSearch(keyword) {
    for (var ci = 0; ci < cableRows.length; ci++) {
      var vals = Object.values(cableRows[ci]).join(' ').toLowerCase();
      if (vals.indexOf(keyword.toLowerCase()) >= 0) {
        // Prefer ราคา ≥50,000 column
        var keys = Object.keys(cableRows[ci]);
        for (var cj = 0; cj < keys.length; cj++) {
          if (keys[cj].indexOf('ราคา') >= 0 && keys[cj].indexOf('50,000') >= 0 && keys[cj].indexOf('≥') >= 0) {
            var v = parseFloat(String(cableRows[ci][keys[cj]]).replace(/[,]/g, ''));
            if (v > 0) return { row: cableRows[ci], price: v };
          }
        }
        var p = extractPrice(cableRows[ci]);
        if (p > 0) return { row: cableRows[ci], price: p };
      }
    }
    return null;
  }

  // DC Cable — Sigenergy: Link 6sqmm (CB-1060AB), others: Link 4sqmm (CB-1040AB)
  var dcPN = invBrand === 'Sigenergy' ? 'CB-1060AB' : 'CB-1040AB';
  var dcFallback = invBrand === 'Sigenergy' ? 'CB-1060AB (6sqmm)' : 'CB-1040AB (4sqmm)';
  var dcCable = cableSearch(dcPN);
  if (dcCable) {
    var dcMeters = systemKw * 10;
    var dcName = extractField(dcCable.row, ['รุ่น', 'ขนาด']) || dcFallback;
    items.push({ part_number: dcPN, part_name: 'PV Cable ' + dcName, manufacturer: 'LINK', category: 'cable', quantity: dcMeters, unit_cost: dcCable.price, total_cost: dcMeters * dcCable.price, notes: 'DC ~' + dcMeters + 'm' });
  }

  // MC4 Connector — 1 pair per panel
  var mc4 = cableSearch('MC4');
  if (mc4) {
    items.push({ part_number: 'CB-1002', part_name: 'MC4 Connector', manufacturer: 'LINK', category: 'cable', quantity: panelQty, unit_cost: mc4.price, total_cost: panelQty * mc4.price, notes: '1 pair/panel' });
  }

  // AC Cable — Sigenergy: VCT 2C*4, others: FR-CV 2x4 (1P) / FR-CV 4x4 (3P)
  var acCable, acPN, acFallback;
  if (invBrand === 'Sigenergy') {
    acCable = cableSearch('VCT 2C') || cableSearch('FR-CV 2x4');
    acPN = 'VCT-2Cx4'; acFallback = 'VCT 2C*4 Sqmm';
  } else {
    var acKeyword = phase === '1P' ? 'FR-CV 2x4' : 'FR-CV 4x4';
    acCable = cableSearch(acKeyword);
    acPN = acKeyword; acFallback = acKeyword;
  }
  if (acCable) {
    var acName = extractField(acCable.row, ['รุ่น', 'ขนาด']) || acFallback;
    items.push({ part_number: acPN, part_name: 'AC Cable ' + acName, manufacturer: 'BCC', category: 'cable', quantity: 1, unit_cost: acCable.price, total_cost: acCable.price, notes: '1 roll (100m)' });
  }

  // Ground Cable — GND 1x4 — 1 roll
  var gndCable = cableSearch('GND 1x4');
  if (gndCable) {
    var gndName = extractField(gndCable.row, ['รุ่น', 'ขนาด']) || 'GND 1x4 GY';
    items.push({ part_number: 'GND-1x4', part_name: 'Ground Cable ' + gndName, manufacturer: 'BCC', category: 'cable', quantity: 1, unit_cost: gndCable.price, total_cost: gndCable.price, notes: '1 roll (100m)' });
  }

  // Sigenergy extra: cable tray + adhesive kit
  if (invBrand === 'Sigenergy') {
    items.push({ part_number: 'CABLE-TRAY', part_name: 'รางเก็บสาย+ท่อ ตามหน้างาน', manufacturer: 'Enervia', category: 'general', quantity: 1, unit_cost: 0, total_cost: 0, notes: 'ตามหน้างาน' });
    items.push({ part_number: 'ADHESIVE-KIT', part_name: 'ชุดกาวแผงสายไฟ 16/110', manufacturer: 'Enervia', category: 'general', quantity: 1, unit_cost: 0, total_cost: 0, notes: 'ตามหน้างาน' });
  }

  // ── ATMOCE battery-only kit (attach ATMOCE batt to a non-ATMOCE inverter) ──
  if (atmoceBattKit) {
    var atmoceRows = catalog['Inverters - ATMOCE'] || [];
    // MA-ESSKits-S (1P) or MA-ESSKits-T (3P)
    var kitSku = phase === '1P' ? 'MA-ESSKits-S' : 'MA-ESSKits-T';
    var kitRow = atmoceRows.find(function(r) { return Object.values(r).join(' ').indexOf(kitSku) >= 0; });
    if (kitRow) {
      var kitPrice = extractPrice(kitRow);
      var kitName = extractField(kitRow, ['sku', 'รายการ']) || kitSku;
      var kitDesc = extractField(kitRow, ['description', 'คำอธิบาย', 'รายละเอียด']) || (phase === '1P' ? 'Single-phase Kits for M-ELV battery' : 'Three-phase Kits for M-ELV battery');
      items.push({ part_number: kitName, part_name: kitName + ' ' + kitDesc, manufacturer: 'ATMOCE', category: 'battery', quantity: 1, unit_cost: kitPrice, total_cost: kitPrice, notes: 'พ่วง ATMOCE batt กับ ' + invBrand });
    }
    // MS-7K-U battery units
    var msRow = atmoceRows.find(function(r) { return Object.values(r).join(' ').indexOf('MS-7K') >= 0; });
    if (msRow) {
      var msQty;
      if (battKwh > 0) msQty = Math.max(1, Math.ceil(battKwh / 7));
      else if (battQty >= 7) msQty = Math.max(1, Math.ceil(battQty / 7));
      else if (battQty > 1) msQty = battQty;
      else msQty = 1;
      if (phase === '1P' && msQty > 3) msQty = 3;
      var msPrice = extractPrice(msRow);
      items.push({ part_number: 'MS-7K-U', part_name: 'M-Battery 7kWh', manufacturer: 'ATMOCE', category: 'battery', quantity: msQty, unit_cost: msPrice, total_cost: msPrice * msQty, notes: 'พ่วง ATMOCE batt กับ ' + invBrand });
    }
  }

  return items;
}

// ─── Manual item parser (fallback) ───────────────────────────
function parseItem(text, catalog) {
  const sep = text.includes('/') ? '/' : ',';
  const p = text.split(sep).map(function(s) { return s.trim(); });
  if (p.length >= 3) {
    const nm = p[0], mfr = p.length >= 4 ? p[1] : '';
    const q = parseFloat((p.length >= 4 ? p[2] : p[1]).replace(/[,฿บาท\s]/g, ''));
    const c = parseFloat((p.length >= 4 ? p[3] : p[2]).replace(/[,฿บาท\s]/g, ''));
    if (q > 0 && c >= 0) return { part_number: '', part_name: nm, manufacturer: mfr, category: guessCat(nm), quantity: q, unit_cost: c, total_cost: q * c, notes: '', _from: 'manual' };
  }
  // Fallback: catalog lookup — "product name, qty"
  if (p.length >= 2 && catalog) {
    var qty = parseFloat(p[p.length - 1].replace(/[,฿บาท\s]/g, ''));
    if (qty > 0) {
      var searchTerm = p.slice(0, p.length - 1).join(' ');
      var matches = searchCatalog(catalog, searchTerm);
      if (matches.length > 0) {
        var hit = matches[0];
        var price = extractPrice(hit);
        var name = extractField(hit, ['รุ่น', 'model', 'ชื่อ', 'description', 'รายการ']) || searchTerm;
        var mfr2 = extractField(hit, ['แบรนด์', 'ผู้ผลิต', 'vendor']) || Object.values(hit)[0] || '';
        if (price > 0) {
          return { part_number: '', part_name: name, manufacturer: mfr2, category: guessCat(name), quantity: qty, unit_cost: price, total_cost: qty * price, notes: '📊 catalog', _from: 'catalog', _sheet: hit._sheet };
        }
      }
    }
  }
  return null;
}

function generateBomHtml(data) {
  var tc = 0;
  data.items.forEach(function(i) { tc += i.total_cost; });

  // Calculate actual system Wp from panel items first, fallback to project name
  var systemKw = 0;
  data.items.forEach(function(i) {
    if (i.category === 'โมดูล') {
      var wMatch = i.part_name.match(/(\d{3,4})\s*W/i);
      if (wMatch) systemKw = Math.round(i.quantity * parseInt(wMatch[1]) / 1000);
    }
  });
  if (!systemKw) {
    var kwMatch = (data.project_name || '').match(/(\d+)\s*kw/i);
    systemKw = kwMatch ? parseInt(kwMatch[1]) : 5;
  }
  var systemWp = systemKw * 1000;
  var labor = systemWp * 4.5;
  var bos = systemWp * 0.7;
  var errorCost = systemWp * 1.0;
  var crane = systemKw >= 30 ? 15000 : 0;
  var vat = tc * 0.07;
  var peaTable = [[10,6000],[20,8500],[30,12500],[40,15500],[100,21500],[200,24000],[500,36000],[1000,46000]];
  var peaFee = 0;
  for (var pi = 0; pi < peaTable.length; pi++) {
    if (systemKw <= peaTable[pi][0]) { peaFee = peaTable[pi][1]; break; }
  }
  var grandTotal = tc + vat + labor + bos + errorCost + crane + peaFee;

  function fmt(n) { return n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }

  var itemRows = '';
  data.items.forEach(function(it, i) {
    itemRows += '<tr' + (i % 2 === 1 ? ' class="alt"' : '') + '>' +
      '<td class="center">' + (i+1) + '</td>' +
      '<td>' + (it.part_number || '') + '</td>' +
      '<td>' + (it.part_name || '') + '</td>' +
      '<td>' + (it.manufacturer || '') + '</td>' +
      '<td class="center">' + (it.category || '') + '</td>' +
      '<td class="center">' + it.quantity + '</td>' +
      '<td class="right">\u0e3f' + it.unit_cost.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
      '<td class="right">\u0e3f' + it.total_cost.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
      '</tr>\n';
  });

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>BOM - ' + (data.project_name || 'Enervia') + '</title>' +
    '<style>' +
    '@media print { .no-print { display: none !important; } body { margin: 0; } .page { box-shadow: none !important; margin: 0 !important; } }' +
    '* { box-sizing: border-box; margin: 0; padding: 0; }' +
    'body { font-family: "Sarabun", "TH Sarabun New", "Segoe UI", Arial, sans-serif; background: #eee; color: #333; }' +
    '.page { max-width: 1100px; margin: 20px auto; background: #fff; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }' +
    '.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1a237e; padding-bottom: 15px; margin-bottom: 20px; }' +
    '.header h1 { color: #1a237e; font-size: 22px; }' +
    '.header .logo { font-size: 28px; font-weight: bold; color: #1a237e; }' +
    '.info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; font-size: 14px; }' +
    '.info b { color: #1a237e; }' +
    'table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }' +
    'th { background: #1a237e; color: #fff; padding: 8px 6px; text-align: left; font-size: 12px; }' +
    'td { padding: 6px; border-bottom: 1px solid #ddd; }' +
    'tr.alt { background: #f5f5f5; }' +
    '.center { text-align: center; }' +
    '.right { text-align: right; }' +
    '.total-row { background: #e8eaf6 !important; font-weight: bold; }' +
    '.cost-summary { max-width: 400px; margin-left: auto; margin-top: 20px; }' +
    '.cost-summary table { font-size: 14px; }' +
    '.cost-summary td { padding: 4px 8px; }' +
    '.cost-summary .grand { background: #1a237e; color: #fff; font-size: 16px; font-weight: bold; }' +
    '.footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; color: #888; font-size: 12px; }' +
    '.btn { display: inline-block; padding: 10px 20px; background: #1a237e; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; text-decoration: none; margin: 5px; }' +
    '.btn:hover { background: #303f9f; }' +
    '.actions { text-align: center; margin-bottom: 20px; }' +
    '</style></head><body>' +
    '<div class="no-print actions" style="text-align:center;padding:15px;">' +
    '<button class="btn" onclick="window.print()">\ud83d\udda8\ufe0f \u0e1e\u0e34\u0e21\u0e1e\u0e4c / Save as PDF</button>' +
    '</div>' +
    '<div class="page">' +
    '<div class="header"><div class="logo">ENERVIA GROUP</div><h1>\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e27\u0e31\u0e2a\u0e14\u0e38 (Bill of Materials)</h1></div>' +
    '<div class="info">' +
    '<div><b>\u0e42\u0e1b\u0e23\u0e40\u0e08\u0e01\u0e15\u0e4c:</b> ' + (data.project_name || '-') + '</div>' +
    '<div><b>\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48:</b> ' + (data.order_date || '-') + '</div>' +
    '<div><b>\u0e17\u0e35\u0e48\u0e2d\u0e22\u0e39\u0e48:</b> ' + (data.project_address || '-') + '</div>' +
    '<div><b>\u0e02\u0e19\u0e32\u0e14\u0e23\u0e30\u0e1a\u0e1a:</b> ' + systemKw + ' kWp</div>' +
    '</div>' +
    '<table><thead><tr>' +
    '<th class="center">#</th><th>Part No.</th><th>\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23</th><th>\u0e1c\u0e39\u0e49\u0e1c\u0e25\u0e34\u0e15</th><th class="center">\u0e2b\u0e21\u0e27\u0e14</th><th class="center">\u0e08\u0e33\u0e19\u0e27\u0e19</th><th class="right">\u0e23\u0e32\u0e04\u0e32/\u0e2b\u0e19\u0e48\u0e27\u0e22</th><th class="right">\u0e23\u0e27\u0e21</th>' +
    '</tr></thead><tbody>' +
    itemRows +
    '<tr class="total-row"><td colspan="5"></td><td class="center">\u0e22\u0e2d\u0e14\u0e23\u0e27\u0e21</td><td></td><td class="right">\u0e3f' + fmt(tc) + '</td></tr>' +
    '</tbody></table>' +
    '<div class="cost-summary"><table>' +
    '<tr><td>\u0e04\u0e48\u0e32\u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c</td><td class="right">\u0e3f' + fmt(tc) + '</td></tr>' +
    '<tr><td>VAT 7%</td><td class="right">\u0e3f' + fmt(vat) + '</td></tr>' +
    '<tr><td>\u0e04\u0e48\u0e32\u0e41\u0e23\u0e07 (Labor)</td><td class="right">\u0e3f' + fmt(labor) + '</td></tr>' +
    '<tr><td>BOS</td><td class="right">\u0e3f' + fmt(bos) + '</td></tr>' +
    '<tr><td>Error Cost</td><td class="right">\u0e3f' + fmt(errorCost) + '</td></tr>' +
    (crane > 0 ? '<tr><td>Crane</td><td class="right">\u0e3f' + fmt(crane) + '</td></tr>' : '') +
    '<tr><td>PEA/MEA</td><td class="right">\u0e3f' + fmt(peaFee) + '</td></tr>' +
    '<tr class="grand"><td>Grand Total</td><td class="right">\u0e3f' + fmt(grandTotal) + '</td></tr>' +
    '</table></div>' +
    '<div class="footer">Enervia Group Co.,Ltd. \u2022 Generated by Nasri Oracle \u2022 ' + new Date().toISOString().slice(0,10) + '</div>' +
    '</div></body></html>';
}

// Build BOM result flex card — extracted to lib/flex-builders.js
var buildBomResultFlex = _flex.buildBomResultFlex;

function summary(d) {
  var tc = 0, tq = 0;
  d.items.forEach(function(i) { tc += i.total_cost; tq += i.quantity; });

  // Calculate actual system Wp from panel items first, fallback to project name
  var systemKw = 0;
  d.items.forEach(function(i) {
    if (i.category === 'โมดูล') {
      var wMatch = i.part_name.match(/(\d{3,4})\s*W/i);
      if (wMatch) systemKw = Math.round(i.quantity * parseInt(wMatch[1]) / 1000);
    }
  });
  if (!systemKw) {
    var kwMatch = (d.project_name || '').match(/(\d+)\s*kw/i);
    systemKw = kwMatch ? parseInt(kwMatch[1]) : 5;
  }

  var systemWp = systemKw * 1000;
  var labor = systemWp * 4.5;
  var bos = systemWp * 0.7;
  var errorCost = systemWp * 1.0;
  var crane = systemKw >= 30 ? 15000 : 0;
  var vat = tc * 0.07;

  // PEA/MEA fee lookup table
  var peaTable = [[10,6000],[20,8500],[30,12500],[40,15500],[100,21500],[200,24000],[500,36000],[1000,46000]];
  var peaFee = 0;
  for (var pi = 0; pi < peaTable.length; pi++) {
    if (systemKw <= peaTable[pi][0]) { peaFee = peaTable[pi][1]; break; }
  }

  var grandTotal = tc + vat + labor + bos + errorCost + crane + peaFee;

  var t = '📋 สรุป BOM\n━━━━━━━━━━━━━━━\n';
  if (d.project_name) t += 'โปรเจกต์: ' + d.project_name + '\n';
  if (d.project_address) t += 'ที่อยู่: ' + d.project_address + '\n';
  t += 'วันที่: ' + d.order_date + '\n';
  t += 'ขนาดระบบ: ' + systemKw + ' kWp\n';
  t += '━━━━━━━━━━━━━━━\n';
  d.items.forEach(function(it, i) { t += (i+1) + '. ' + it.part_name + (it.manufacturer ? ' (' + it.manufacturer + ')' : '') + '\n   ' + it.quantity + ' x ฿' + it.unit_cost.toLocaleString() + ' = ฿' + it.total_cost.toLocaleString() + '\n'; });
  t += '━━━━━━━━━━━━━━━\n';
  t += '💰 สรุปค่าใช้จ่าย\n';
  t += '  ค่าอุปกรณ์: ฿' + tc.toLocaleString() + '\n';
  t += '  VAT 7%: ฿' + Math.round(vat).toLocaleString() + '\n';
  t += '  ค่าแรง: ฿' + labor.toLocaleString() + '\n';
  t += '  BOS: ฿' + bos.toLocaleString() + '\n';
  t += '  Error Cost: ฿' + errorCost.toLocaleString() + '\n';
  if (crane > 0) t += '  Crane: ฿' + crane.toLocaleString() + '\n';
  t += '  PEA/MEA: ฿' + peaFee.toLocaleString() + '\n';
  t += '━━━━━━━━━━━━━━━\n';
  t += '✅ Grand Total: ฿' + Math.round(grandTotal).toLocaleString() + '\n';
  return t;
}

// ─── BOM / Quotation PDF generators ──────────────────────────
// Both `generateBomPdf` and `generateQuotationPdf` are now provided by
// lib/python-bridge.js (initialised near the top of this file). The
// script paths and the function references are imported alongside them
// there — nothing more to declare here.

// ─── Quotation Memory ─────────────────────────────────────────
// lastQuotation: key → { brand, size_kw, phase, has_battery, has_backup, specStr, ts }
// quotationPreviewPending: key → { spec, specStr, ts }  ← NEW: preview-before-generate
// quotationConfirmPending: key → { spec, specStr, ts }  ← existing: update detection
var lastQuotation = new Map();
var quotationPreviewPending = new Map();  // รอ confirm ก่อน generate
var quotationConfirmPending = new Map();  // รอ confirm update
var QUOTATION_TTL = 60 * 60 * 1000;
var PREVIEW_TTL   = 10 * 60 * 1000; // 10 นาที — preview หมดอายุ

function isConfirmation(lo) {
  return /^(ใช่|ครับ|ค่ะ|ok|yes|ยืนยัน|ตกลง|โอเค|โอ้เค|confirm|สร้างได้เลย|ได้เลย|ทำได้เลย)\s*$/.test(lo.trim());
}

function isRejection(lo) {
  return /^(ไม่|no|ยกเลิก|cancel|แก้ไข|edit|เปลี่ยน)\s*/.test(lo.trim());
}

// ─── Preview Flex Card — extracted to lib/flex-builders.js ───
var buildPreviewFlex = _flex.buildPreviewFlex;

function isQuotationRequest(lo) {
  // Exclude view/search intents that happen to mention "ใบเสนอราคา" (e.g. "ดูใบเสนอราคาของผม",
  // "หาใบเสนอราคา ของคุณสมชาย") — these belong to history/search, not a new-quote flow.
  if (/^(?:ดู|หา|ค้นหา)/i.test(lo)) return false;
  if (/ของ(?:ฉัน|ผม|เรา)|ประวัติ/i.test(lo)) return false;
  return /ใบเสนอราคา|quotation|เสนอราคา|ขอใบเสนอ|ทำใบเสนอราคา/.test(lo);
}

// v2.0 INT1: detect history/search intents so they bypass the nasri trigger gate
// (so users can type "ดูใบเสนอราคาของผม" or "หาใบของคุณสมชาย" without "นัด" prefix)
function isHistoryOrSearchRequest(lo) {
  if (/^ดู.*ใบ|ประวัติ.*(?:qt|ใบเสนอ)|(?:ใบเสนอ|quotation).*ของ(?:ฉัน|ผม|เรา)|my quotation/i.test(lo)) return true;
  if (/^(?:หา|ค้นหา|search).*(?:ใบ|quotation)/i.test(lo)) return true;
  return false;
}

function parseQuotationSpec(text) {
  text = normalizeThaiInput(text);
  var lo = text.toLowerCase();
  var brand = 'ATMOCE';
  if (/sig(?:energy)?/.test(lo)) brand = 'Sigenergy';
  else if (/huawei/.test(lo)) brand = 'Huawei';
  else if (/deye/.test(lo)) brand = 'Deye';
  else if (/hoymiles|hoy/.test(lo)) brand = 'Hoymiles';
  else if (/sol[io]s/.test(lo)) brand = 'Solis';
  else if (/atmoce/.test(lo)) brand = 'ATMOCE';

  // ATMOCE 2:1 micro-inverter variant — MI-1250 with 2 panels per micro
  // Trigger: "atmoce 2:1 <N>kw <1เฟส|3เฟส>" (kW + phase still parsed below)
  // When detected: panel default = AIKO 670W, micro qty = ceil(panels/2),
  // panel count forced even, micro warranty = 25 ปี.
  var microInverter2to1 = /atmoce\s*2\s*:\s*1/i.test(lo);
  if (microInverter2to1) brand = 'ATMOCE';

  // Panel brand + watt — dynamic, supports any brand from catalog
  var panelBrand = '', panelWatt = 0;
  var pm;
  // Match: "brand + watt" patterns (e.g. "aiko650", "trina solar 715w", "longi 650w", "ja625")
  if ((pm = lo.match(/trina\s*(?:solar\s*)?(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'Trina Solar'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  else if ((pm = lo.match(/ja\s*(?:solar\s*)?(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'JA Solar'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  else if ((pm = lo.match(/aiko\s*(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'AIKO'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  else if ((pm = lo.match(/longi\s*(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'LONGi'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  else if ((pm = lo.match(/jinko\s*(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'JINKO'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  else if ((pm = lo.match(/vols\s*(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'VOLS'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  // Fallback: "แผง [watt]w" without brand name
  else if ((pm = lo.match(/แผง\s*(\d{3,4})\s*(?:w|วัตต์)?/))) { panelWatt = parseInt(pm[1]); }
  // Only set defaults if NO panel was specified at all — let Python/catalog decide
  // Empty panel_brand + panel_watt=0 means "use default for this inverter brand"

  // Panel count — match "32แผง", "32 PV", "38pv", "32 panels"
  var panelCount = 0;
  var pcm = text.match(/(\d+)\s*(?:แผ[งง่]|pv|panels?)/i);
  if (pcm) {
    var pcVal = parseInt(pcm[1]);
    if (pcVal > 0 && pcVal < 400) panelCount = pcVal; // sanity: not a watt value
  }

  // kW detection — if user states kW explicitly, trust it; otherwise fall back
  // to panel_count × panel_watt. Snap logic in Layer B enforces model constraints
  // (e.g. Sigenergy 3P ∈ {10,20,25}).
  var kwMatch = lo.match(/([\d.]+)\s*kw(?!h)/);
  var sizeKw = kwMatch ? parseFloat(kwMatch[1]) : 5.0;
  if (panelCount > 0 && !kwMatch) {
    var pw = panelWatt || 625;
    sizeKw = Math.round(panelCount * pw / 10) / 100; // round to 2 decimals
  }

  // ATMOCE 2:1 micro: AIKO 670W default, panel qty = ceil(sizeKw*1000/670)
  // forced even (2 panels per MI-1250), so micro qty = panels/2.
  // Runs only when user did NOT supply explicit panel count or wattage.
  if (microInverter2to1 && brand === 'ATMOCE') {
    if (!panelWatt) panelWatt = 670;
    if (!panelBrand) panelBrand = 'AIKO';
    if (panelCount <= 0) {
      var _pcEst = Math.ceil(sizeKw * 1000 / panelWatt);
      if (_pcEst % 2) _pcEst += 1; // force even
      panelCount = _pcEst;
    } else if (panelCount % 2) {
      panelCount += 1; // force even when user gave odd count
    }
  }

  var phase = /3\s*(?:phase|เฟส|p\b)/.test(lo) ? '3P' : '1P';
  var hasBattery = /batt|battery|แบต|แบท/.test(lo);
  var hasBackup = /backup|สำรอง|back\s*up/.test(lo);
  if (hasBackup) hasBattery = true;

  // ATMOCE: battery default includes backup (110k/130k), not batt-only (99k)
  // User must explicitly say "no backup" or "batt only" to get batt-only
  if (brand === 'ATMOCE' && hasBattery && !hasBackup) {
    var noBackup = /ไม่.*backup|no\s*backup|batt\s*only|เฉพาะ.*แบต|เฉพาะ.*batt/i.test(lo);
    if (!noBackup) hasBackup = true;
  }

  // Battery kWh — only treat as kWh if explicitly followed by "kw"/"kwh"
  var battKwh = 0;
  var bm = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s*(\d+(?:\.\d+)?)\s*(?:kw|kwh)/);
  if (bm) battKwh = parseFloat(bm[1]);
  else { bm = lo.match(/(\d+(?:\.\d+)?)\s*(?:kw|kwh)\s*(?:batt|แบต|แบท)/); if (bm) battKwh = parseFloat(bm[1]); }

  // Battery quantity — "batt 4", "batt 7 *2", "x6ลูก", "4ลูก", "batt7kw 4ลูก"
  var battQty = 1;
  var battQtyExplicit = false;
  var bqm = text.match(/batt(?:ery)?\s*\d+\s*(?:kw|kwh)?\s*[*x×]\s*(\d+)/i)
    || text.match(/[*x×]\s*(\d+)\s*ลูก/)
    || text.match(/batt(?:ery)?\s*\d+\s*(?:kw|kwh)?\s+(\d+)\s*ลูก/i)
    || text.match(/(\d+)\s*ลูก/);
  if (bqm) { battQty = parseInt(bqm[1]); battQtyExplicit = true; }

  // "batt N" — ATMOCE: N >= 7 means kWh (up to 50), N < 7 means qty; others: N ≤ 20 = qty
  if (battQty <= 1 && !bm) {
    var bnm = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s+(\d+)(?:\s|$|\+)/);
    if (bnm) {
      var bnv = parseInt(bnm[1]);
      if (brand === 'ATMOCE' && bnv >= 7 && bnv <= 50) {
        battKwh = bnv;
      } else if (bnv >= 1 && bnv <= 20) {
        battQty = bnv;
      }
    }
  }

  if (battKwh > 0 && battQty > 1) battKwh = battKwh * battQty;

  // Customer name — highest priority: explicit bracket syntax "ชื่อลูกค้า[คุณ นก]" / "ลูกค้า[John Doe]"
  // Captures everything inside the brackets verbatim (keeps "คุณ" politeness prefix).
  // Falls back to one-shot keyword pattern, then to "คุณ[name]" tail capture.
  // `customerNameExplicit` is set true when ANY parser branch below extracts a
  // non-empty name. It is later re-exported in the spec so the AI-merge step in
  // startQuotation() refuses to overwrite an explicit user-supplied name with
  // LLM hallucinations (e.g. underscore strings that produce "-______" suffix).
  var customerName = '';
  var customerNameExplicit = false;
  var bracketMatch = text.match(/(?:ชื่อ\s*ลูกค้า|ลูกค้า)\s*[\[【]\s*([^\]】]+?)\s*[\]】]/);
  if (bracketMatch) {
    customerName = bracketMatch[1].trim().replace(/\s+/g, ' ');
    if (customerName) customerNameExplicit = true;
  }
  if (!customerName) {
    var nameMatch = text.match(/(?:คุณ|ลูกค้า|ให้|ใบเสนอ(?:ราคา)?|ทำ\s*QT)\s+([ก-๙A-Za-z][ก-๙A-Za-z\s]{1,40}?)(?=\s+(?:ATMOCE|Sigenergy|Huawei|Solis|Deye|Hoymiles|\d+\s*(?:kw|แผง|pv|1p|3p|phase|เฟส)))/i);
    if (nameMatch) {
      // Strip leading "คุณ"/"ลูกค้า" captured when prefix is "ใบเสนอ"/"ทำ QT"
      customerName = nameMatch[1].trim().replace(/^(?:คุณ|ลูกค้า)\s*/i, '').trim();
      if (customerName) customerNameExplicit = true;
    } else {
      // Fallback: original "คุณ[name]" pattern
      var cnm = text.match(/คุณ\s*([^\s,]+(?:\s+[^\s,]+)?)/);
      if (cnm) {
        customerName = cnm[1].replace(/\s*(atmoce|sigenergy|huawei|deye|solis|hoymiles|inverter|phase|kw|แผง|batt|backup|ขาย|ราคา|ส่วนลด|ฟรี|ติดตั้ง|เฟส)/gi, '').trim();
        if (customerName) customerNameExplicit = true;
      }
    }
  }

  // Always prepend "คุณ " for politeness unless already prefixed.
  // Skip when name is empty/falsy so the downstream fallback path
  // (yields "ใบเสนอราคา_Enervia") remains intact. The explicit flag is
  // preserved — we are normalizing what was found, not inventing a name.
  if (customerName && !/^(คุณ|ลูกค้า)/i.test(customerName)) {
    customerName = 'คุณ ' + customerName;
  }

  // Optimizer detection
  var hasOptimizer = /optim/i.test(lo);

  // Battery-only quotation detection — no panels, no inverter section in PDF.
  // Trigger: explicit "batt only / battery only / เฉพาะแบต / เฉพาะ batt /
  // ไม่มีแผง / no panel(s)" AND battery is present. Upstream (Python) requires
  // grand_total > 0 and accepts size_kw=0 when battery_only=true.
  var batteryOnly = false;
  if (hasBattery && /batt\s*only|battery\s*only|เฉพาะ\s*(?:แบต|แบท|batt)|ไม่มี\s*แผง|no\s*panels?/i.test(lo)) {
    batteryOnly = true;
    sizeKw = 0;
    panelCount = 0;
    panelWatt = 0;
    hasBackup = false;
  }

  // Lump sum — parse number with optional suffix (k/พัน=×1000, หมื่น=×10000, แสน=×100000)
  var lumpSumValue = 0;
  // Compound forms (รวมราคา / ราคารวม / ราคา รวม) must come BEFORE the bare
  // "รวม" alternative — otherwise the engine matches "รวม" then chokes on the
  // following "ราคา" before reaching the digits and bails out without trying
  // a longer alternative at the same position.
  var lumpMatch = text.match(/(?:รวม\s*ราคา|ราคา\s*รวม|lump\s*sum|รวม|=)\s*฿?\s*([\d,]+(?:\.\d+)?)\s*(k|พัน|หมื่น|แสน)?/i);
  if (lumpMatch) {
    var lv = parseFloat(lumpMatch[1].replace(/,/g, ''));
    var lsuffix = (lumpMatch[2] || '').toLowerCase();
    if (lsuffix === 'k') lv *= 1000;
    else if (lsuffix === 'พัน') lv *= 1000;
    else if (lsuffix === 'หมื่น') lv *= 10000;
    else if (lsuffix === 'แสน') lv *= 100000;
    lumpSumValue = lv;
  }
  // Fallback: standalone large number (≥5000) at end of message = implied lump sum
  if (!lumpSumValue) {
    var trailMatch = text.match(/\s([\d,]{5,})\s*(?:บาท)?\s*$/);
    if (trailMatch) {
      var tv = parseFloat(trailMatch[1].replace(/,/g, ''));
      if (tv >= 5000) lumpSumValue = tv;
    }
  }
  var lumpSum = lumpSumValue > 0;

  // Selling price — lump sum takes priority; fallback "ขาย [number]" / "ราคาขาย [number]"
  var grandTotal = lumpSumValue > 0 ? lumpSumValue : 0;
  if (!grandTotal) {
    var spm = text.match(/(?:ขาย(?:ราคา)?|(?<!รวม)ราคาขาย)\s*([\d,]+)/);
    if (spm) grandTotal = parseFloat(spm[1].replace(/,/g, ''));
  }

  // Discount — "ส่วนลด/ลดราคา/ลด [number]"
  var discount = 0;
  var dm = text.match(/(?:ส่วนลด|ลดราคา(?:พิเศษ)?|ลด)\s*([\d,]+)/);
  if (dm) discount = parseFloat(dm[1].replace(/,/g, ''));

  // Remarks — collect promo phrases
  var remarks = [];
  if (/ฟรี.*กันนก|ฟรี.*ตะแกรง/.test(text)) remarks.push('ฟรีติดตั้งตะแกรงกันนก');
  var monthMatch = text.match(/ติดตั้ง\s*ภายใน(?:เดือน)?\s*(\S+)/);
  if (monthMatch) remarks.push('*** ราคาติดตั้งภายในเดือน' + monthMatch[1] + ' ***');
  var touMatch = text.match(/ฟรี.*(?:ค่าธรรมเนียม|TOU).*?(\d[\d,]*)\s*บาท/);
  if (touMatch) remarks.push('ฟรี ค่าธรรมเนียมขอมิเตอร์ TOU จากการไฟฟ้า มูลค่า ' + touMatch[1] + ' บาท');
  var cleanMatch = text.match(/ล้างแผง\s*(\d+)\s*ครั้ง\s*(\d+)\s*ปี/);
  if (cleanMatch) remarks.push('ล้างแผงฟรี ' + cleanMatch[1] + ' ครั้ง ภายในระยะเวลา ' + cleanMatch[2] + ' ปี');
  // Free-form remark: "เพิ่มหมายเหตุ [text]" or "หมายเหตุ [text]" / "หมายเหตุ: [text]"
  // Tail after the keyword is split on natural remark starters so that a single
  // "หมายเหตุ ฟรีX ฟรีY รวมประกัน Z" produces 3 separate lines instead of one blob.
  var freeRemarkParts = text.split(/(?:เพิ่ม\s*หมายเหตุ|หมายเหตุ)\s*[:：]?\s+/);
  for (var _ri = 1; _ri < freeRemarkParts.length; _ri++) {
    var _rt = freeRemarkParts[_ri].trim();
    if (!_rt) continue;
    var _subs = _rt.split(/\s+(?=ฟรี|รวม\s*ประกัน|\*\*\*)/);
    for (var _sj = 0; _sj < _subs.length; _sj++) {
      var _s = _subs[_sj].trim();
      if (!_s) continue;
      // Dedup: if this sub-remark matches an already-pushed auto-detected one
      // (ตะแกรงกันนก, TOU, ล้างแผง), skip it.
      var dup = false;
      for (var _di = 0; _di < remarks.length; _di++) {
        var r = remarks[_di];
        if ((/ตะแกรง|กันนก/.test(_s) && /ตะแกรง|กันนก/.test(r)) ||
            (/TOU|ค่าธรรมเนียม/i.test(_s) && /TOU|ค่าธรรมเนียม/i.test(r)) ||
            (/ล้างแผง/.test(_s) && /ล้างแผง/.test(r))) {
          dup = true; break;
        }
      }
      if (!dup) remarks.push('- ' + _s);
    }
  }
  // Check for "จากราคาเต็ม [amount]"
  var fullPriceMatch = text.match(/จากราคาเต็ม\s*([\d,]+)/);

  // Payment rounds — default 2 (60/40), override to 3 (30/30/40) when user says
  // "แบ่ง 3 รอบ" / "3 รอบ" / "3 งวด" / "3 installments".
  var paymentRounds = 2;
  if (/แบ่ง\s*3\s*(?:รอบ|งวด)|3\s*(?:รอบ|งวด)|3\s*installments?/i.test(lo)) {
    paymentRounds = 3;
  }

  return {
    brand: brand,
    size_kw: sizeKw,
    phase: phase,
    has_battery: hasBattery,
    has_backup: hasBackup,
    customer_name: customerName,
    customer_name_explicit: customerNameExplicit,
    grand_total: grandTotal,
    discount: discount,
    panel_brand: panelBrand,
    panel_watt: panelWatt,
    panel_count: panelCount,
    battery_kwh: battKwh,
    remarks: remarks.join('|'),
    full_price: fullPriceMatch ? parseFloat(fullPriceMatch[1].replace(/,/g, '')) : 0,
    lump_sum: lumpSum,
    has_optimizer: hasOptimizer,
    battery_only: batteryOnly,
    micro_2to1: microInverter2to1,
    payment_rounds: paymentRounds,
    battery_qty: battQty > 1 ? battQty : 0,
    battery_qty_explicit: battQtyExplicit,
    user_explicit_kw: !!kwMatch,
  };
  console.log('[parseQuotationSpec] panel_brand=' + panelBrand + ' panel_watt=' + panelWatt + ' size_kw=' + sizeKw + ' panelCount=' + panelCount + ' battery_only=' + batteryOnly);
}

// `generateQuotationPdf` is now provided by lib/python-bridge.js
// (imported near the top of this file alongside generateBomPdf).

// ─── Quotation PDF sender (shared by startQuotation + confirm handler) ──
async function doGenerateAndSendQuotation(ev, specStr, spec, rt) {
  var k = sKey(ev.source);
  var callerUid = ev.source.userId || '';
  var to2 = ev.source.type === 'group' ? ev.source.groupId : ev.source.userId;

  // sobek K3: PDPA consent gate — must consent before first PDF with customer name
  if (spec.customer_name && callerUid && !_persistence.hasConsented(callerUid, 'quotation_pdf')) {
    quotationPreviewPending.set(k, { spec: spec, specStr: specStr, ts: Date.now(), awaitingConsent: true });
    try {
      await lReply(rt, [{ type: 'text', text: '\u{1F4CB} \u0e41\u0e08\u0e49\u0e19\u0e42\u0e22\u0e1a\u0e32\u0e22\u0e04\u0e27\u0e32\u0e21\u0e40\u0e1b\u0e47\u0e19\u0e2a\u0e48\u0e27\u0e19\u0e15\u0e31\u0e27 (PDPA)\n\n\u0e23\u0e30\u0e1a\u0e1a\u0e08\u0e30\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e0a\u0e37\u0e48\u0e2d\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32 "' + spec.customer_name + '" \u0e25\u0e07\u0e43\u0e19\u0e10\u0e32\u0e19\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e43\u0e1a\u0e40\u0e2a\u0e19\u0e2d\u0e23\u0e32\u0e04\u0e32\n\n\u0e1e\u0e34\u0e21\u0e1e\u0e4c "\u0e22\u0e34\u0e19\u0e22\u0e2d\u0e21" \u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23\u0e15\u0e48\u0e2d\n\u0e1e\u0e34\u0e21\u0e1e\u0e4c "\u0e44\u0e21\u0e48\u0e22\u0e34\u0e19\u0e22\u0e2d\u0e21" \u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e43\u0e1a\u0e42\u0e14\u0e22\u0e44\u0e21\u0e48\u0e23\u0e30\u0e1a\u0e38\u0e0a\u0e37\u0e48\u0e2d\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32' }]);
    } catch (e) { /* reply token expired */ }
    return;
  }
  if (spec.customer_name && callerUid) {
    _persistence.logConsent(callerUid, 'quotation_pdf', true); // K3: log consent granted
  }

  var customerLabel = spec.customer_name ? ' (' + spec.customer_name + ')' : '';
  var priceLabel = spec.grand_total ? '\nราคา: ' + spec.grand_total.toLocaleString() + ' บาท' : '';
  if (spec.lump_sum) priceLabel += ' (lump sum)';
  if (spec.discount) priceLabel += ' (ลด ' + spec.discount.toLocaleString() + ')';
  var statusMsg = '\u{1F4C4} กำลังสร้างใบเสนอราคา...' + customerLabel + '\n' +
    spec.brand + ' ' + spec.size_kw + 'kW ' + spec.phase +
    (spec.panel_brand ? ' แผง ' + spec.panel_brand + (spec.panel_watt ? ' ' + spec.panel_watt + 'W' : '') : '') +
    (spec.has_battery ? ' + Battery' + (spec.battery_kwh ? ' ' + spec.battery_kwh + 'kWh' : '') : '') +
    (spec.has_backup ? ' + Backup' : '') +
    priceLabel;

  // ── ส่ง ACK ทันทีก่อน เพื่อป้องกัน reply token expire (LINE = 30s) ──
  await rText(rt, statusMsg);
  var to = ev.source.type === 'group' ? ev.source.groupId : ev.source.userId;

  // Generate PDF แล้ว push result (ไม่ใช้ reply token อีกแล้ว)
  // LN-LOCALE: detect user locale and attach to spec for PDF template selection
  if (!spec.locale) {
    try {
      spec.locale = await _localeDetect.getLocaleFromEvent(ev.source, LINE_TOKEN);
    } catch(e) { spec.locale = 'th'; }
  }
  // Ensure panel_count is explicit so Python PDF matches the Flex preview.
  // Flex uses: spec.panel_watt || 670, Math.ceil(size_kw*1000/watt).
  // If app.js doesn't pass panel_count, Python falls back to its own default
  // (round() against DEFAULT_PANEL watt) which drifts by 1 in edge cases.
  if (!spec.panel_count || spec.panel_count <= 0) {
    var _pw = spec.panel_watt || 670;
    if (spec.size_kw > 0) spec.panel_count = Math.ceil(spec.size_kw * 1000 / _pw);
  }
  try {
    var result = await generateQuotationPdf(spec, spec.customer_name || 'ลูกค้า', '');
    var _pdfPath = typeof result.path === 'string' ? result.path : (result.path && result.path.pdf_path) || '';
    var pdfFile = path.basename(_pdfPath);
    var pdfUrl = signPdfUrl(pdfFile); // sobek K1: signed 24h URL

    // Remember this quotation for future update detection
    lastQuotation.set(k, { brand: spec.brand, size_kw: spec.size_kw, phase: spec.phase, has_battery: spec.has_battery, has_backup: spec.has_backup, specStr: specStr, ts: Date.now() });

    // ── v2.0: Audit + History + Admin Notify ──
    var userId = ev.source.userId || ev.source.groupId || '';
    auditLog('quotation_generated', userId, result.quote_number + ' ' + result.brand + ' ' + result.size_kw + 'kW ฿' + result.grand_total);
    saveQtHistory(userId, result, spec, pdfUrl);

    // ── Async fire-and-forget Google Sheet sync (Apps Script Web App) ──
    // Failures never block LINE flow — sheet-sync logs errors & always resolves.
    try {
      var _sheetSync = require('./lib/sheet-sync');
      var _displayName = ''; // LINE display name not fetched in this flow (avoid extra API call)
      _sheetSync.syncQuotationToSheet(spec, result.quote_number, pdfUrl, _displayName).catch(function(){});
    } catch (e) { console.error('[sheet-sync] hook error:', e.message); }

    // ── INT2: Persist to nasri.sqlite v2 schema via quotation-bridge ─────────
    // await + verify row exists. On failure: log + notifyAdmin.
    // saveQtHistory (JSON, above) remains the safety net so LINE response is
    // never blocked on DB status.
    try {
      var _qtDbResult = await qtCrud.createQuotation({
        id:               result.quote_number,
        customer_name:    spec.customer_name || 'ลูกค้า',
        customer_phone:   spec.customer_phone || null,
        customer_address: spec.customer_address || null,
        seller_name:      spec.seller_name || null,
        system_size_kw:   result.size_kw || spec.size_kw || null,
        phase:            (spec.phase === '3phase' || spec.phase === '3' || spec.phase === 3) ? 3 : 1,
        brand:            result.brand || spec.brand || null,
        total:            result.grand_total || null,
        discount:         spec.discount || 0,
        status:           'draft',
        created_by:       userId || null,
      });
      if (!_qtDbResult || !_qtDbResult.ok) {
        var _dbErr = (_qtDbResult && _qtDbResult.error) || 'unknown error';
        if (_dbErr.indexOf('already exists') === -1) {
          console.error('[quotation-bridge] createQuotation not ok for', result.quote_number, ':', _dbErr);
          notifyAdmin('⚠️ DB write failed\nQT: ' + result.quote_number + '\n' + _dbErr.slice(0, 120))
            .catch(function(e) { console.error('[admin-notify] db-fail notify:', e.message); });
        }
      } else {
        var _qtVerify = await qtCrud.getQuotationDetail(result.quote_number);
        if (!_qtVerify) {
          console.error('[quotation-bridge] verify failed — row missing after insert for', result.quote_number);
          notifyAdmin('⚠️ DB verify failed\nQT: ' + result.quote_number + '\nRow not found after insert')
            .catch(function(e) { console.error('[admin-notify] db-verify notify:', e.message); });
        }
      }
    } catch (err) {
      console.error('[quotation-bridge] createQuotation exception for', result.quote_number, ':', err.message);
      notifyAdmin('🚨 DB exception\nQT: ' + result.quote_number + '\n' + (err.message || '').slice(0, 120))
        .catch(function(e) { console.error('[admin-notify] db-exc notify:', e.message); });
    }
    // ─────────────────────────────────────────────────────────────────────────

    notifyAdmin(
      '📄 ใบเสนอราคาใหม่\n' +
      'เลขที่: ' + result.quote_number + '\n' +
      'ลูกค้า: ' + (spec.customer_name || '(ไม่ระบุ)') + '\n' +
      result.brand + ' ' + result.size_kw + 'kW ' + result.phase +
      (spec.has_battery ? ' + Batt' : '') + '\n' +
      'ราคา: ฿' + result.grand_total.toLocaleString() + '\n' +
      pdfUrl
    ).catch(function(e) { console.error('[admin-notify]', e.message); });

    var priceText = '\u0e3f' + result.grand_total.toLocaleString();
    // Push PDF result (reply token ใช้ไปแล้วกับ ACK ข้างบน)
    await lPush(to, [{
      type: 'flex',
      altText: 'ใบเสนอราคา ' + result.brand + ' ' + result.size_kw + 'kW',
      contents: {
        type: 'bubble', size: 'kilo',
        header: {
          type: 'box', layout: 'vertical',
          contents: [{ type: 'text', text: '\u{1F4C4} ใบเสนอราคา Solar', weight: 'bold', size: 'lg', color: '#ffffff' }],
          backgroundColor: '#E8941A', paddingAll: '12px',
        },
        body: {
          type: 'box', layout: 'vertical',
          contents: [
            { type: 'text', text: result.brand + ' ' + result.size_kw + 'kW ' + result.phase, weight: 'bold', size: 'md', wrap: true },
            { type: 'text', text: (result.has_battery ? '+ Battery' : 'On-Grid') + (result.has_backup ? ' + Backup' : ''), size: 'sm', color: '#666666', margin: 'sm' },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: 'ราคารวม: ' + priceText, size: 'md', weight: 'bold', color: '#E8941A', margin: 'md' },
            { type: 'text', text: 'เลขที่: ' + result.quote_number, size: 'xs', color: '#888888', margin: 'sm' },
          ],
          paddingAll: '12px',
        },
        footer: {
          type: 'box', layout: 'vertical',
          contents: [
            { type: 'button', action: { type: 'uri', label: '\u{1F4E5} ดาวน์โหลด PDF', uri: pdfUrl }, style: 'primary', color: '#E8941A' },
          ],
          paddingAll: '12px',
        },
      },
    }]);
  } catch (e) {
    console.error('[quotation]', e.message);
    // Push error (reply token ใช้ไปแล้ว)
    await lPush(to, [{ type: 'text', text: 'ขออภัยครับ สร้าง PDF ไม่ได้ 😅\n(' + e.message.slice(0, 80) + ')\nลองใหม่อีกครั้งครับ' }]);
  }
}

async function startQuotation(ev, text, rt) {
  text = normalizeThaiInput(text);
  var k = sKey(ev.source);
  var userId = ev.source.userId || ev.source.groupId || '';

  // ── v2.0: Rate limit check ──
  if (!checkRate(userId, 'qt', RATE_LIMIT_MAX_QT)) {
    var used = getRateCount(userId, 'qt');
    auditLog('rate_limited_qt', userId, 'count=' + used);
    await rText(rt, '⚠️ เกินลิมิต ' + RATE_LIMIT_MAX_QT + ' ใบเสนอราคา/วัน ครับพี่\nใช้ไปแล้ว ' + used + ' ใบวันนี้\nลองใหม่พรุ่งนี้ครับ 🙏');
    return;
  }

  // Strip trigger words + quotation keywords to see if there's a real spec
  var specStr = text.replace(/ใบเสนอราคา|quotation|เสนอราคา|ขอใบเสนอ|ทำใบเสนอราคา|นัด|nasri|ไอ่นัด|เสนอ|ทำ|ขอ|รวมราคา(?:ขาย)?/gi, '').trim();

  // ── No spec or incomplete spec → ask for details first ──
  // Require BOTH brand AND kW to auto-generate; brand alone is not enough
  var slo = specStr.toLowerCase();
  var hasBrand = /atmoce|huawei|sol[io]s|deye|sig(?:energy)?|hoymiles|enphase/i.test(slo);
  var hasKw = /\d+\s*kw/i.test(slo) || /\d+\s*(?:แผ[งง่]|pv|panels?)/i.test(slo);
  if (!specStr || !hasBrand || !hasKw) {
    // Build a smart prompt — acknowledge what they gave, ask for the rest
    var askParts = [];
    if (!hasBrand) askParts.push('1. ยี่ห้อ? (ATMOCE / Sigenergy / Huawei / Deye / Solis / Hoymiles)');
    if (!hasKw) askParts.push('2. ขนาดกี่ kW? (เช่น 5kw, 10kw, 42kw) หรือกี่แผง?');
    askParts.push('3. กี่เฟส? (1 เฟส / 3 เฟส)');
    askParts.push('4. ใส่แบตด้วยมั้ย? (ถ้าใส่ บอกขนาดด้วยนะ เช่น แบท 14kw)');
    askParts.push('5. ราคาขายเท่าไหร่? (หรือให้คำนวณให้)');

    await rText(rt, 'ได้เลยครับพี่ 📋 ช่วยบอกรายละเอียดหน่อยนะ:\n\n' +
      askParts.join('\n') +
      '\n\nตัวอย่าง: "นัด ทำใบเสนอราคา deye 42kw 3phase แบท 14kw ขาย 350000"\nพิมพ์ทีเดียวเลยก็ได้ครับ 😎');
    return;
  }

  // ── Parse spec with regex first ──
  var spec = parseQuotationSpec(text);
  if (!specStr) specStr = spec.brand + ' ' + spec.size_kw + 'kw ' + spec.phase;

  var to2 = ev.source.type === 'group' ? ev.source.groupId : ev.source.userId;
  // Don't waste replyToken on status — save it for the PDF result

  // Use Claude AI to improve the spec (validated against hallucinations)
  try {
    var catalogCtx = await getSolarCatalogContext();
    var aiRaw = await askClaudeForSolar(text, catalogCtx, 'quotation');
    var aiResult = validateSolarSpec(aiRaw);
    if (aiRaw && !aiResult) {
      var _qt = ev._trace || (ev._trace = { path: [] });
      _qt.path.push('ai-rejected');
    }
    if (aiResult && aiResult.brand && aiResult.size_kw) {
      console.log('[quotation] Claude AI parsed spec:', JSON.stringify(aiResult));
      var aiSizeKw = aiResult.size_kw;
      // Layer A guard: if user explicitly stated kW (either in regex pass or in AI result),
      // do NOT overwrite with panel_count × panel_watt. Snap logic in Layer B will adapt
      // the kW to any inverter-model constraints (e.g. Sigenergy 3P ∈ {10,20,25}).
      var userExplicitKw = spec.user_explicit_kw === true;
      if (!userExplicitKw && aiResult.panel_count > 0 && aiResult.panel_watt > 0) {
        aiSizeKw = Math.round(aiResult.panel_count * aiResult.panel_watt / 10) / 100;
      }
      var aiBattKwh = aiResult.battery_kwh || 0;
      if (aiResult.brand === 'ATMOCE' && aiBattKwh <= 0 && aiResult.battery_qty > 0) {
        // ATMOCE MS-7K = 7kWh each: qty >= 7 means kWh, qty < 7 means units
        if (aiResult.battery_qty >= 7) {
          aiBattKwh = aiResult.battery_qty; // treat as kWh directly
        } else {
          aiBattKwh = aiResult.battery_qty * 7;
        }
      }
      spec.brand = aiResult.brand;
      // Layer A guard: if user explicitly stated kW, keep regex-parsed value
      // regardless of what AI returned (AI system prompt may still instruct
      // "calculate from panel × watt" and override user intent).
      if (!userExplicitKw) {
        spec.size_kw = aiSizeKw;
      }
      spec.phase = aiResult.phase || spec.phase;
      if (aiResult.panel_brand) spec.panel_brand = aiResult.panel_brand;
      if (aiResult.panel_watt) spec.panel_watt = aiResult.panel_watt;
      if (aiResult.panel_count) spec.panel_count = aiResult.panel_count;
      // Guard against LLM hallucinating battery/backup when user did not mention it.
      // Only promote to true if the raw text contains a matching keyword.
      if (aiResult.has_battery && /batt|battery|แบต|แบท/i.test(lo)) spec.has_battery = true;
      if (aiResult.has_backup && /backup|สำรอง|back\s*up/i.test(lo)) spec.has_backup = true;
      // Trust regex-calculated battery_kwh when user explicitly typed qty
      // (e.g. "batt7kw 4ลูก" → 28 kWh). LLM may return a stale guess from
      // inferred qty which conflicts with the explicit count.
      if (aiBattKwh > 0 && !spec.battery_qty_explicit) spec.battery_kwh = aiBattKwh;
      // Guard: if regex/bracket parser already extracted an explicit customer
      // name, refuse AI override. AI sometimes returns garbage strings (literal
      // underscores, dots, zero-width chars) when it sees bracket syntax it
      // can't parse, which then leak into the PDF filename as "-______".
      if (aiResult.customer_name && !spec.customer_name_explicit) spec.customer_name = aiResult.customer_name;
      if (aiResult.grand_total) spec.grand_total = aiResult.grand_total;
      if (aiResult.discount) spec.discount = aiResult.discount;
      if (aiResult.remarks) spec.remarks = aiResult.remarks;
      if (aiResult.lump_sum) spec.lump_sum = aiResult.lump_sum;
      if (aiResult.has_optimizer) spec.has_optimizer = aiResult.has_optimizer;
      if (aiResult.full_price) spec.full_price = aiResult.full_price;
      // Regex wins if user explicitly typed qty ("4ลูก", "batt7kw*4", etc.);
      // LLM only fills in when regex didn't see an explicit count.
      if (aiResult.battery_qty && !spec.battery_qty_explicit) spec.battery_qty = aiResult.battery_qty;
      specStr = spec.brand + ' ' + spec.size_kw + 'kw ' + spec.phase;
    }
  } catch (e) {
    console.error('[quotation] Claude AI error (using regex):', e.message);
  }

  // ── Update detection: same brand+kW but with new additions ──
  var prev = lastQuotation.get(k);
  if (prev && (Date.now() - prev.ts) < QUOTATION_TTL) {
    var sameBrand = prev.brand === spec.brand;
    var sameKw = prev.size_kw === spec.size_kw;
    var newBattery = spec.has_battery && !prev.has_battery;
    var newBackup = spec.has_backup && !prev.has_backup;
    var hasAdditions = newBattery || newBackup;

    if (sameBrand && sameKw && hasAdditions) {
      var addList = [];
      if (newBattery) addList.push('Battery');
      if (newBackup) addList.push('Backup');
      var addStr = addList.join(' + ');
      quotationConfirmPending.set(k, { spec: spec, specStr: specStr, ts: Date.now() });
      // Reply with confirmation (replyToken still available)
      await rText(rt, 'ต้องการ update ใบเสนอราคาที่ส่งไปก่อนหน้าใช่มั้ยครับพี่? จะเพิ่ม ' + addStr + ' เข้าไปในระบบ ' + spec.brand + ' ' + spec.size_kw + 'kW');
      return;
    }
  }

  // No previous quotation or different spec — show preview first, wait for confirm
  quotationPreviewPending.set(k, { spec: spec, specStr: specStr, ts: Date.now() });
  await lReply(rt, [buildPreviewFlex(spec)]);
}

// ─── Trigger & Intent Detection ──────────────────────────────
function isNasriTrigger(lo) {
  return lo.indexOf('นัด') >= 0 || lo.indexOf('nasri') >= 0 || lo.indexOf('ไอ่นัด') >= 0;
}

function isBomRequest(lo) {
  return /\bbom\b/i.test(lo) || lo.indexOf('ขอbom') >= 0 || lo.indexOf('ขอ bom') >= 0 || lo.indexOf('solar') >= 0;
}

function isPdfRequest(lo) {
  return lo.indexOf('pdf') >= 0 || lo.indexOf('ขอpdf') >= 0 || lo.indexOf('ขอ pdf') >= 0
    || lo.indexOf('สร้าง pdf') >= 0 || lo.indexOf('สร้างpdf') >= 0
    || lo.indexOf('create pdf') >= 0 || lo.indexOf('file pdf') >= 0;
}

function hasSystemSpec(lo) {
  // Check if text contains solar system spec keywords
  return /atmoce|huawei|sol[io]s|deye|sig(?:energy)?|hoymiles|enphase/i.test(lo)
    || (/\d+\s*kw/i.test(lo) && /phase|เฟส|1p|3p|แผง|panel/i.test(lo));
}

// ─── BOM Flow ─────────────────────────────────────────────────
async function startBom(ev, specText) {
  if (specText) specText = normalizeThaiInput(specText);
  const k = sKey(ev.source);
  var _trace = ev._trace || { path: [] };
  const ex = getSess(k);
  if (ex && ex.step !== 'done') {
    _trace.path.push('bom-stale:' + ex.step);
    await rText(ev.replyToken, 'มี BOM ค้างอยู่ครับ (' + (ex.data.project_name || 'ยังไม่ตั้งชื่อ') + ')\nพิมพ์ "ยกเลิก" เพื่อเริ่มใหม่ หรือส่งข้อมูลต่อได้เลยครับ');
    return;
  }
  // Pre-load catalog
  getCatalog().catch(function(e) { console.error('[catalog]', e.message); });

  // If user included a system spec in the same message, auto-build
  if (specText && hasSystemSpec(specText)) {
    _trace.path.push('bom-auto');
    var sess = newSess(k);
    sess.step = 'items';
    sess.data.project_name = '(auto)';
    // Don't waste replyToken on status — save it for the actual result

    // Use Claude AI to parse the spec first (validated against hallucinations)
    try {
      var catalogCtx = await getSolarCatalogContext();
      var aiRawBom = await askClaudeForSolar(specText, catalogCtx, 'BOM');
      var aiSpec = validateSolarSpec(aiRawBom);
      if (aiRawBom && !aiSpec) {
        _trace.path.push('ai-rejected');
      }
      if (aiSpec && aiSpec.brand) {
        _trace.path.push('ai-ok:' + aiSpec.brand);
        console.log('[bom] Claude AI parsed spec:', JSON.stringify(aiSpec));
        if (aiSpec.panel_brand && !new RegExp(aiSpec.panel_brand, 'i').test(specText)) {
          specText += ' ' + aiSpec.panel_brand;
        }
      } else {
        _trace.path.push('ai-null');
      }
    } catch (e) { _trace.path.push('ai-err:' + e.message.slice(0, 50)); console.error('[bom-ai]', e.message); }

    try {
      var autoItems = await parseSystemSpec(specText);
      if (autoItems && (autoItems.isAtmoceQuickReply || autoItems.isSigenergyQuickReply)) {
        await lReply(ev.replyToken, [autoItems.quickReplyMsg]);
        return;
      }
      if (autoItems && autoItems.isSigenergyCiPrompt) {
        await lReply(ev.replyToken, [autoItems.promptMsg]);
        return;
      }
      if (autoItems && autoItems.isSurveyError) {
        await rText(ev.replyToken, '❌ ' + autoItems.errorMsg);
        return;
      }
      _trace.path.push('spec-items:' + (autoItems ? autoItems.length : 0));
      if (Array.isArray(autoItems) && autoItems.length > 0) {
        sess.data.items = autoItems;
        sess.step = 'done';
        saveBom(k, sess.data, ev.source).catch(function(e) { console.error('[bom]', e); });
        // Register as lastBom so "ขอ pdf" button works immediately
        lastBom.set(k, { filename: null, data: sess.data });
        // Reply with BOM flex card (includes PDF button)
        await lReply(ev.replyToken, [buildBomResultFlex(sess.data)]);
        return;
      }
    } catch (e) { _trace.path.push('spec-err:' + e.message.slice(0, 80)); console.error('[spec]', e); }
    // Fallback if spec parsing failed — reply with error
    _trace.path.push('fallback');
    sess.step = 'name';
    await rText(ev.replyToken, 'ไม่พบข้อมูลอุปกรณ์จาก catalog ครับ\nลองพิมพ์ชื่อโปรเจกต์เพื่อสร้าง BOM แบบแมนวลครับ');
    return;
  }

  newSess(k);
  await rText(ev.replyToken, 'โอเค จัดให้เลย 📋\n\nชื่อโปรเจกต์อะไรครับพี่?');
}

async function bomMsg(ev) {
  const k = sKey(ev.source), s = getSess(k);
  if (!s) return false;
  const text = (ev.message && ev.message.text) ? ev.message.text.trim() : '';
  const lo = text.toLowerCase(), rt = ev.replyToken;
  if (!rt) return false;
  if (lo === 'ยกเลิก' || lo === 'cancel') { sessions.delete(k); await rText(rt, 'ยกเลิกเรียบร้อย 🙏'); return true; }
  s.up = Date.now();

  if (s.step === 'name') { s.data.project_name = text; s.step = 'addr'; await rText(rt, 'โปรเจกต์: ' + text + ' ✓\n\nที่อยู่โปรเจกต์ครับ?'); return true; }
  if (s.step === 'addr') { s.data.project_address = text; s.step = 'items'; await lReply(rt, [addItemFlex()]); return true; }
  if (s.step === 'items') {
    if (lo === 'เสร็จ' || lo === 'done' || lo === 'จบ') {
      if (!s.data.items.length) { await rText(rt, 'เพิ่มอย่างน้อย 1 รายการครับ'); return true; }
      s.step = 'done';
      saveBom(k, s.data, ev.source).catch(function(e) { console.error('[bom]', e); });
      lastBom.set(k, { filename: null, data: s.data });
      await lReply(rt, [buildBomResultFlex(s.data)]);
      return true;
    }
    if (lo === 'ลบ' || lo === 'undo') { var rm = s.data.items.pop(); await rText(rt, rm ? 'ลบ "' + rm.part_name + '" (เหลือ ' + s.data.items.length + ')' : 'ไม่มีรายการให้ลบ'); return true; }

    // Try smart system spec first
    if (hasSystemSpec(lo)) {
      try {
        var specItems = await parseSystemSpec(text);
        if (specItems && (specItems.isAtmoceQuickReply || specItems.isSigenergyQuickReply)) {
          await lReply(rt, [specItems.quickReplyMsg]);
          return true;
        }
        if (specItems && specItems.isSigenergyCiPrompt) {
          await lReply(rt, [specItems.promptMsg]);
          return true;
        }
        if (specItems && specItems.isSurveyError) {
          await rText(rt, '❌ ' + specItems.errorMsg);
          return true;
        }
        if (Array.isArray(specItems) && specItems.length > 0) {
          specItems.forEach(function(it) { s.data.items.push(it); });
          await rText(rt, '📊 เพิ่ม ' + specItems.length + ' รายการจาก catalog\n\n' + specItems.map(function(it, i) { return '  ' + (i+1) + '. ' + it.part_name + ' x' + it.quantity + ' ฿' + it.total_cost.toLocaleString(); }).join('\n') + '\n\nรวม ' + s.data.items.length + ' รายการ | เพิ่มอีก หรือ "เสร็จ"');
          return true;
        }
      } catch (e) { console.error('[spec]', e); }
    }


    // Manual item parse
    var catalog = catalogCache.data;
    var it = parseItem(text, catalog);
    if (it) {
      s.data.items.push(it);
      var note = it._from === 'catalog' ? ' 📊' : '';
      await rText(rt, '✓ ' + it.part_name + ' x' + it.quantity + ' = ฿' + it.total_cost.toLocaleString() + note + ' (รวม ' + s.data.items.length + ')\n\nเพิ่มอีก หรือ "เสร็จ"');
      return true;
    }
    await rText(rt, 'ไม่เข้าใจครับ 🙏\nลอง:\n• atmoce 5kw 1phase แผง JA625 + batt\n• Solar Panel, Trina, 220, 2423\n• Trina 625, 220 (ดึงราคาจาก catalog)');
    return true;
  }
  if (s.step === 'done') {
    // Set project name
    if (lo.indexOf('ชื่อ') >= 0 || lo.indexOf('name') >= 0) {
      var newName = text.replace(/ชื่อ|name/gi, '').trim();
      if (newName) {
        s.data.project_name = newName;
        // Re-save
        saveBom(k, s.data, ev.source).catch(function(e) { console.error('[bom]', e); });
        await rText(rt, 'ตั้งชื่อโปรเจกต์: ' + newName + ' ✓');
        return true;
      }
    }
    if (lo === 'แก้ไข' || lo === 'edit') { s.step = 'items'; await rText(rt, 'แก้ไขได้เลยครับ (' + s.data.items.length + ' รายการ)\n\nเพิ่มรายการ หรือ "ลบ" / "เสร็จ"'); return true; }
    return false;
  }
  return false;
}

// `saveBom` is provided by lib/persistence.js. It was instantiated at the
// top of this file with closures over `generateBomHtml`, `auditLog`, and
// the `lastBom` map so it preserves the original side effects.
var saveBom = _persistence.saveBom;

// ─── Signature ────────────────────────────────────────────────
function verifySig(body, sig) {
  // SECURITY: if LINE_SECRET is not configured, reject all webhook requests.
  // Accepting without verification would allow anyone to forge webhook events.
  if (!LINE_SECRET) {
    console.error('[security] LINE_CHANNEL_SECRET not set — rejecting webhook request');
    return false;
  }
  if (!sig) return false;
  var expected = crypto.createHmac('SHA256', LINE_SECRET).update(body).digest('base64');
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

// ─── Message handler ──────────────────────────────────────────
async function handleText(ev) {
  var text = (ev.message && ev.message.text) ? ev.message.text.trim() : '';
  var lo = text.toLowerCase(), rt = ev.replyToken;
  if (!rt) return;

  var k = sKey(ev.source);
  // Trace: record handler path for diagnostics
  var _trace = { k: k, text: text.slice(0, 80), path: [] };
  ev._trace = _trace;

  // ── PDF request (works anytime, no trigger needed) ──
  if (isPdfRequest(lo)) { _trace.path.push('pdf');
    // If there's a saved BOM, generate real PDF via mcp-bomsolar
    var saved = lastBom.get(k);
    // Lazy-load data from file if not in memory
    if (saved && !saved.data) {
      saved.data = loadBomData(saved.filename);
      if (!saved.data) { lastBom.delete(k); saved = null; }
    }
    if (saved) {
      var to = ev.source.type === 'group' ? ev.source.groupId : ev.source.userId;
      // Don't waste replyToken on status — generate PDF first, then reply with result
      try {
        var pdfResult = await generateBomPdf(saved.data);
        var pdfUrl = signPdfUrl(pdfResult.filename); // sobek K1: signed 24h URL
        var tc = 0; saved.data.items.forEach(function(i) { tc += i.total_cost; });
        await lReply(rt, [{
          type: 'flex', altText: 'BOM PDF: ' + (saved.data.project_name || 'BOM'),
          contents: {
            type: 'bubble', size: 'kilo',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '\ud83d\udcc4 BOM Document', weight: 'bold', size: 'lg', color: '#1a1a2e' }], backgroundColor: '#f0e68c', paddingAll: '12px' },
            body: { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: saved.data.project_name || 'BOM', weight: 'bold', size: 'md', wrap: true },
              { type: 'text', text: saved.data.items.length + ' \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23 \u2022 \u0e3f' + tc.toLocaleString(), size: 'sm', color: '#666666', margin: 'sm' },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: '\u0e01\u0e14\u0e1b\u0e38\u0e48\u0e21\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e40\u0e1b\u0e34\u0e14 BOM \u0e41\u0e25\u0e49\u0e27\u0e01\u0e14 Save as PDF', size: 'xs', color: '#888888', margin: 'md', wrap: true },
            ], paddingAll: '12px' },
            footer: { type: 'box', layout: 'vertical', contents: [
              { type: 'button', action: { type: 'uri', label: '\ud83d\udcc4 \u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14 PDF', uri: pdfUrl }, style: 'primary', color: '#1a237e' },
            ], paddingAll: '12px' },
          },
        }]);
      } catch (e) {
        console.error('[bom-pdf]', e.message);
        await rText(rt, 'ขออภัยครับ สร้าง PDF ไม่ได้ ลองใหม่อีกครั้งครับ');
      }
      return;
    }
    // No saved BOM + "bom" in request → start new BOM
    if (isBomRequest(lo) && isNasriTrigger(lo)) {
      await startBom(ev, text);
      return;
    }
    if (!saved) {
      await rText(rt, 'ยังไม่มี BOM ครับ พิมพ์ "นัด ขอ bom" เพื่อสร้างก่อนครับ');
      return;
    }
  }

  // sobek K3: PDPA consent response handler
  if (lo === 'ยินยอม' || lo === 'ไม่ยินยอม') {
    var consentPending = quotationPreviewPending.get(k);
    if (consentPending && consentPending.awaitingConsent) {
      _trace.path.push('pdpa_consent');
      var consentUid = ev.source.userId || '';
      var consented = lo === 'ยินยอม';
      _persistence.logConsent(consentUid, 'quotation_pdf', consented);
      quotationPreviewPending.delete(k);
      if (consented) {
        // Re-trigger PDF generation with consent stored
        await doGenerateAndSendQuotation(ev, consentPending.specStr, consentPending.spec, rt);
      } else {
        // Generate without customer name
        var anonSpec = Object.assign({}, consentPending.spec, { customer_name: '' });
        await doGenerateAndSendQuotation(ev, consentPending.specStr, anonSpec, rt);
      }
      return;
    }
  }

  // ── Active BOM session ──
  var handled = await bomMsg(ev);
  if (handled) { _trace.path.push('bomMsg'); return; }

  // ── v2.0: ขอรายการ BOM (from preview card — flex + PDF button) ──
  if (lo === 'ขอรายการ bom' || lo === 'ขอรายการbom') {
    var previewForBom = quotationPreviewPending.get(k);
    if (previewForBom) {
      var to3 = ev.source.type === 'group' ? ev.source.groupId : ev.source.userId;
      await rText(rt, 'กำลังดึงรายการ BOM จาก catalog...');
      try {
        var bomItems = await parseSystemSpec(previewForBom.specStr);
        if (bomItems && bomItems.length > 0) {
          // Register as lastBom so "สร้าง PDF" button works immediately
          var bomData = {
            project_name: (previewForBom.spec.customer_name ? previewForBom.spec.customer_name + ' — ' : '') + previewForBom.spec.brand + ' ' + previewForBom.spec.size_kw + 'kW ' + previewForBom.spec.phase,
            project_address: '',
            order_date: new Date().getDate() + '/' + (new Date().getMonth() + 1) + '/' + (new Date().getFullYear() % 100),
            items: bomItems,
            notes: '',
          };
          // ATMOCE SRP: attach cost_summary so generateBomPdf uses generate_srp_pdf
          if (bomItems._srpSummary) {
            bomData.cost_summary = bomItems._srpSummary;
          }
          lastBom.set(k, { filename: null, data: bomData });
          // Also persist so PDF handler can find it
          saveBom(k, bomData, ev.source).catch(function(e) { console.error('[bom-preview-save]', e); });
          await lPush(to3, [buildBomResultFlex(bomData)]);
        } else {
          await lPush(to3, [{ type: 'text', text: 'ไม่พบรายการใน catalog สำหรับ ' + previewForBom.spec.brand + ' ' + previewForBom.spec.size_kw + 'kW ครับ' }]);
        }
      } catch (e) {
        console.error('[bom-preview]', e.message);
        await lPush(to3, [{ type: 'text', text: 'เกิดข้อผิดพลาดในการดึง BOM: ' + e.message }]);
      }
      return;
    }
    await rText(rt, 'ไม่มีรายการใบเสนอราคาที่รอ confirm อยู่ครับ\nพิมพ์ spec ใหม่ได้เลยครับ');
    return;
  }

  // ── v2.0: Preview confirmation (ยืนยันก่อน generate PDF) ──
  var preview = quotationPreviewPending.get(k);
  if (preview && (Date.now() - preview.ts) < PREVIEW_TTL) {
    if (isConfirmation(lo)) {
      quotationPreviewPending.delete(k);
      incrementRate(ev.source.userId || ev.source.groupId || '', 'qt');
      await doGenerateAndSendQuotation(ev, preview.specStr, preview.spec, rt);
      return;
    }
    if (isRejection(lo)) {
      quotationPreviewPending.delete(k);
      await rText(rt, 'ยกเลิกแล้วครับ 👍 พิมพ์ใหม่ได้เลยครับ');
      return;
    }
  }

  // ── Quotation update confirmation ──
  var pending = quotationConfirmPending.get(k);
  if (pending && (Date.now() - pending.ts) < QUOTATION_TTL) {
    if (isConfirmation(lo)) {
      quotationConfirmPending.delete(k);
      await doGenerateAndSendQuotation(ev, pending.specStr, pending.spec, rt);
      return;
    }
    // If user says something else (not a confirmation), clear the pending and continue normal flow
    if (!/^(ไม่|no|ยกเลิก|cancel)/.test(lo)) {
      // Not a clear rejection either — let it fall through to normal handling
    } else {
      quotationConfirmPending.delete(k);
      await rText(rt, 'ตกลงครับ ยกเลิกการ update ใบเสนอราคา');
      return;
    }
  }

  // ── Quotation keywords work WITHOUT trigger word ──
  // ลูกค้าพิมพ์ "ขอใบเสนอราคา" / "ใบเสนอราคา" ตรงๆ ได้เลย ไม่ต้องมี "นัด" นำหน้า
  if (isQuotationRequest(lo)) {
    _trace.path.push('quotation-direct');
    await startQuotation(ev, text, rt);
    return;
  }

  // ── Direct BOM request bypass (no 'นัด' needed for "bom atmoce 13 แผง") ──
  if (isBomRequest(lo) && hasSystemSpec(lo)) {
    _trace.path.push('bom-direct');
    await startBom(ev, text);
    return;
  }

  // ── Direct Quotation request bypass (no 'นัด' needed for "ขอใบเสนอราคา atmoce 5kw 1P รวม 175000") ──
  if (isQuotationRequest(lo)) {
    _trace.path.push('quotation-direct');
    await startQuotation(ev, text, rt);
    return;
  }

  // ── Check Nasri trigger (for everything else) ──
  // Allow history/search requests through without "นัด" prefix so users can
  // type "ดูใบเสนอราคาของผม" or "หาใบของคุณสมชาย" directly.
  if (!isNasriTrigger(lo) && !isHistoryOrSearchRequest(lo)) {
    _trace.path.push('no-trigger');
    return;
  }

  console.log('[nasri] ' + k + ': ' + text);

  // ── v2.0 INT3: LLM Intent Router (Claude Haiku via intent-bridge) ──────────
  // LN-STATE: load conversation state for this user
  var _userState = _convState ? _convState.getState(k) : null;

  // LN-STATE: handle pending action first (before calling LLM)
  if (_userState && _userState.pending_action) {
    var _pa = _userState.pending_action;
    // If user replies with a QT number, resume the pending action
    var _paQtMatch = text.trim().match(/^QT\d{12,}$/);
    if (_paQtMatch) {
      var _paQtId = _paQtMatch[0];
      _convState.clearPending(k);
      _convState.setLastQuotation(k, _paQtId);
      _trace.path.push('pending-resolved:' + _pa);
      var _paDbPath = SQLITE_PATH;
      if (_pa === 'await_qt_for_update_price') {
        try {
          var _paDiff = await _qtCrud.updateQuotationPrices(_paQtId, _paDbPath);
          if (!_paDiff.changes || _paDiff.changes.length === 0) {
            await rText(rt, 'ไม่มีรายการที่อัพเดทราคาได้ครับ\nใบเสนอ ' + _paQtId);
          } else {
            await lReply(rt, [buildPriceUpdateDiffFlex(_paDiff.changes, _paDiff.old_total, _paDiff.new_total)]);
          }
        } catch(e) { await rText(rt, '❌ อัพเดทราคาไม่ได้ครับ: ' + e.message.slice(0, 80)); }
        return;
      }
      if (_pa === 'await_qt_for_resend') {
        try {
          var _paResend = await _qtCrud.resendPdf(_paQtId, { dbPath: _paDbPath });
          await rText(rt, '✅ ส่ง PDF ซ้ำแล้วครับ\nใบเสนอ ' + _paQtId + (_paResend && _paResend.pdf_url ? '\n' + _paResend.pdf_url : ''));
        } catch(e) { await rText(rt, '❌ ส่ง PDF ไม่ได้ครับ: ' + e.message.slice(0, 80)); }
        return;
      }
      if (_pa === 'await_qt_for_versions') {
        try {
          var _paVers = await _qtCrud.getVersions(_paQtId, _paDbPath);
          if (!_paVers || !_paVers.length) { await rText(rt, 'ไม่พบประวัติเวอร์ชันของ ' + _paQtId); }
          else { await lReply(rt, [buildVersionHistoryFlex(_paVers)]); }
        } catch(e) { await rText(rt, '❌ ดูเวอร์ชันไม่ได้ครับ: ' + e.message.slice(0, 80)); }
        return;
      }
      if (_pa === 'await_qt_for_view_detail') {
        try {
          var _paDetail = await _qtCrud.getQuotationDetail(_paQtId, _paDbPath);
          if (!_paDetail) { await rText(rt, 'ไม่พบใบเสนอราคา ' + _paQtId + ' ครับ'); }
          else { await lReply(rt, [buildQuotationDetailFlex(_paDetail)]); }
        } catch(e) { await rText(rt, '❌ ดูรายละเอียดไม่ได้ครับ: ' + e.message.slice(0, 80)); }
        return;
      }
      if (_pa === 'await_qt_for_edit_item' || _pa === 'await_qt_for_add_item' || _pa === 'await_qt_for_remove_item') {
        await rText(rt, 'รับ QT แล้วครับ ' + _paQtId + '\nกรุณาระบุรายการที่ต้องการ' +
          (_pa === 'await_qt_for_edit_item' ? 'แก้ไข' : _pa === 'await_qt_for_add_item' ? 'เพิ่ม' : 'ลบ') + 'ด้วยครับ');
        return;
      }
    }
    // User said something else — cancel pending
    if (isRejection && (typeof isRejection === 'function') && isRejection(lo)) {
      _convState.clearPending(k);
      await rText(rt, 'ยกเลิกแล้วครับ 👍');
      return;
    }
  }

  if (_intentBridge.needsLLM(text)) {
    var _intent = null;
    try {
      _intent = await _intentBridge.classifyIntent(text);
    } catch(e) {
      console.error('[intent-router] classifyIntent error:', e.message);
    }
    if (_intent && _intent.intent !== 'unknown' && _intent.confidence !== 'low') {
      _trace.path.push('intent:' + _intent.intent);
      // LN-STATE: use last_quotation_id from state if intent has no QT
      var _qtId   = _intent.quotation_id || (_userState && _userState.last_quotation_id) || null;
      var _dbPath = SQLITE_PATH;
      // LN-STATE: save QT number to state if present
      if (_intent.quotation_id && _convState) {
        _convState.setLastQuotation(k, _intent.quotation_id);
      }
      switch (_intent.intent) {

        case 'create': {
          // Delegate to existing quotation flow
          await startQuotation(ev, text, rt);
          return;
        }

        case 'edit_item': {
          if (!_qtId) {
            if (_convState) _convState.setState(k, { pending_action: 'await_qt_for_edit_item' });
            await rText(rt, 'กรุณาระบุเลข QT ด้วยครับ เช่น "QT202604130001"\nจะแก้ไขรายการใบไหนครับ?');
            return;
          }
          try {
            var _detail = await _qtCrud.getQuotationDetail(_qtId, _dbPath);
            if (!_detail) { await rText(rt, 'ไม่พบใบเสนอราคา ' + _qtId); return; }
            var _target = _detail.items && _detail.items[0];
            if (_intent.params && _intent.params.item_description) {
              var _desc = _intent.params.item_description;
              var _found = _detail.items.find(function(i) { return i.description.indexOf(_desc) >= 0; });
              if (_found) _target = _found;
            }
            if (!_target) { await rText(rt, 'ไม่พบรายการที่ต้องการแก้ไขใน ' + _qtId); return; }
            var _changes = {};
            if (_intent.params && _intent.params.quantity != null) _changes.quantity = _intent.params.quantity;
            if (_intent.params && _intent.params.unit_price != null) _changes.unit_price = _intent.params.unit_price;
            var _editRes = await _qtCrud.editItem(_qtId, _target.id, _changes, { dbPath: _dbPath, editedBy: ev.source.userId });
            await rText(rt, '✅ แก้ไขรายการแล้วครับ\nใบเสนอ ' + _qtId + ' v' + _editRes.version + '\n' + (_target.description || '').slice(0, 50));
          } catch(e) { await rText(rt, '❌ แก้ไขไม่ได้ครับ: ' + e.message.slice(0, 80)); }
          return;
        }

        case 'add_item': {
          if (!_qtId) {
            if (_convState) _convState.setState(k, { pending_action: 'await_qt_for_add_item' });
            await rText(rt, 'จะเพิ่มรายการในใบไหนครับ? ส่งเลข QT มาได้เลยครับ');
            return;
          }
          try {
            var _newItem = {
              description: (_intent.params && _intent.params.item_description) || 'รายการใหม่',
              quantity:    (_intent.params && _intent.params.quantity) || 1,
              unit:        (_intent.params && _intent.params.unit) || 'ชุด',
              unit_price:  0,
              total_price: 0,
              category:    'other',
            };
            var _addRes = await _qtCrud.addItem(_qtId, _newItem, { dbPath: _dbPath, editedBy: ev.source.userId });
            await rText(rt,
              '✅ เพิ่มรายการแล้วครับ\nใบเสนอ ' + _qtId + ' v' + _addRes.version +
              '\n' + _newItem.description + ' × ' + _newItem.quantity + ' ' + _newItem.unit +
              '\n⚠️ ยังไม่ได้ระบุราคา กรุณาแจ้งราคาเพิ่มด้วยครับ'
            );
          } catch(e) { await rText(rt, '❌ เพิ่มรายการไม่ได้ครับ: ' + e.message.slice(0, 80)); }
          return;
        }

        case 'remove_item': {
          if (!_qtId) {
            if (_convState) _convState.setState(k, { pending_action: 'await_qt_for_remove_item' });
            await rText(rt, 'จะลบรายการจากใบไหนครับ? ส่งเลข QT มาได้เลยครับ');
            return;
          }
          try {
            var _detailR = await _qtCrud.getQuotationDetail(_qtId, _dbPath);
            if (!_detailR) { await rText(rt, 'ไม่พบใบเสนอราคา ' + _qtId); return; }
            var _targetR = _detailR.items && _detailR.items[0];
            if (_intent.params && _intent.params.item_description) {
              var _descR = _intent.params.item_description;
              var _foundR = _detailR.items.find(function(i) { return i.description.indexOf(_descR) >= 0; });
              if (_foundR) _targetR = _foundR;
            }
            if (!_targetR) { await rText(rt, 'ไม่พบรายการที่ต้องการลบใน ' + _qtId); return; }
            var _rmRes = await _qtCrud.removeItem(_qtId, _targetR.id, { dbPath: _dbPath, editedBy: ev.source.userId });
            await rText(rt, '✅ ลบรายการแล้วครับ\nใบเสนอ ' + _qtId + ' v' + _rmRes.version + '\nลบ: ' + (_targetR.description || '').slice(0, 50));
          } catch(e) { await rText(rt, '❌ ลบรายการไม่ได้ครับ: ' + e.message.slice(0, 80)); }
          return;
        }

        case 'update_price': {
          if (!_qtId) {
            if (_convState) _convState.setState(k, { pending_action: 'await_qt_for_update_price' });
            await rText(rt, 'จะอัพเดทราคาใบไหนครับ? ส่งเลข QT มาได้เลยครับ\n(หรือพิมพ์ QT ตรงๆ เช่น QT202604130001)');
            return;
          }
          try {
            var _priceDiff = await _qtCrud.updateQuotationPrices(_qtId, _dbPath);
            if (!_priceDiff.changes || _priceDiff.changes.length === 0) {
              await rText(rt, 'ไม่มีรายการที่อัพเดทราคาได้ครับ (ไม่พบใน catalog)\nใบเสนอ ' + _qtId);
            } else {
              await lReply(rt, [buildPriceUpdateDiffFlex(_priceDiff.changes, _priceDiff.old_total, _priceDiff.new_total)]);
            }
          } catch(e) { await rText(rt, '❌ อัพเดทราคาไม่ได้ครับ: ' + e.message.slice(0, 80)); }
          return;
        }

        case 'history': {
          var _histUid = ev.source.userId || '';
          var _qtHistI = [];
          // Gap 3: DB v2 first, fallback to JSON on failure
          try {
            _qtHistI = await qtCrud.listQuotationsByUser(_histUid, { limit: 10, role: 'customer' });
          } catch (_dbHistErr) {
            console.error('[history] DB read failed, falling back to JSON:', _dbHistErr.message);
            _qtHistI = getQtHistoryForUser(_histUid, 10);
          }
          if (!_qtHistI || !_qtHistI.length) {
            await rText(rt, 'ยังไม่มีใบเสนอราคาในระบบครับ\nพิมพ์ "นัด ทำใบเสนอราคา [spec]" เพื่อสร้างครับ');
          } else {
            await lReply(rt, [buildQuotationHistoryFlex(_qtHistI)]);
          }
          return;
        }

        case 'resend': {
          if (!_qtId) {
            if (_convState) _convState.setState(k, { pending_action: 'await_qt_for_resend' });
            await rText(rt, 'จะส่ง PDF ใบไหนครับ? ส่งเลข QT มาได้เลยครับ');
            return;
          }
          try {
            var _resendRes = await _qtCrud.resendPdf(_qtId, { dbPath: _dbPath });
            await rText(rt, '✅ ส่ง PDF ซ้ำแล้วครับ\nใบเสนอ ' + _qtId + (_resendRes && _resendRes.pdf_url ? '\n' + _resendRes.pdf_url : ''));
          } catch(e) { await rText(rt, '❌ ส่ง PDF ไม่ได้ครับ: ' + e.message.slice(0, 80)); }
          return;
        }

        case 'versions': {
          if (!_qtId) {
            if (_convState) _convState.setState(k, { pending_action: 'await_qt_for_versions' });
            await rText(rt, 'จะดูเวอร์ชันของใบไหนครับ? ส่งเลข QT มาได้เลยครับ');
            return;
          }
          try {
            var _versions = await _qtCrud.getVersions(_qtId, _dbPath);
            if (!_versions || !_versions.length) {
              await rText(rt, 'ไม่พบประวัติเวอร์ชันของ ' + _qtId);
            } else {
              await lReply(rt, [buildVersionHistoryFlex(_versions)]);
            }
          } catch(e) { await rText(rt, '❌ ดูเวอร์ชันไม่ได้ครับ: ' + e.message.slice(0, 80)); }
          return;
        }

        case 'search_by_customer': {
          var _custQuery = (_intent.params && _intent.params.customer_name_query) || '';
          if (!_custQuery) {
            await rText(rt, 'ค้นหาใบเสนอของใครครับ? พิมพ์ชื่อลูกค้ามาได้เลยครับ');
            return;
          }
          try {
            // PDPA: non-sales roles can only search their own quotations
            var _isSales = _userRole === 'sales' || _userRole === 'admin';
            var _searchResults = await _qtCrud.searchQuotationsByCustomer(
              _custQuery,
              _isSales ? null : (ev.source.userId || ''),
              { dbPath: _dbPath, limit: 10 }
            );
            if (!_searchResults || !_searchResults.length) {
              await rText(rt, 'ไม่พบใบเสนอราคาของลูกค้า "' + _custQuery + '" ครับ');
            } else {
              await lReply(rt, [buildQuotationSearchResultFlex(_searchResults, _custQuery)]);
            }
          } catch(e) { await rText(rt, '❌ ค้นหาไม่ได้ครับ: ' + e.message.slice(0, 80)); }
          return;
        }

        case 'view_detail': {
          if (!_qtId) {
            if (_convState) _convState.setState(k, { pending_action: 'await_qt_for_view_detail' });
            await rText(rt, 'จะดูรายละเอียดใบไหนครับ? ส่งเลข QT มาได้เลยครับ');
            return;
          }
          try {
            var _detail = await _qtCrud.getQuotationDetail(_qtId, _dbPath);
            if (!_detail) {
              await rText(rt, 'ไม่พบใบเสนอราคา ' + _qtId + ' ครับ');
            } else {
              await lReply(rt, [buildQuotationDetailFlex(_detail)]);
            }
          } catch(e) { await rText(rt, '❌ ดูรายละเอียดไม่ได้ครับ: ' + e.message.slice(0, 80)); }
          return;
        }

        default:
          // 'analytics', 'set_price' → fall through to old parser below
          _trace.path.push('intent-fallthrough:' + _intent.intent);
          break;
      }
    }
  }
  // ── end INT3 intent router ─────────────────────────────────────────────────

  // Help / menu
  if (lo.indexOf('ช่วย') >= 0 || lo.indexOf('help') >= 0 || lo.indexOf('เมนู') >= 0) {
    await lReply(rt, [menuFlex()]); return;
  }

  // ── Quotation / PDF request (with trigger word) ──
  if (isQuotationRequest(lo)) {
    _trace.path.push('quotation');
    await startQuotation(ev, text, rt);
    return;
  }
  // Broader catch: "เสนอ" + solar spec, or "ราคา" + brand/kw spec → treat as quotation
  if (/เสนอ/.test(lo) && hasSystemSpec(lo)) {
    await startQuotation(ev, text, rt);
    return;
  }

  // ── v2.0: ดูใบเสนอราคา / ประวัติ ──
  if (/ดูใบเสนอราคา|ใบเสนอราคา.*ของฉัน|ประวัติใบเสนอ|ประวัติ qt|qt ของฉัน|my quotation/i.test(lo)) {
    var uid = ev.source.userId || '';
    var qtHist = getQtHistoryForUser(uid, 5);
    if (!qtHist.length) {
      await rText(rt, 'ยังไม่มีใบเสนอราคาของคุณในระบบครับ\nพิมพ์ "นัด ทำใบเสนอราคา [ยี่ห้อ] [kW]" เพื่อสร้างครับ 📄');
      return;
    }
    var hist = 'ใบเสนอราคาของคุณ (' + qtHist.length + ' รายการล่าสุด)\n━━━━━━━━━━━━━━━\n';
    qtHist.forEach(function(q, i) {
      hist += (i + 1) + '. ' + q.quote_number + '\n';
      hist += '   ' + q.brand + ' ' + q.size_kw + 'kW ' + q.phase + (q.has_battery ? ' + Batt' : '') + '\n';
      if (q.customer_name) hist += '   ลูกค้า: ' + q.customer_name + '\n';
      hist += '   ฿' + (q.grand_total || 0).toLocaleString() + ' • ' + q.ts.slice(0, 10) + '\n';
      if (q.pdf_url) hist += '   ' + q.pdf_url + '\n';
      hist += '\n';
    });
    hist += '━━━━━━━━━━━━━━━\nสร้างใหม่: "นัด ทำใบเสนอราคา [spec]"';
    await rText(rt, hist);
    return;
  }

  // BOM request or system spec in same message
  if (isBomRequest(lo) || hasSystemSpec(lo)) {
    _trace.path.push('startBom');
    await startBom(ev, text);
    return;
  }

  // Search BOMs
  if (lo.indexOf('ค้นหา') >= 0 || lo.indexOf('search') >= 0 || lo.indexOf('ดู bom') >= 0 || lo.indexOf('bom เก่า') >= 0 || lo.indexOf('history') >= 0) {
    var searchQuery = text.replace(/นัด|nasri|ไอ่นัด|ค้นหา|search|ดู bom|bom เก่า|history|bom/gi, '').trim();
    if (!searchQuery) {
      // Show recent BOMs
      var bomIdx = loadBomIndex();
      var recent = bomIdx.boms.slice(-10).reverse();
      if (!recent.length) {
        await rText(rt, 'ยังไม่มี BOM ในระบบครับ');
        return;
      }
      var list = 'BOM ล่าสุด (' + bomIdx.boms.length + ' รายการ)\n━━━━━━━━━━━━━━━\n';
      recent.forEach(function(b, i) {
        var d = (b.updated || b.created || '').slice(0, 10);
        list += (i+1) + '. ' + (b.project_name || 'ไม่มีชื่อ') + '\n   ' + b.item_count + ' รายการ • ฿' + (b.total_cost || 0).toLocaleString() + ' • ' + d + '\n';
      });
      list += '━━━━━━━━━━━━━━━\nพิมพ์ "ค้นหา ชื่อโปรเจกต์" เพื่อค้นหา\n"โหลด ชื่อ" เพื่อโหลด BOM เก่ามาแก้ไข';
      await rText(rt, list);
      return;
    }
    // Search by query
    var srResults = searchBoms(searchQuery);
    if (!srResults.length) {
      await rText(rt, 'ไม่พบ BOM ที่ตรงกับ "' + searchQuery + '" ครับ');
      return;
    }
    var list = 'ผลค้นหา "' + searchQuery + '" (' + srResults.length + ' รายการ)\n━━━━━━━━━━━━━━━\n';
    srResults.slice(0, 5).forEach(function(b, i) {
      var d = (b.updated || b.created || '').slice(0, 10);
      list += (i+1) + '. ' + (b.project_name || 'ไม่มีชื่อ') + '\n   ' + b.item_count + ' รายการ • ฿' + (b.total_cost || 0).toLocaleString() + ' • ' + d + '\n';
    });
    list += '━━━━━━━━━━━━━━━\nพิมพ์ "โหลด ชื่อโปรเจกต์" เพื่อโหลดมาแก้ไข\n"ดู ชื่อ" เพื่อดู PDF';
    await rText(rt, list);
    return;
  }

  // Load old BOM for viewing or editing
  if (lo.indexOf('โหลด') >= 0 || lo.indexOf('load') >= 0) {
    var loadQuery = text.replace(/นัด|nasri|ไอ่นัด|โหลด|load/gi, '').trim();
    if (!loadQuery) {
      await rText(rt, 'พิมพ์ "โหลด ชื่อโปรเจกต์" เพื่อโหลด BOM เก่าครับ');
      return;
    }
    var ldResults = searchBoms(loadQuery);
    if (!ldResults.length) {
      await rText(rt, 'ไม่พบ BOM "' + loadQuery + '" ครับ');
      return;
    }
    var ldMatch = ldResults[0];
    var ldBomData = loadBomData(ldMatch.filename);
    if (!ldBomData) {
      await rText(rt, 'ไม่สามารถโหลดไฟล์ "' + ldMatch.filename + '" ได้ครับ');
      return;
    }
    // Load into session for editing
    var ldSess = newSess(k);
    ldSess.data = ldBomData;
    ldSess.step = 'done';
    lastBom.set(k, { filename: ldMatch.filename, data: ldBomData });
    await rText(rt, 'โหลด BOM: ' + (ldBomData.project_name || 'ไม่มีชื่อ') + '\n' + ldBomData.items.length + ' รายการ • ฿' + (ldMatch.total_cost || 0).toLocaleString() + '\n\nพิมพ์:\n• "แก้ไข" เพื่อแก้ไขรายการ\n• "ขอ pdf" เพื่อสร้าง PDF\n• "ยกเลิก" เพื่อปิด');
    return;
  }

  // View old BOM PDF by name
  if ((lo.indexOf('ดู') >= 0) && (lo.indexOf('bom') >= 0 || lo.indexOf('pdf') >= 0)) {
    var viewQuery = text.replace(/นัด|nasri|ไอ่นัด|ดู|view|bom|pdf/gi, '').trim();
    if (viewQuery) {
      var vwResults = searchBoms(viewQuery);
      if (vwResults.length) {
        var vwMatch = vwResults[0];
        var vwHtmlFn = vwMatch.filename.replace('.json', '.html');
        var vwUrl = 'https://ai.enervia.co.th/api/bom-view/' + encodeURIComponent(vwHtmlFn);
        await lReply(rt, [{
          type: 'flex', altText: 'BOM: ' + (vwMatch.project_name || 'BOM'),
          contents: {
            type: 'bubble', size: 'kilo',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '\ud83d\udcc4 ' + (vwMatch.project_name || 'BOM'), weight: 'bold', size: 'md', color: '#1a1a2e', wrap: true }], backgroundColor: '#f0e68c', paddingAll: '12px' },
            body: { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: vwMatch.item_count + ' \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23 \u2022 \u0e3f' + (vwMatch.total_cost || 0).toLocaleString(), size: 'sm', color: '#666666' },
              { type: 'text', text: '\u0e2a\u0e23\u0e49\u0e32\u0e07: ' + (vwMatch.created || '').slice(0,10) + (vwMatch.updated !== vwMatch.created ? ' \u2022 \u0e41\u0e01\u0e49\u0e44\u0e02: ' + (vwMatch.updated || '').slice(0,10) : ''), size: 'xs', color: '#888888', margin: 'sm', wrap: true },
            ], paddingAll: '12px' },
            footer: { type: 'box', layout: 'vertical', contents: [
              { type: 'button', action: { type: 'uri', label: '\ud83d\udcc4 \u0e40\u0e1b\u0e34\u0e14 BOM', uri: vwUrl }, style: 'primary', color: '#1a237e' },
            ], paddingAll: '12px' },
          },
        }]);
        return;
      }
      await rText(rt, '\u0e44\u0e21\u0e48\u0e1e\u0e1a BOM "' + viewQuery + '" \u0e04\u0e23\u0e31\u0e1a');
      return;
    }
  }

  // ── INT4: v2.0 Phase B/C/D Flex intent handlers ──────────────
  var _userId = ev.source.userId || '';

  // "ดูใบเสนอ QT-xxxx" — QuotationDetail Flex
  var _qtDetailM = lo.match(/ดูใบเสนอ\s+(qt[-\w]+)/i);
  if (_qtDetailM) {
    var _qtNum = _qtDetailM[1].toUpperCase();
    var _qtRec = getQtHistoryForUser(_userId, 50).find(function(q) { return q.quote_number === _qtNum; });
    if (_qtRec) {
      await lReply(rt, [buildQuotationDetailFlex(_qtRec, _qtRec.items || [])]);
    } else {
      await rText(rt, 'ไม่พบใบเสนอราคา ' + _qtNum + ' ครับ');
    }
    return;
  }

  // "ประวัติของฉัน" / "ใบเก่า" → QuotationHistory carousel Flex
  if (/ประวัติของฉัน|ใบเก่า|qt เก่า|รายการเก่า/.test(lo)) {
    var _hist = getQtHistoryForUser(_userId, 10).map(function(q) {
      return { qt_number: q.quote_number, brand: q.brand, size_kw: q.size_kw, phase: q.phase,
               customer_name: q.customer_name, grand_total: q.grand_total, status: 'sent', created_at: q.ts };
    });
    await lReply(rt, [buildQuotationHistoryFlex(_hist)]);
    return;
  }

  // "สรุปเดือน" / "สรุปยอด" → MonthlySummary (admin only)
  if (/สรุปเดือน|สรุปยอด|monthly summary/.test(lo)) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    var _mnow = new Date();
    var _allQt = getQtHistoryForUser('', 999);
    var _bc = {};
    _allQt.forEach(function(q) { _bc[q.brand] = (_bc[q.brand] || 0) + 1; });
    var _summary = {
      month: _mnow.getMonth() + 1, year: _mnow.getFullYear(),
      total_quotes: _allQt.length,
      total_revenue: _allQt.reduce(function(s, q) { return s + (q.grand_total || 0); }, 0),
      avg_size_kw: _allQt.length ? _allQt.reduce(function(s, q) { return s + (parseFloat(q.size_kw) || 0); }, 0) / _allQt.length : 0,
      close_rate: 0.72,
      top_brands: Object.keys(_bc).sort(function(a, b) { return _bc[b] - _bc[a]; }).slice(0, 3).map(function(b) {
        return { brand: b, count: _bc[b], revenue: 0 };
      }),
    };
    await lReply(rt, [buildMonthlySummaryFlex(_summary)]);
    return;
  }

  // "top products" / "สินค้าขายดี" (admin only)
  if (/top products|สินค้าขายดี/.test(lo)) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    var _allQtP = getQtHistoryForUser('', 999);
    var _pnow = new Date();
    var _pc = {}; var _ptot = _allQtP.length || 1;
    _allQtP.forEach(function(q) { var _pk = q.brand + ' ' + q.size_kw + 'kW'; _pc[_pk] = (_pc[_pk] || 0) + 1; });
    var _products = Object.keys(_pc).sort(function(a, b) { return _pc[b] - _pc[a]; }).slice(0, 10).map(function(p, i) {
      return { rank: i + 1, name: p.split(' ').slice(1).join(' '), brand: p.split(' ')[0], count: _pc[p], share: _pc[p] / _ptot * 100 };
    });
    await lReply(rt, [buildTopProductsFlex(_products, (_pnow.getMonth() + 1) + '/' + _pnow.getFullYear())]);
    return;
  }

  // "แก้ราคา [brand] [model] [ราคาใหม่]" (admin only)
  var _priceEditM = text.match(/แก้ราคา\s+(\S+)\s+(\S+)\s+(\d+)/);
  if (_priceEditM) {
    if (!isAdminUser(_userId)) { await rText(rt, 'คำสั่งนี้ใช้ได้เฉพาะ admin ครับ'); return; }
    var _peBrand = _priceEditM[1], _peModel = _priceEditM[2], _pePrice = parseInt(_priceEditM[3], 10);
    await lReply(rt, [buildProductPriceEditFlex(_peBrand, _peModel, 0, _pePrice)]);
    return;
  }

  // "ยืนยัน QT-xxxx" — button postback confirm (placeholder — full CRUD in INT2/INT3)
  var _confirmQtM = lo.match(/^ยืนยัน\s+(qt[-\w]+)/i);
  if (_confirmQtM) {
    await rText(rt, '✅ รับทราบ — กำลัง generate PDF สำหรับ ' + _confirmQtM[1].toUpperCase() + ' ครับ');
    return;
  }

  // ── sobek INT5: Admin-only command routing ─────────────────────
  // Keyword detection → checkAdminIntent() → deny non-admins immediately.
  var callerUserId = ev.source && ev.source.userId ? ev.source.userId : '';
  var adminIntentMatch = null;
  if      (/แก้ราคา|อัพเดทราคา|set.*price|update.*price/i.test(text))          adminIntentMatch = 'update_price';
  else if (/แก้ค่าแรง|แก้สูตรราคา|edit.*formula|update.*formula/i.test(text))  adminIntentMatch = 'update_formula';
  else if (/แก้ค่าขอขนาน|update.*tier/i.test(text))                            adminIntentMatch = 'update_tier';
  else if (/สรุปยอดเดือน|สรุปยอด.*เดือน|analytics.*summary/i.test(text))      adminIntentMatch = 'analytics_summary';
  else if (/ลบข้อมูลลูกค้า|delete.*customer/i.test(text))                      adminIntentMatch = 'delete_customer_data';
  else if (/export.*ใบของ|export.*other.*user/i.test(text))                    adminIntentMatch = 'export_other_user';
  else if (/retention.*run|ลบไฟล์เก่า.*ระบบ/i.test(text))                     adminIntentMatch = 'retention_run';
  if (adminIntentMatch) {
    _trace.path.push('admin_intent:' + adminIntentMatch);
    var adminOk = await checkAdminIntent(callerUserId, adminIntentMatch, rt, text.length);
    if (!adminOk) return; // denied — reply sent by checkAdminIntent
    // Admin granted — Phase C/D concrete handler wired here when implemented
    auditLog('admin_intent_pending_handler', callerUserId, adminIntentMatch);
    await rText(rt, '\u2705 [Admin] \u0e23\u0e31\u0e1a\u0e04\u0e33\u0e2a\u0e31\u0e48\u0e07: ' + adminIntentMatch + '\n(handler Phase C/D \u0e01\u0e33\u0e25\u0e31\u0e07 implement)');
    return;
  }

  // ── General question → answer via Claude API ──────────────────
  // Test cases:
  // 1. "nasri อธิบายระบบโซลาร์ออนกริดให้หน่อย" → general solar question → Claude answers
  // 2. "nasri ราคาไฟฟ้าหน่วยละเท่าไหร่" → electricity price question → Claude answers
  // 3. "นัด แผงโซลาร์มีอายุกี่ปี" → panel lifespan question → Claude answers
  // 4. "nasri ขอ bom sigenergy 5kw 1phase" → BOM flow (hits isBomRequest above, never reaches here)
  // 5. "nasri สวัสดี" → greeting → Claude answers
  // Price question: answer directly from catalog (NO API token used)
  if (isPriceQuestion(lo)) {
    var matches = await priceSearch(text);
    if (matches.length > 0) {
      console.log('[nasri] Direct price answer — no API call, ' + matches.length + ' items');
      var fmt = function(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 0 }); };
      var reply = '💰 ราคาสินค้า Enervia (ราคาสั่งซื้อ)\n━━━━━━━━━━━━━━━━━━━━\n';
      matches.forEach(function(m, i) {
        reply += (i + 1) + '. ' + m.name + '\n   ฿' + fmt(m.price) + ' [' + m.sheet + ']\n';
      });
      reply += '━━━━━━━━━━━━━━━━━━━━\nราคาจาก Google Sheets Catalog';
      await rText(rt, reply);
      return;
    }
  }
  // General question → Claude AI analysis (reads full message, analyzes intent)
  console.log('[nasri] Claude AI analysis for:', text.slice(0, 80));
  // Provide catalog context if available for better answers
  var catalogCtx = '';
  try {
    var matches = await priceSearch(text);
    if (matches.length > 0) {
      catalogCtx = 'ข้อมูลจาก Enervia Catalog:\n';
      matches.slice(0, 10).forEach(function(m) {
        catalogCtx += '- ' + m.name + ': ฿' + m.price.toLocaleString() + ' [' + m.sheet + ']\n';
      });
    }
  } catch (e) { /* ignore catalog errors */ }
  var claudeReply = await askClaude(text, catalogCtx);
  await rText(rt, claudeReply);
}

// ─── Postback Handler (Rich Menu buttons / Flex postback actions) ──
async function handlePostback(ev) {
  var data   = ev.postback && ev.postback.data ? ev.postback.data : '';
  var rt     = ev.replyToken;
  var userId = ev.source && ev.source.userId ? ev.source.userId : '';
  if (!rt || !data) return;

  // ── Gap 1c / Gap 3: handle structured postback actions ──────
  // data format: "action=view&qt=QT-000001" or "action=edit&qt=QT-000001"
  if (data.startsWith('action=')) {
    var params = {};
    data.split('&').forEach(function(pair) {
      var idx = pair.indexOf('=');
      if (idx > 0) params[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    var action = params.action;
    var qtNum  = params.qt || '';

    if (action === 'view' && qtNum) {
      // Show quotation detail — reuse existing detail handler path
      var synthView = Object.assign({}, ev, {
        type: 'message',
        message: { type: 'text', text: 'ดูใบเสนอ ' + qtNum },
        replyToken: rt,
      });
      return handleText(synthView);
    }

    if (action === 'edit' && qtNum) {
      // Enter edit flow: store last_quotation_id in conversation state then prompt
      var k = userId;
      if (_convState) {
        _convState.setLastQuotation(k, qtNum);
        _convState.setState(k, { pending_action: 'await_qt_for_edit_item' });
      }
      var synthEdit = Object.assign({}, ev, {
        type: 'message',
        message: { type: 'text', text: 'แก้ใบเสนอ ' + qtNum },
        replyToken: rt,
      });
      return handleText(synthEdit);
    }

    if (action === 'pdf' && qtNum) {
      var synthPdf = Object.assign({}, ev, {
        type: 'message',
        message: { type: 'text', text: 'pdf ' + qtNum },
        replyToken: rt,
      });
      return handleText(synthPdf);
    }
  }

  // Fallback: treat postback data as a synthetic text message so existing
  // intent handlers in handleText fire without duplication.
  var synth = Object.assign({}, ev, {
    type: 'message',
    message: { type: 'text', text: data },
    replyToken: rt,
  });
  return handleText(synth);
}

// ─── LN9: Rich Menu helpers ────────────────────────────────────

// In-memory cache of current default richMenuId so we don't re-create on restart
var _defaultRichMenuId = process.env.LINE_RICH_MENU_ID || '';

/**
 * Link the default rich menu to a user.
 * Called on 'follow' event and from admin endpoint.
 */
async function _linkRichMenuToUser(userId) {
  if (!_defaultRichMenuId) return;
  try {
    await _richMenuMgr.linkToUser(userId, _defaultRichMenuId);
  } catch (e) {
    console.error('[rich-menu link]', userId, e.message);
  }
}

// ─── HTTP Server ──────────────────────────────────────────────
function readBody(req) {
  return new Promise(function(resolve) {
    var chunks = [];
    req.on('data', function(c) { chunks.push(c); });
    req.on('end', function() { resolve(Buffer.concat(chunks).toString('utf8')); });
  });
}

var server = http.createServer(async function(req, res) {
  var url = req.url || '/';
  var method = req.method;

  // Health
  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    var bomCount = 0, qtCount = 0;
    try { bomCount = loadBomIndex().boms.length; } catch (e) { /* ignore */ }
    try { qtCount = loadQtIndex().quotations.length; } catch (e) { /* ignore */ }
    res.end(JSON.stringify({
      status: 'ok',
      service: 'nasri-line-bot',
      version: 'v2.0.0',
      bom_count: bomCount,
      qt_count: qtCount,
      rate_limit: { qt_per_day: RATE_LIMIT_MAX_QT, bom_per_day: RATE_LIMIT_MAX_BOM },
      ts: new Date().toISOString(),
    }));
    return;
  }

  // Diagnostic: recent webhook logs (ring buffer) — sobek: admin only
  if (method === 'GET' && url === '/api/webhook-logs') {
    if (!requireAdminAuth(req, res)) return;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ logs: global._webhookLogs || [], lineResults: _lastLineResults || [] }));
    return;
  }

  // Diagnostic: test LINE API token + env — sobek: admin only
  if (method === 'GET' && url === '/api/test-line') {
    if (!requireAdminAuth(req, res)) return;
    try {
      var h = lHeaders();
      if (!h) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LINE_TOKEN not set', hasSecret: !!LINE_SECRET, hasToken: !!LINE_TOKEN }));
        return;
      }
      var r = await fetch(API + '/info', { headers: h });
      var info = await r.text();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: r.status, hasSecret: !!LINE_SECRET, hasToken: !!LINE_TOKEN, tokenPrefix: LINE_TOKEN.slice(0, 10) + '...', hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY, botInfo: JSON.parse(info) }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // Diagnostic: test qsolar subprocess — sobek: admin only
  if (method === 'GET' && url === '/api/test-qsolar') {
    if (!requireAdminAuth(req, res)) return;
    try {
      var cp = require('child_process');
      var testPayload = JSON.stringify({ tool: 'qsolar_generate', brand: 'Solis', size_kw: 10, phase: '3P', has_battery: false, has_backup: false, customer_name: 'TEST', grand_total: 245000 });
      var testEnv = Object.assign({}, process.env, {
        ORACLE_REPO_ROOT: path.join(__dirname, '..', '..'),
        QSOLAR_OUTPUT_DIR: path.join(__dirname, 'boms'),
        QSOLAR_ASSET_DIR: path.join(__dirname, 'assets'),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUSERBASE: '/var/www/vhosts/enervia.co.th/.local',
        PYTHONPATH: '/var/www/vhosts/enervia.co.th/.local/lib/python3.11/site-packages',
      });
      cp.execFile('python3', [QSOLAR_SCRIPT, testPayload], { timeout: 30000, env: testEnv },
        function(err, stdout, stderr) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ err: err ? err.message : null, stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 2000), script: QSOLAR_SCRIPT }));
        });
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // Diagnostic: test bomsolar subprocess — sobek: admin only
  if (method === 'GET' && url === '/api/test-bomsolar') {
    if (!requireAdminAuth(req, res)) return;
    try {
      var cp = require('child_process');
      var testOutPath = path.join(__dirname, 'boms', 'test-bom-' + Date.now() + '.pdf');
      var testPayload = JSON.stringify({ tool: 'bomsolar_generate_pdf', project_name: 'TEST', project_address: 'Bangkok', order_date: '16/03/26', items: [{ part_number: 'JA625', part_name: 'JA Solar 625W', manufacturer: 'JA Solar', category: 'โมดูล', quantity: 8, unit_cost: 3800, total_cost: 30400, notes: '' }], output_path: testOutPath });
      var testEnv = Object.assign({}, process.env, {
        ORACLE_REPO_ROOT: path.join(__dirname, '..', '..'),
        BOMSOLAR_OUTPUT_DIR: path.join(__dirname, 'boms'),
        BOMSOLAR_ASSET_DIR: path.join(__dirname, 'mcp-bomsolar', 'assets'),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUSERBASE: '/var/www/vhosts/enervia.co.th/.local',
        PYTHONPATH: '/var/www/vhosts/enervia.co.th/.local/lib/python3.11/site-packages',
      });
      cp.execFile('python3', [BOMSOLAR_SCRIPT, testPayload], { timeout: 30000, env: testEnv },
        function(err, stdout, stderr) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ err: err ? err.message : null, stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 2000), script: BOMSOLAR_SCRIPT }));
        });
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }


  // Webhook
  if (method === 'POST' && url === '/webhook') {
    if (!global._webhookLogs) global._webhookLogs = [];
    var body = await readBody(req);
    var wlog = { ts: new Date().toISOString(), sigPresent: !!req.headers['x-line-signature'] };
    if (!verifySig(body, req.headers['x-line-signature'])) {
      wlog.result = 'REJECTED_SIG';
      global._webhookLogs.push(wlog);
      if (global._webhookLogs.length > 20) global._webhookLogs.shift();
      res.writeHead(401); res.end('Unauthorized'); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    try {
      var data = JSON.parse(body);
      var events = data.events || [];
      wlog.eventCount = events.length;
      wlog.events = events.map(function(e) { return { type: e.type, msgType: e.message && e.message.type, text: e.message && e.message.text && e.message.text.slice(0, 80) }; });
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        // ── text message ──
        if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
          try {
            await handleText(ev);
            wlog.events[i].handled = 'OK';
            wlog.events[i].trace = ev._trace ? ev._trace.path : [];
          } catch (e) {
            console.error('[ev]', e);
            wlog.events[i].handled = 'ERROR: ' + e.message;
          }
        }
        // ── postback event (Rich Menu button / Flex button with data) ──
        if (ev.type === 'postback' && ev.postback) {
          try {
            await handlePostback(ev);
            wlog.events[i].handled = 'POSTBACK_OK';
          } catch (e) {
            console.error('[postback]', e);
            wlog.events[i].handled = 'POSTBACK_ERROR: ' + e.message;
          }
        }
        // ── follow event (user adds bot) — link Rich Menu ──
        if (ev.type === 'follow' && ev.source && ev.source.userId) {
          _linkRichMenuToUser(ev.source.userId).catch(function(e) {
            console.error('[rich-menu follow]', e.message);
          });
        }
      }
      wlog.result = 'OK';
    } catch (e) {
      console.error('[parse]', e);
      wlog.result = 'PARSE_ERROR: ' + e.message;
    }
    global._webhookLogs.push(wlog);
    if (global._webhookLogs.length > 20) global._webhookLogs.shift();
    return;
  }

  // ── Enervia v2.5: Archive + Equipment Catalog (Basic Auth) ───
  // Basic-auth gate — only fires for /api/archive* and /api/v2/catalog*
  // /webhook, /api/catalog (admin), mcp-* are NOT in PROTECTED list → unaffected
  if (!_enerviaAuth.gate(req, res)) return;
  if (_enerviaArchive.handle(req, res)) return;
  if (_enerviaArchiveCatalog.handle(req, res)) return;

  // Catalog search API — sobek: admin only (exposes product prices)
  // NOTE: This is the existing Google Sheets catalog — different from
  // /api/v2/catalog (equipment catalog for the archive mockup UI).
  if (method === 'GET' && url.indexOf('/api/catalog') === 0) {
    if (!requireAdminAuth(req, res)) return;
    try {
      var catalog = await getCatalog();
      var uObj = new URL(url, 'http://localhost');
      var q = uObj.searchParams.get('q') || '';
      var sheet = uObj.searchParams.get('sheet') || '';
      var result;
      if (q) {
        result = { query: q, matches: searchCatalog(catalog, q).slice(0, 50) };
      } else if (sheet) {
        result = { sheet: sheet, rows: catalog[sheet] || [] };
      } else {
        result = { sheets: Object.keys(catalog).map(function(k) { return { name: k, count: catalog[k].length }; }) };
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // BOM list API — sobek: admin only (exposes customer BOM data)
  if (method === 'GET' && (url === '/api/bom-list' || url.indexOf('/api/bom-list?') === 0)) {
    if (!requireAdminAuth(req, res)) return;
    try {
      var bomListIndex = loadBomIndex();
      var blUrl = new URL(url, 'http://localhost');
      var blQ = blUrl.searchParams.get('q') || '';
      var blBoms = blQ ? searchBoms(blQ) : bomListIndex.boms.slice().reverse();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ total: blBoms.length, boms: blBoms.slice(0, 50) }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // Quotation list (metadata only) — sobek: admin only (exposes customer_name + grand_total)
  if (method === 'GET' && (url === '/api/qt-list' || url.indexOf('/api/qt-list?') === 0)) {
    if (!requireAdminAuth(req, res)) return;
    try {
      var qtListIdx = loadQtIndex();
      var qlUrl = new URL(url, 'http://localhost');
      var qlQ = (qlUrl.searchParams.get('q') || '').toLowerCase();
      var qlUser = qlUrl.searchParams.get('userId') || '';
      var qlList = qtListIdx.quotations.slice().reverse();
      if (qlUser) qlList = qlList.filter(function(q) { return q.userId === qlUser; });
      if (qlQ) qlList = qlList.filter(function(q) {
        return ((q.quote_number || '') + ' ' + (q.brand || '') + ' ' + (q.customer_name || '')).toLowerCase().indexOf(qlQ) >= 0;
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ total: qlList.length, quotations: qlList.slice(0, 50) }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // DB stats — sobek: admin only (exposes sqlite_path + infra info)
  if (method === 'GET' && url === '/api/db-stats') {
    if (!requireAdminAuth(req, res)) return;
    try {
      var stats = {
        sqlite_available: sqliteAvailable,
        sqlite_init_error: sqliteInitError || null,
        sqlite_path: SQLITE_PATH,
        use_legacy_json: USE_LEGACY_JSON,
        node_version: process.version,
        bom_count: 0,
        qt_count: 0,
        db_file_size_bytes: 0,
        legacy_bom_json_size: 0,
        legacy_qt_json_size: 0,
      };
      if (sqliteAvailable) {
        try { stats.bom_count = sqliteDb.prepare('SELECT COUNT(*) AS c FROM boms').get().c; } catch (e) {}
        try { stats.qt_count = sqliteDb.prepare('SELECT COUNT(*) AS c FROM quotations').get().c; } catch (e) {}
        try { stats.db_file_size_bytes = fs.statSync(SQLITE_PATH).size; } catch (e) {}
      }
      try { if (fs.existsSync(BOM_INDEX)) stats.legacy_bom_json_size = fs.statSync(BOM_INDEX).size; } catch (e) {}
      try { if (fs.existsSync(QT_INDEX_PATH)) stats.legacy_qt_json_size = fs.statSync(QT_INDEX_PATH).size; } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(stats));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // ── LN9: Rich Menu admin endpoints ────────────────────────────
  // POST /api/admin/rich-menu/create  → create + set default menu
  if (method === 'POST' && url === '/api/admin/rich-menu/create') {
    if (!requireAdminAuth(req, res)) return;
    try {
      var rmId = await _richMenuMgr.createAndSetDefault();
      _defaultRichMenuId = rmId;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, richMenuId: rmId }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // POST /api/admin/rich-menu/upload  → upload image (body: raw PNG/JPEG bytes)
  // Query: ?menuId=xxx&contentType=image/png
  if (method === 'POST' && url.indexOf('/api/admin/rich-menu/upload') === 0) {
    if (!requireAdminAuth(req, res)) return;
    try {
      var rmUpUrl = new URL(url, 'http://localhost');
      var rmUpId = rmUpUrl.searchParams.get('menuId') || _defaultRichMenuId;
      var rmCt = rmUpUrl.searchParams.get('contentType') || 'image/png';
      if (!rmUpId) { res.writeHead(400); res.end(JSON.stringify({ error: 'menuId required' })); return; }
      var imgBuf = await new Promise(function(resolve) {
        var chunks = []; req.on('data', function(c) { chunks.push(c); }); req.on('end', function() { resolve(Buffer.concat(chunks)); });
      });
      await _richMenuMgr.uploadImage(rmUpId, imgBuf, rmCt);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, richMenuId: rmUpId, bytes: imgBuf.length }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // GET /api/admin/rich-menu/list
  if (method === 'GET' && url === '/api/admin/rich-menu/list') {
    if (!requireAdminAuth(req, res)) return;
    try {
      var rmList = await _richMenuMgr.listMenus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rmList));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // DELETE /api/admin/rich-menu/:menuId
  if (method === 'DELETE' && url.indexOf('/api/admin/rich-menu/') === 0) {
    if (!requireAdminAuth(req, res)) return;
    try {
      var rmDelId = url.replace('/api/admin/rich-menu/', '').split('?')[0];
      if (!rmDelId) { res.writeHead(400); res.end(JSON.stringify({ error: 'menuId required' })); return; }
      await _richMenuMgr.deleteMenu(rmDelId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, deleted: rmDelId }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // POST /api/admin/rich-menu/link  body: { userId, richMenuId? }
  if (method === 'POST' && url === '/api/admin/rich-menu/link') {
    if (!requireAdminAuth(req, res)) return;
    try {
      var rmLinkBody = JSON.parse(await readBody(req));
      var rmLinkUid = rmLinkBody.userId;
      var rmLinkMid = rmLinkBody.richMenuId || _defaultRichMenuId;
      if (!rmLinkUid) { res.writeHead(400); res.end(JSON.stringify({ error: 'userId required' })); return; }
      await _richMenuMgr.linkToUser(rmLinkUid, rmLinkMid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, userId: rmLinkUid, richMenuId: rmLinkMid }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // Quotation spec view — returns the full saved spec JSON — sobek: admin only
  if (method === 'GET' && url.indexOf('/api/qt-view/') === 0) {
    if (!requireAdminAuth(req, res)) return;
    try {
      var qvFn = decodeURIComponent(url.replace('/api/qt-view/', ''));
      qvFn = path.basename(qvFn);
      if (!qvFn || qvFn.indexOf('..') >= 0 || !/^qt-[a-zA-Z0-9]+-\d+\.json$/.test(qvFn)) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'Bad filename' })); return;
      }
      var qvFp = path.join(BOM_DIR, qvFn);
      var qvResolved = path.resolve(qvFp);
      var qvBomResolved = path.resolve(BOM_DIR);
      if (!qvResolved.startsWith(qvBomResolved + path.sep) && !qvResolved.startsWith(qvBomResolved + '/')) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'Bad path' })); return;
      }
      if (!fs.existsSync(qvFp)) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(qvFp, 'utf8'));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // BOM HTML view (for PDF printing) — sobek: admin only
  if (method === 'GET' && url.indexOf('/api/bom-view/') === 0) {
    if (!requireAdminAuth(req, res)) return;
    var fn = decodeURIComponent(url.replace('/api/bom-view/', ''));
    // SECURITY: strip to basename only — prevents path traversal via encoded slashes or `..`
    fn = path.basename(fn);
    if (!fn || fn.indexOf('..') >= 0) { res.writeHead(400); res.end('Bad'); return; }
    // SECURITY: only allow .html and .json extensions
    if (!/\.(html|json)$/.test(fn)) { res.writeHead(400); res.end('Bad'); return; }
    // Check boms dir first, then tmp
    var fp = path.join(BOM_DIR, fn);
    // SECURITY: verify resolved path stays within allowed directories
    var resolvedFp = path.resolve(fp);
    var resolvedBomDir = path.resolve(BOM_DIR);
    var resolvedTmpDir = path.resolve(TMP_DIR);
    if (!resolvedFp.startsWith(resolvedBomDir + path.sep) && !resolvedFp.startsWith(resolvedBomDir + '/')) {
      fp = path.join(TMP_DIR, fn);
      resolvedFp = path.resolve(fp);
      if (!resolvedFp.startsWith(resolvedTmpDir + path.sep) && !resolvedFp.startsWith(resolvedTmpDir + '/')) {
        res.writeHead(400); res.end('Bad'); return;
      }
    }
    if (!fs.existsSync(fp)) fp = path.join(TMP_DIR, fn);
    // If .html file exists, serve directly
    if (fs.existsSync(fp) && fn.endsWith('.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(fp, 'utf8'));
      return;
    }
    // Fallback: try .json version and generate HTML on the fly
    var jsonFp = fp.replace(/\.html$/, '.json');
    if (!fn.endsWith('.html')) jsonFp = fp;
    if (!fs.existsSync(jsonFp)) {
      // Also check boms dir for .json
      jsonFp = path.join(BOM_DIR, fn.replace(/\.html$/, '.json'));
      if (!fs.existsSync(jsonFp)) jsonFp = path.join(TMP_DIR, fn.replace(/\.html$/, '.json'));
    }
    if (!fs.existsSync(jsonFp)) { res.writeHead(404); res.end('Not found'); return; }
    try {
      var bomData = JSON.parse(fs.readFileSync(jsonFp, 'utf8'));
      var html = generateBomHtml(bomData);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) { res.writeHead(500); res.end('Error: ' + e.message); }
    return;
  }

  // BOM download
  if (method === 'GET' && url.indexOf('/api/bom/') === 0) {
    var _bomUrlObj = new URL(url, 'http://localhost');
    var fn = decodeURIComponent(_bomUrlObj.pathname.replace('/api/bom/', ''));
    // SECURITY: strip to basename only — prevents path traversal via encoded slashes or `..`
    fn = path.basename(fn);
    if (!fn || fn.indexOf('..') >= 0) { res.writeHead(400); res.end('Bad'); return; }
    // SECURITY: only allow .pdf and .json extensions on this endpoint
    if (!/\.(pdf|json)$/.test(fn)) { res.writeHead(400); res.end('Bad'); return; }
    // sobek K1: verify signed URL — only enforce for .pdf files
    if (fn.endsWith('.pdf') && SIGNED_URL_SECRET) {
      var _exp = _bomUrlObj.searchParams.get('exp') || '';
      var _sig = _bomUrlObj.searchParams.get('sig') || '';
      if (!verifySignedPdfUrl(fn, _exp, _sig)) {
        auditLog('pdf_url_rejected', '', fn + ' exp=' + _exp);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Link expired or invalid' }));
        return;
      }
    }
    var fp = path.join(BOM_DIR, fn);
    // SECURITY: verify resolved path stays within allowed directories
    var resolvedFp2 = path.resolve(fp);
    var resolvedBomDir2 = path.resolve(BOM_DIR);
    var resolvedTmpDir2 = path.resolve(TMP_DIR);
    if (!resolvedFp2.startsWith(resolvedBomDir2 + path.sep) && !resolvedFp2.startsWith(resolvedBomDir2 + '/')) {
      fp = path.join(TMP_DIR, fn);
      resolvedFp2 = path.resolve(fp);
      if (!resolvedFp2.startsWith(resolvedTmpDir2 + path.sep) && !resolvedFp2.startsWith(resolvedTmpDir2 + '/')) {
        res.writeHead(400); res.end('Bad'); return;
      }
    }
    if (!fs.existsSync(fp)) fp = path.join(TMP_DIR, fn);
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('Not found'); return; }
    var d = fs.readFileSync(fp);
    // SECURITY: sanitise filename in Content-Disposition to strip any path separators.
    // RFC 5987: \w in JS = [A-Za-z0-9_] only — strips Thai/UTF-8 to '_'. Use filename*=UTF-8''<encoded>
    // for modern clients (Chrome/Firefox/Safari/LINE) so Thai chars render; ASCII filename= is fallback.
    var rawFn = path.basename(fn);
    var asciiFn = rawFn.replace(/[^\w\-.]/g, '_');
    var encFn = encodeURIComponent(rawFn);
    res.writeHead(200, {
      'Content-Type': fn.endsWith('.pdf') ? 'application/pdf' : 'application/json',
      'Content-Disposition': 'attachment; filename="' + asciiFn + '"; filename*=UTF-8\'\'' + encFn
    });
    res.end(d);
    return;
  }

  // ── Build probe: cheap endpoint to confirm Passenger picked up the latest code ──
  if (method === 'GET' && (url === '/__build' || url === '/__build/')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ build: BUILD_MARKER, started_at: new Date().toISOString() }));
    return;
  }

  // ── Static files from public/ ──
  var PUBLIC_DIR = path.join(__dirname, 'public');
  var MIME_TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

  // Serve index.html for root
  if (method === 'GET' && (url === '/' || url === '/index.html')) {
    var idxPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(idxPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(idxPath, 'utf8'));
      return;
    }
  }

  // Serve other static files
  if (method === 'GET') {
    var safePath = url.split('?')[0];
    if (safePath.indexOf('..') < 0) {
      var staticPath = path.join(PUBLIC_DIR, safePath);
      if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
        var ext = path.extname(staticPath).toLowerCase();
        var mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime + (ext === '.html' || ext === '.css' || ext === '.js' || ext === '.json' || ext === '.svg' ? '; charset=utf-8' : '') });
        res.end(fs.readFileSync(staticPath));
        return;
      }
    }
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"error":"Not found"}');
});

var port = (typeof PhusionPassenger !== 'undefined') ? 'passenger' : (process.env.PORT || 3000);
if (!process.env.NASRI_NO_LISTEN) {
  server.listen(port, function() {
    console.log('🏠 Nasri LINE Bot listening on ' + port + ' [build=' + BUILD_MARKER + ']');
  });
}


// ─── Monthly Archive ─────────────────────────────────────────
function archiveOldBoms() {
  try {
    var index = loadBomIndex();
    if (!index.boms.length) return;

    var now = new Date();
    var currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    // Group BOMs by month
    var byMonth = {};
    index.boms.forEach(function(b) {
      var d = (b.created || '').slice(0, 7); // "2026-03"
      if (d && d < currentMonth) {
        if (!byMonth[d]) byMonth[d] = [];
        byMonth[d].push(b);
      }
    });

    if (!Object.keys(byMonth).length) return;

    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    var child_process = require('child_process');

    Object.keys(byMonth).forEach(function(month) {
      var zipName = 'bom-archive-' + month + '.zip';
      var zipPath = path.join(ARCHIVE_DIR, zipName);
      if (fs.existsSync(zipPath)) return; // Already archived

      var files = [];
      byMonth[month].forEach(function(b) {
        var jsonPath = path.join(BOM_DIR, b.filename);
        var htmlPath = path.join(BOM_DIR, b.filename.replace('.json', '.html'));
        if (fs.existsSync(jsonPath)) files.push(b.filename);
        if (fs.existsSync(htmlPath)) files.push(b.filename.replace('.json', '.html'));
      });

      if (!files.length) return;

      try {
        // SECURITY: use execFile (not execSync with shell) to avoid shell injection.
        // Pass BOM_DIR as cwd and filenames as individual argv elements.
        // Validate each filename is a plain basename before passing.
        var safeFiles = files.filter(function(f) {
          return path.basename(f) === f && !/[^\w\-.]/.test(f);
        });
        if (!safeFiles.length) { console.warn('[archive] No safe files for zip'); return; }
        child_process.execFileSync('zip', ['-j', zipPath].concat(safeFiles), { cwd: BOM_DIR, timeout: 30000 });
        console.log('[archive] Created: ' + zipName + ' (' + safeFiles.length + ' files)');
      } catch (e) {
        // Fallback: copy files to archive folder
        console.log('[archive] zip not available, moving files to archive/' + month + '/');
        var monthDir = path.join(ARCHIVE_DIR, month);
        fs.mkdirSync(monthDir, { recursive: true });
        files.forEach(function(f) {
          var src = path.join(BOM_DIR, f);
          var dst = path.join(monthDir, f);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dst);
          }
        });
        console.log('[archive] Moved ' + files.length + ' files to archive/' + month + '/');
      }
    });
  } catch (e) { console.error('[archive]', e.message); }
}

// Run archive check on startup and every 24 hours
archiveOldBoms();
var _archiveTimer = setInterval(archiveOldBoms, 24 * 60 * 60 * 1000);
if (_archiveTimer.unref) _archiveTimer.unref();

// Cleanup expired sessions
var _sessionTimer = setInterval(function() {
  var now = Date.now();
  sessions.forEach(function(s, k) { if (now - s.up > TIMEOUT) sessions.delete(k); });
}, 5 * 60 * 1000);
if (_sessionTimer.unref) _sessionTimer.unref();

