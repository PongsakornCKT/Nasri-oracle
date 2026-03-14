/**
 * Nasri LINE OA Bot — Node.js + Phusion Passenger (Plesk)
 * CommonJS, zero dependencies, Passenger-compatible.
 *
 * Triggers: "นัด" / "nasri" / "ไอ่นัด" → Nasri wakes up
 * BOM: "bom" / "ขอbom" / "solar" → auto-build from catalog (Google Sheets)
 * PDF: "pdf" / "ขอpdf" / "สร้างpdf" / "file pdf" → generate PDF from last BOM
 *
 * Smart parsing: "atmoce 5kw 1phase แผง JA625 + batt + backup"
 *   → auto-lookup catalog, calculate quantities, build BOM
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
const BOM_INDEX = path.join(BOM_DIR, 'bom-index.json');
const ARCHIVE_DIR = path.join(BOM_DIR, 'archive');
const API = 'https://api.line.me/v2/bot';

// ─── BOM Persistence ─────────────────────────────────────────
function loadBomIndex() {
  try {
    fs.mkdirSync(BOM_DIR, { recursive: true });
    if (fs.existsSync(BOM_INDEX)) {
      return JSON.parse(fs.readFileSync(BOM_INDEX, 'utf8'));
    }
  } catch (e) { console.error('[index] Load error:', e.message); }
  return { boms: [] };
}

function saveBomIndex(index) {
  try {
    fs.mkdirSync(BOM_DIR, { recursive: true });
    fs.writeFileSync(BOM_INDEX, JSON.stringify(index, null, 2), 'utf8');
  } catch (e) { console.error('[index] Save error:', e.message); }
}

function searchBoms(query) {
  var index = loadBomIndex();
  var q = query.toLowerCase();
  return index.boms.filter(function(b) {
    return (b.project_name || '').toLowerCase().indexOf(q) >= 0
      || (b.customer_name || '').toLowerCase().indexOf(q) >= 0
      || (b.filename || '').toLowerCase().indexOf(q) >= 0;
  }).sort(function(a, b) {
    return new Date(b.updated || b.created) - new Date(a.updated || a.created);
  });
}

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
const SHEET_ID = '1ubrfga3m0uiOf68MGQRApAdnhU8oby6nYKtfzirpn9Y';
const SHEET_GIDS = {
  'Solar Panels': 1094845924, 'Inverters - Huawei': 1605263729,
  'Inverters - Solis': 984571681, 'Inverters - Deye': 1499264869,
  'Inverters - ATMOCE': 1829589831, 'Inverters - Sigenergy': 524887216,
  'Inverters - Hoymiles': 447913208, 'Inverters - Enphase': 1146681998,
  'Batteries': 1623780871, 'Cables': 1682681584,
  'Mounting - Keenoc': 1345585929, 'Optimizers': 1835933691,
  'Combiner Box & Others': 113577748, 'Labor & Fees': 1264003568,
};
var catalogCache = { data: null, ts: 0 };
var CATALOG_TTL = 30000;

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

async function fetchSheet(gid) {
  var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&gid=' + gid;
  try {
    var r = await fetch(url, { headers: { 'User-Agent': 'NasriBot/1.0' } });
    if (!r.ok) return [];
    return parseCSV(await r.text());
  } catch (e) { console.error('[sheet]', gid, e.message); return []; }
}

async function getCatalog() {
  if (catalogCache.data && Date.now() - catalogCache.ts < CATALOG_TTL) return catalogCache.data;
  var catalog = {};
  var names = Object.keys(SHEET_GIDS);
  var results = await Promise.all(names.map(function(n) { return fetchSheet(SHEET_GIDS[n]); }));
  names.forEach(function(n, i) { catalog[n] = results[i]; });
  catalogCache = { data: catalog, ts: Date.now() };
  console.log('[catalog] Refreshed: ' + Object.keys(catalog).map(function(k) { return k + '(' + catalog[k].length + ')'; }).join(', '));
  return catalog;
}

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

// ─── LINE helpers ─────────────────────────────────────────────
function lHeaders() {
  if (!LINE_TOKEN) return null;
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LINE_TOKEN };
}

async function lReply(rt, msgs) {
  const h = lHeaders();
  if (!h) { console.log('[dev reply]', JSON.stringify(msgs.map(m => m.text || m.type))); return; }
  const r = await fetch(API + '/message/reply', { method: 'POST', headers: h, body: JSON.stringify({ replyToken: rt, messages: msgs }) });
  if (!r.ok) console.error('[LINE reply]', r.status, await r.text());
}

async function lPush(to, msgs) {
  const h = lHeaders();
  if (!h) { console.log('[dev push]', to); return; }
  const r = await fetch(API + '/message/push', { method: 'POST', headers: h, body: JSON.stringify({ to: to, messages: msgs }) });
  if (!r.ok) console.error('[LINE push]', r.status, await r.text());
}

function rText(rt, t) { return lReply(rt, [{ type: 'text', text: t }]); }

// ─── Catalog Price Search ─────────────────────────────────────
function isPriceQuestion(text) {
  return /ราคา|price|cost|เท่าไหร่|เท่าไร|กี่บาท|บาท|฿|ค่า/.test(text);
}

// Stop words to ignore when extracting product keywords
var PRICE_STOP_WORDS = ['nasri','นัด','ไอ่นัด','ราคา','price','cost','เท่าไหร่','เท่าไร','กี่บาท','บาท','ค่า','แผง','อยาก','ได้','ให้','หน่อย','ครับ','ค่ะ','นะ','รุ่น','คือ','มี','ขอ','ดู','อะ'];

async function priceSearch(text) {
  try {
    var catalog = await getCatalog();
    var words = text.toLowerCase().split(/\s+/).filter(function(w) {
      return w.length > 1 && PRICE_STOP_WORDS.indexOf(w) < 0;
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
      max_tokens: 500,
      system: 'คุณคือ Nasri ผู้ช่วยส่วนตัวของ Enervia Group ผู้เชี่ยวชาญด้านพลังงานโซลาร์เซลล์ ตอบเป็นภาษาไทยสั้นกระชับ ตรงประเด็น ไม่เกิน 3-4 ประโยค เว้นแต่จำเป็นต้องอธิบายมากกว่านั้น ถ้ามีข้อมูลราคาจาก catalog ให้ใช้ราคาจริงนั้นในการตอบ',
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

// ─── Flex Messages ────────────────────────────────────────────
function menuFlex() {
  return {
    type: 'flex', altText: 'Nasri Butler',
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🏠 Nasri Butler', weight: 'bold', size: 'lg', color: '#1a1a2e' }], backgroundColor: '#f0e68c', paddingAll: '16px' },
      body: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: 'สวัสดีครับ ผม Nasri ยินดีให้บริการครับ', wrap: true, size: 'sm' },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'สั่งงานได้เลยครับ:', margin: 'md', size: 'sm', weight: 'bold' },
        { type: 'text', text: '• "นัด ขอ bom" — สร้าง BOM', margin: 'sm', size: 'sm', wrap: true },
        { type: 'text', text: '• "นัด atmoce 5kw 1phase แผง JA625" — BOM อัตโนมัติ', margin: 'sm', size: 'sm', wrap: true },
        { type: 'text', text: '• "ขอ pdf" / "สร้าง pdf" — สร้าง PDF', margin: 'sm', size: 'sm', wrap: true },
        { type: 'text', text: '• "นัด ช่วย" — เมนูนี้', margin: 'sm', size: 'sm', wrap: true },
      ], paddingAll: '16px' },
      footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'Enervia Group • Powered by Oracle', size: 'xxs', color: '#888888', align: 'center' }], paddingAll: '8px' },
    },
  };
}

function addItemFlex() {
  return {
    type: 'flex', altText: 'เพิ่มรายการ BOM',
    contents: {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '📦 เพิ่มรายการ BOM', weight: 'bold', size: 'md', color: '#1a1a2e' }], backgroundColor: '#f0e68c', paddingAll: '12px' },
      body: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: 'พิมพ์ระบบที่ต้องการ เช่น:', size: 'sm', weight: 'bold', wrap: true },
        { type: 'text', text: '• atmoce 5kw 1phase แผง JA625 + batt + backup', margin: 'sm', size: 'xs', color: '#888888', wrap: true },
        { type: 'text', text: '• huawei 10kw 3phase', margin: 'sm', size: 'xs', color: '#888888', wrap: true },
        { type: 'text', text: '• solis 10kw แผง aiko', margin: 'sm', size: 'xs', color: '#888888', wrap: true },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'หรือเพิ่มทีละรายการ:', margin: 'md', size: 'sm', weight: 'bold', wrap: true },
        { type: 'text', text: '• Solar Panel, Trina, 220, 2423', margin: 'sm', size: 'xs', color: '#888888', wrap: true },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: '"เสร็จ" → สรุป / "ลบ" → ลบล่าสุด / "ยกเลิก" → ยกเลิก', margin: 'md', size: 'xs', wrap: true },
      ], paddingAll: '12px' },
    },
  };
}

// ─── BOM Session ──────────────────────────────────────────────
const sessions = new Map();
const TIMEOUT = 30 * 60 * 1000;
const lastBom = new Map();

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
  if (/batt|แบต/i.test(l)) return 'battery';
  if (/cable|สาย|wire/i.test(l)) return 'cable';
  if (/mount|clamp|rail|ราง/i.test(l)) return 'mounting';
  if (/backup|combiner/i.test(l)) return 'general';
  if (/charger|ev/i.test(l)) return 'EV charger';
  return 'general';
}

// ─── Smart System Spec Parser ────────────────────────────────
// Parses natural language like "atmoce 5kw 1phase แผง JA625 + batt + backup"
// into BOM items from the Google Sheets catalog

async function parseSystemSpec(text) {
  var catalog = await getCatalog();
  if (!catalog) return [];
  var lo = text.toLowerCase();
  var items = [];

  // Detect phase
  var phase = '1P';
  if (/3\s*(?:phase|เฟส|p\b)/i.test(text)) phase = '3P';

  // Detect system size (kW)
  var kwMatch = lo.match(/(\d+)\s*kw/);
  var systemKw = kwMatch ? parseInt(kwMatch[1]) : 5; // default 5kW

  // Detect inverter brand
  var invBrand = '';
  if (/atmoce/i.test(lo)) invBrand = 'ATMOCE';
  else if (/huawei/i.test(lo)) invBrand = 'Huawei';
  else if (/sol[io]s/i.test(lo)) invBrand = 'Solis';
  else if (/deye/i.test(lo)) invBrand = 'Deye';
  else if (/sig(?:energy)?/i.test(lo)) invBrand = 'Sigenergy';
  else if (/hoymiles/i.test(lo)) invBrand = 'Hoymiles';
  else if (/enphase/i.test(lo)) invBrand = 'Enphase';

  // Detect panel brand + watts
  var panelBrand = '', panelWatts = 0;
  if (/ja\s*(?:solar)?\s*(\d{3})/i.test(lo)) { panelBrand = 'JA Solar'; panelWatts = parseInt(RegExp.$1); }
  else if (/ja\s*(?:solar)?/i.test(lo) && !invBrand.match(/ja/i)) { panelBrand = 'JA Solar'; panelWatts = 625; }
  else if (/trina\s*(\d{3})?/i.test(lo)) { panelBrand = 'Trina'; panelWatts = RegExp.$1 ? parseInt(RegExp.$1) : 625; }
  else if (/aiko\s*(\d{3})?/i.test(lo)) { panelBrand = 'AIKO'; panelWatts = RegExp.$1 ? parseInt(RegExp.$1) : 650; }
  else if (/vols/i.test(lo)) { panelBrand = 'VOLS'; panelWatts = 625; }
  else if (/แผง\s*(\d{3})/i.test(lo)) { panelWatts = parseInt(RegExp.$1); }

  // Want battery?
  var wantBatt = /batt|แบต/i.test(lo);
  var battKwh = 0;
  var battMatch = lo.match(/batt(?:ery)?\s*(\d+)/i);
  if (battMatch) battKwh = parseInt(battMatch[1]);

  // Want backup?
  var wantBackup = /backup|สำรอง/i.test(lo);

  // Want DC charger / EV charger?
  var wantEV = /dc\s*charg|ev\s*charg|ชาร์จ/i.test(lo);

  // Detect roof type (default: เมทัลชีท → L-Feet 8cm)
  var roofType = 'metal';
  if (/tile|กระเบื้อง/i.test(lo)) roofType = 'tile';
  else if (/hangerbolt|ลอนคู่/i.test(lo)) roofType = 'hangerbolt';
  else if (/kliplock/i.test(lo)) roofType = 'kliplock';

  // ── Find inverter ──
  if (invBrand) {
    var invSheet = 'Inverters - ' + invBrand;
    var invRows = catalog[invSheet] || [];

    if (invBrand === 'ATMOCE') {
      // Detect C&I: ≥30kW or explicit C&I keyword
      var isCI = systemKw >= 30 || /c&i|c\si|commercial|โรงงาน/i.test(lo);
      var miModel, miName, miKw, miFallbackPrice, miRow, miQty;
      if (isCI) {
        // C&I: MI-1250 (1.25kW each)
        miModel = 'MI-1250';
        miName = 'Micro Inverter MI-1250 (1.25kW)';
        miKw = 1.25;
        miFallbackPrice = 4750;
        miRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MI-1250') >= 0 && Object.values(r).join(' ').toLowerCase().indexOf('warranty') >= 0; });
        if (!miRow) miRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MI-1250') >= 0; });
      } else {
        // Residential default: MI-500 (0.5kW each)
        miModel = 'MI-500';
        miName = 'Micro Inverter MI-500 (0.5kW)';
        miKw = 0.5;
        miFallbackPrice = 4400;
        miRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MI-500') >= 0 && Object.values(r).join(' ').toLowerCase().indexOf('warranty') >= 0; });
        if (!miRow) miRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MI-500') >= 0; });
      }
      miQty = Math.ceil(systemKw / miKw);
      var miPrice = miRow ? extractPrice(miRow) : miFallbackPrice;
      items.push({ part_number: miModel, part_name: miName, manufacturer: 'ATMOCE', category: 'อินเวอร์เตอร์', quantity: miQty, unit_cost: miPrice, total_cost: miQty * miPrice, notes: '' });
      // Combiner box
      var combiner = phase === '3P'
        ? invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MC100T') >= 0; })
        : invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MC100') >= 0 && Object.values(r).join(' ').indexOf('MC100T') < 0 && Object.values(r).join(' ').indexOf('MC100L') < 0 && Object.values(r).join(' ').indexOf('Wye') < 0; });
      if (combiner) {
        var cPrice = extractPrice(combiner);
        var cName = extractField(combiner, ['sku', 'รายการ']) || (phase === '3P' ? 'MC100T' : 'MC100');
        var cDesc = extractField(combiner, ['description', 'คำอธิบาย', 'รายละเอียด']) || 'M-Combiner';
        items.push({ part_number: cName, part_name: cName + ' ' + cDesc, manufacturer: 'ATMOCE', category: 'general', quantity: 1, unit_cost: cPrice, total_cost: cPrice, notes: '' });
      }
      // ATMOCE battery
      if (wantBatt) {
        var abatt = invRows.find(function(r) { return Object.values(r).join(' ').indexOf('MS-7K') >= 0; });
        if (abatt) {
          var abPrice = extractPrice(abatt);
          items.push({ part_number: 'MS-7K-U', part_name: 'M-Battery 7kWh', manufacturer: 'ATMOCE', category: 'battery', quantity: 1, unit_cost: abPrice, total_cost: abPrice, notes: '' });
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
      // String/Hybrid inverters — find closest kW match
      var bestInv = null, bestDiff = 9999;
      invRows.forEach(function(r) {
        var vals = Object.values(r).join(' ').toLowerCase();
        // Check phase match
        if (phase === '1P' && vals.indexOf('3p') >= 0 && vals.indexOf('1p') < 0) return;
        if (phase === '3P' && vals.indexOf('1p') >= 0 && vals.indexOf('3p') < 0) return;
        // Extract kW from first column or size column
        var kwVal = 0;
        var firstKey = Object.keys(r)[0];
        var fv = parseFloat(String(r[firstKey]).replace(/[^\d.]/g, ''));
        if (fv > 0 && fv <= 1000) kwVal = fv;
        if (!kwVal) {
          var m = vals.match(/(\d+)\s*k/);
          if (m) kwVal = parseInt(m[1]);
        }
        if (kwVal > 0) {
          var diff = Math.abs(kwVal - systemKw);
          if (diff < bestDiff) { bestDiff = diff; bestInv = r; }
        }
      });
      if (bestInv) {
        var invPrice = extractPrice(bestInv);
        var invModel = extractField(bestInv, ['รุ่น', 'model', 'sku']) || invBrand + ' ' + systemKw + 'kW';
        var invType = extractField(bestInv, ['ประเภท', 'type']) || '';
        items.push({ part_number: invModel, part_name: invModel + (invType ? ' (' + invType + ')' : ''), manufacturer: invBrand, category: 'อินเวอร์เตอร์', quantity: 1, unit_cost: invPrice, total_cost: invPrice, notes: '' });
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

    // Sigenergy accessories (gateway is MANDATORY)
    if (invBrand === 'Sigenergy') {
      // Gateway: 1P MUST use HomePro SP-F, 3P uses Home TP 30K
      var gwName = phase === '1P' ? 'Gateway HomePro SP-F' : 'Gateway Home TP 30K';
      var gwPrice = phase === '1P' ? 33400 : 15800;
      // Try catalog first
      var gwRow = invRows.find(function(r) {
        var v = Object.values(r).join(' ');
        return phase === '1P' ? v.indexOf('HomePro SP-F') >= 0 : v.indexOf('Home TP 30K') >= 0;
      });
      if (gwRow) gwPrice = extractPrice(gwRow) || gwPrice;
      items.push({ part_number: gwName, part_name: gwName, manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: gwPrice, total_cost: gwPrice, notes: phase === '1P' ? 'บังคับใช้สำหรับ 1 Phase' : '' });

      // Power Sensor
      var sensorName = phase === '1P' ? 'Sensor SP-CT100' : 'Sensor TP-CT100';
      var sensorPrice = phase === '1P' ? 2400 : 4600;
      var sensorRow = invRows.find(function(r) { return Object.values(r).join(' ').indexOf(sensorName) >= 0; });
      if (sensorRow) sensorPrice = extractPrice(sensorRow) || sensorPrice;
      items.push({ part_number: sensorName, part_name: sensorName, manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: sensorPrice, total_cost: sensorPrice, notes: '' });

      // Installation Kit
      items.push({ part_number: 'Installation Kit', part_name: 'Installation Kit (Wall/Ground)', manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: 4600, total_cost: 4600, notes: '' });

      // Emergency Switch
      items.push({ part_number: 'Emergency Switch', part_name: 'Emergency Switch', manufacturer: 'Sigenergy', category: 'general', quantity: 1, unit_cost: 700, total_cost: 700, notes: '' });
    }

    // Sigenergy battery
    if (wantBatt && invBrand === 'Sigenergy') {
      var sigBattRows = invRows.filter(function(r) { return Object.values(r).join(' ').indexOf('BAT') >= 0; });
      var sigBatt = null;
      if (battKwh >= 9) sigBatt = sigBattRows.find(function(r) { return Object.values(r).join(' ').indexOf('BAT 10') >= 0; });
      if (!sigBatt) sigBatt = sigBattRows.find(function(r) { return Object.values(r).join(' ').indexOf('BAT 6') >= 0; });
      if (sigBatt) {
        var sbPrice = extractPrice(sigBatt);
        var sbName = Object.values(sigBatt).join(' ').indexOf('BAT 10') >= 0 ? 'SigenStor BAT 10.0' : 'SigenStor BAT 6.0';
        items.push({ part_number: sbName, part_name: sbName + ' Battery', manufacturer: 'Sigenergy', category: 'battery', quantity: 1, unit_cost: sbPrice, total_cost: sbPrice, notes: '' });
        wantBatt = false;
      }
    }
  }

  // ── Find panels — Sigenergy default: AIKO 650W (not JA Solar 625W) ──
  if (!panelWatts && systemKw) panelWatts = invBrand === 'Sigenergy' ? 650 : 625;
  if (!panelBrand && panelWatts) panelBrand = invBrand === 'Sigenergy' ? 'AIKO' : 'JA Solar';
  var panelQty = panelWatts > 0 ? Math.ceil((systemKw * 1000) / panelWatts) : 8;

  if (panelBrand || panelWatts) {
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

  // ── Find battery (generic) ──
  if (wantBatt) {
    var battRows = catalog['Batteries'] || [];
    var bestBatt = null, bestBDiff = 9999;
    battRows.forEach(function(r) {
      var vals = Object.values(r).join(' ').toLowerCase();
      // Skip section headers
      if (vals.indexOf('dyness') < 0 && vals.indexOf('deye') < 0 && vals.indexOf('eenovance') < 0 && vals.indexOf('sigenergy') < 0 && vals.indexOf('atmoce') < 0 && vals.indexOf('huawei') < 0) return;
      // Match brand if inverter brand matches
      if (invBrand && invBrand !== 'ATMOCE') {
        // Try same brand first
        if (invBrand === 'Sigenergy' && vals.indexOf('sigenergy') < 0) return;
        if (invBrand === 'Deye' && vals.indexOf('deye') < 0) return;
        if (invBrand === 'Huawei' && vals.indexOf('huawei') < 0) return;
      }
      var kwhMatch = vals.match(/([\d.]+)\s*(?:kwh)?/);
      var keys = Object.keys(r);
      for (var bi = 0; bi < keys.length; bi++) {
        if (keys[bi].toLowerCase().indexOf('kwh') >= 0 || keys[bi].toLowerCase().indexOf('ขนาด') >= 0) {
          var bkwh = parseFloat(r[keys[bi]]);
          if (bkwh > 0) {
            var diff = battKwh > 0 ? Math.abs(bkwh - battKwh) : bkwh;
            if (diff < bestBDiff) { bestBDiff = diff; bestBatt = r; }
          }
        }
      }
    });
    if (!bestBatt && battRows.length) {
      // Fallback: first battery with a price
      bestBatt = battRows.find(function(r) { return extractPrice(r) > 0; });
    }
    if (bestBatt) {
      var bPrice = extractPrice(bestBatt);
      var bModel = extractField(bestBatt, ['รุ่น', 'model']) || 'Battery';
      var bBrand = Object.values(bestBatt)[0] || '';
      items.push({ part_number: bModel, part_name: bModel + ' Battery', manufacturer: bBrand, category: 'battery', quantity: 1, unit_cost: bPrice, total_cost: bPrice, notes: '' });
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

  // ── Keenoc mounting ──
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

// ─── Quotation PDF generator (Python subprocess) ─────────────
var QSOLAR_SCRIPT = path.join(__dirname, '..', '..', 'mcp-qsolar', 'server.py');

function isQuotationRequest(lo) {
  return /ใบเสนอราคา|quotation|เสนอราคา|ขอใบเสนอ/.test(lo);
}

function parseQuotationSpec(text) {
  var lo = text.toLowerCase();
  var brand = 'ATMOCE';
  if (/sig(?:energy)?/.test(lo)) brand = 'Sigenergy';
  else if (/huawei/.test(lo)) brand = 'Huawei';
  else if (/sol[io]s/.test(lo)) brand = 'Solis';
  else if (/atmoce/.test(lo)) brand = 'ATMOCE';

  var kwMatch = lo.match(/([\d.]+)\s*kw/);
  var sizeKw = kwMatch ? parseFloat(kwMatch[1]) : 5.0;

  var phase = /3\s*(?:phase|เฟส|p\b)/.test(lo) ? '3P' : '1P';
  var hasBattery = /batt|แบต/.test(lo);
  var hasBackup = /backup|สำรอง/.test(lo);
  if (hasBackup) hasBattery = true;

  return { brand: brand, size_kw: sizeKw, phase: phase, has_battery: hasBattery, has_backup: hasBackup };
}

function generateQuotationPdf(spec, customerName, projectName) {
  return new Promise(function(resolve, reject) {
    var cp = require('child_process');
    var payload = JSON.stringify({
      tool: 'qsolar_from_spec',
      spec: spec,
      customer_name: customerName || 'เสนอราคา',
      project_name: projectName || '',
    });
    var env = Object.assign({}, process.env, {
      ORACLE_REPO_ROOT: path.join(__dirname, '..', '..'),
      PYTHONIOENCODING: 'utf-8',
    });
    cp.execFile('python', [QSOLAR_SCRIPT, payload], { timeout: 60000, env: env },
      function(err, stdout, stderr) {
        if (err) { return reject(new Error(stderr || err.message)); }
        try {
          var result = JSON.parse(stdout.trim().split('\n').pop());
          if (!result.success) return reject(new Error(result.error || 'qsolar failed'));
          resolve(result);
        } catch (e) { reject(new Error('JSON parse error: ' + stdout.slice(0, 200))); }
      }
    );
  });
}

async function startQuotation(ev, text, rt) {
  var spec = parseQuotationSpec(text);
  var specStr = text.replace(/ใบเสนอราคา|quotation|เสนอราคา|ขอใบเสนอ|นัด|nasri|ไอ่นัด/gi, '').trim();
  if (!specStr) specStr = spec.brand + ' ' + spec.size_kw + 'kw ' + spec.phase;

  var statusMsg = '\u{1F4C4} กำลังสร้างใบเสนอราคา...\n' +
    spec.brand + ' ' + spec.size_kw + 'kW ' + spec.phase +
    (spec.has_battery ? ' + Battery' : '') +
    (spec.has_backup ? ' + Backup' : '');

  await rText(rt, statusMsg);

  try {
    var result = await generateQuotationPdf(specStr, 'เสนอราคา', '');
    var pdfFile = path.basename(result.path);
    var pdfUrl = 'https://ai.enervia.co.th/api/bom/' + encodeURIComponent(pdfFile);
    var to = ev.source.type === 'group' ? ev.source.groupId : ev.source.userId;

    var priceText = '\u0e3f' + result.grand_total.toLocaleString();
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
    var to2 = ev.source.type === 'group' ? ev.source.groupId : ev.source.userId;
    await lPush(to2, [{ type: 'text', text: 'ขออภัยครับ สร้างใบเสนอราคาไม่ได้: ' + e.message.slice(0, 100) }]);
  }
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
  const k = sKey(ev.source);
  const ex = getSess(k);
  if (ex && ex.step !== 'done') {
    await rText(ev.replyToken, 'มี BOM ค้างอยู่ครับ (' + (ex.data.project_name || 'ยังไม่ตั้งชื่อ') + ')\nพิมพ์ "ยกเลิก" เพื่อเริ่มใหม่ หรือส่งข้อมูลต่อได้เลยครับ');
    return;
  }
  // Pre-load catalog
  getCatalog().catch(function(e) { console.error('[catalog]', e.message); });

  // If user included a system spec in the same message, auto-build
  if (specText && hasSystemSpec(specText)) {
    var sess = newSess(k);
    sess.step = 'items';
    sess.data.project_name = '(auto)';
    await rText(ev.replyToken, '📊 กำลังค้นหาจาก catalog ครับ...');
    try {
      var autoItems = await parseSystemSpec(specText);
      if (autoItems.length > 0) {
        sess.data.items = autoItems;
        sess.step = 'done';
        saveBom(k, sess.data, ev.source).catch(function(e) { console.error('[bom]', e); });
        var to = ev.source.type === 'group' ? ev.source.groupId : ev.source.userId;
        await lPush(to, [{ type: 'text', text: summary(sess.data) + '\n✅ BOM จาก catalog พร้อมแล้วครับ\n\nพิมพ์ "ขอ pdf" เพื่อสร้าง PDF\n"แก้ไข" เพื่อแก้ไข\n"ชื่อ xxx" เพื่อตั้งชื่อโปรเจกต์' }]);
        return;
      }
    } catch (e) { console.error('[spec]', e); }
    // Fallback if spec parsing failed
    sess.step = 'name';
  }

  newSess(k);
  await rText(ev.replyToken, 'รับครับ เริ่มสร้าง BOM 📋\n\nชื่อโปรเจกต์อะไรครับ?');
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
      await rText(rt, summary(s.data) + '\n✅ บันทึกแล้วครับ\n\nพิมพ์ "ขอ pdf" เมื่อต้องการ PDF\nหรือ "แก้ไข" เพื่อกลับแก้ไข');
      return true;
    }
    if (lo === 'ลบ' || lo === 'undo') { var rm = s.data.items.pop(); await rText(rt, rm ? 'ลบ "' + rm.part_name + '" (เหลือ ' + s.data.items.length + ')' : 'ไม่มีรายการให้ลบ'); return true; }

    // Try smart system spec first
    if (hasSystemSpec(lo)) {
      try {
        var specItems = await parseSystemSpec(text);
        if (specItems.length > 0) {
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

async function saveBom(k, data, src) {
  try {
    fs.mkdirSync(BOM_DIR, { recursive: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    var slug = (data.project_name || 'unnamed').replace(/[^a-zA-Z0-9\u0E01-\u0E4F]/g, '-').replace(/-+/g, '-').slice(0, 40);
    var ts = Date.now();
    var fn = 'bom-' + slug + '-' + ts + '.json';

    // Check if this is an update of existing BOM (same source_key has existing BOM)
    var index = loadBomIndex();
    var existing = null;
    for (var i = 0; i < index.boms.length; i++) {
      if (index.boms[i].source_key === k && index.boms[i].project_name === data.project_name) {
        existing = index.boms[i];
        fn = existing.filename; // overwrite same file
        break;
      }
    }

    // Save JSON to boms dir
    fs.writeFileSync(path.join(BOM_DIR, fn), JSON.stringify(data, null, 2), 'utf8');
    // Also save HTML
    var htmlFn = fn.replace('.json', '.html');
    var html = generateBomHtml(data);
    fs.writeFileSync(path.join(BOM_DIR, htmlFn), html, 'utf8');
    // Also keep copy in tmp for backward compat
    fs.writeFileSync(path.join(TMP_DIR, fn), JSON.stringify(data, null, 2), 'utf8');
    fs.writeFileSync(path.join(TMP_DIR, htmlFn), html, 'utf8');

    // Update index
    var tc = 0;
    data.items.forEach(function(i) { tc += i.total_cost; });
    var now = new Date().toISOString();

    if (existing) {
      existing.updated = now;
      existing.item_count = data.items.length;
      existing.total_cost = tc;
      existing.project_address = data.project_address || '';
    } else {
      index.boms.push({
        filename: fn,
        project_name: data.project_name || '',
        customer_name: data.project_name || '', // Use project name as customer for now
        project_address: data.project_address || '',
        created: now,
        updated: now,
        item_count: data.items.length,
        total_cost: tc,
        source_key: k,
      });
    }
    saveBomIndex(index);

    lastBom.set(k, { filename: fn, data: data });
    console.log('[bom] Saved: ' + fn + (existing ? ' (updated)' : ' (new)'));
  } catch (e) { console.error('[bom] Save error:', e.message); }
}

// ─── Signature ────────────────────────────────────────────────
function verifySig(body, sig) {
  if (!LINE_SECRET) return true;
  if (!sig) return false;
  return crypto.createHmac('SHA256', LINE_SECRET).update(body).digest('base64') === sig;
}

// ─── Message handler ──────────────────────────────────────────
async function handleText(ev) {
  var text = (ev.message && ev.message.text) ? ev.message.text.trim() : '';
  var lo = text.toLowerCase(), rt = ev.replyToken;
  if (!rt) return;

  var k = sKey(ev.source);

  // ── PDF request (works anytime, no trigger needed) ──
  if (isPdfRequest(lo)) {
    // If there's a saved BOM, generate PDF
    var saved = lastBom.get(k);
    // Lazy-load data from file if not in memory
    if (saved && !saved.data) {
      saved.data = loadBomData(saved.filename);
      if (!saved.data) { lastBom.delete(k); saved = null; }
    }
    if (saved) {
      var tc = 0; saved.data.items.forEach(function(i) { tc += i.total_cost; });
      var viewUrl = 'https://ai.enervia.co.th/api/bom-view/' + encodeURIComponent(saved.filename.replace('.json', '.html'));
      // Send text summary first, then PDF flex
      var to = ev.source.type === 'group' ? ev.source.groupId : ev.source.userId;
      await lPush(to, [{ type: 'text', text: summary(saved.data) }]);
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
            { type: 'button', action: { type: 'uri', label: '\ud83d\udcc4 \u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14 PDF', uri: viewUrl }, style: 'primary', color: '#1a237e' },
          ], paddingAll: '12px' },
        },
      }]);
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

  // ── Active BOM session ──
  var handled = await bomMsg(ev);
  if (handled) return;

  // ── Check Nasri trigger ──
  if (!isNasriTrigger(lo)) return;

  console.log('[nasri] ' + k + ': ' + text);

  // Help / menu
  if (lo.indexOf('ช่วย') >= 0 || lo.indexOf('help') >= 0 || lo.indexOf('เมนู') >= 0) {
    await lReply(rt, [menuFlex()]); return;
  }

  // ── Quotation request ──
  if (isQuotationRequest(lo)) {
    await startQuotation(ev, text, rt);
    return;
  }

  // BOM request or system spec in same message
  if (isBomRequest(lo) || hasSystemSpec(lo)) {
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
  // General question → Claude API (uses token)
  console.log('[nasri] Calling Claude for:', text.slice(0, 80));
  var claudeReply = await askClaude(text, '');
  await rText(rt, claudeReply);
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
    res.end(JSON.stringify({ status: 'ok', service: 'nasri-line-bot', ts: new Date().toISOString(), line: LINE_SECRET ? 'connected' : 'not configured' }));
    return;
  }

  // Webhook
  if (method === 'POST' && url === '/webhook') {
    var body = await readBody(req);
    if (!verifySig(body, req.headers['x-line-signature'])) { res.writeHead(401); res.end('Unauthorized'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    try {
      var data = JSON.parse(body);
      var events = data.events || [];
      for (var i = 0; i < events.length; i++) {
        if (events[i].type === 'message' && events[i].message && events[i].message.type === 'text') {
          await handleText(events[i]).catch(function(e) { console.error('[ev]', e); });
        }
      }
    } catch (e) { console.error('[parse]', e); }
    return;
  }

  // Catalog search API
  if (method === 'GET' && url.indexOf('/api/catalog') === 0) {
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

  // BOM list API
  if (method === 'GET' && (url === '/api/bom-list' || url.indexOf('/api/bom-list?') === 0)) {
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

  // BOM HTML view (for PDF printing)
  if (method === 'GET' && url.indexOf('/api/bom-view/') === 0) {
    var fn = decodeURIComponent(url.replace('/api/bom-view/', ''));
    if (!fn || fn.indexOf('..') >= 0) { res.writeHead(400); res.end('Bad'); return; }
    // Check boms dir first, then tmp
    var fp = path.join(BOM_DIR, fn);
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
    var fn = decodeURIComponent(url.replace('/api/bom/', ''));
    if (!fn || fn.indexOf('..') >= 0) { res.writeHead(400); res.end('Bad'); return; }
    var fp = path.join(BOM_DIR, fn);
    if (!fs.existsSync(fp)) fp = path.join(TMP_DIR, fn);
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('Not found'); return; }
    var d = fs.readFileSync(fp);
    res.writeHead(200, { 'Content-Type': fn.endsWith('.pdf') ? 'application/pdf' : 'application/json', 'Content-Disposition': 'attachment; filename="' + fn + '"' });
    res.end(d);
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
server.listen(port, function() {
  console.log('🏠 Nasri LINE Bot listening on ' + port);
});

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
        // Try system zip command
        var cmd = 'cd "' + BOM_DIR + '" && zip -j "' + zipPath + '" ' + files.map(function(f) { return '"' + f + '"'; }).join(' ');
        child_process.execSync(cmd, { timeout: 30000 });
        console.log('[archive] Created: ' + zipName + ' (' + files.length + ' files)');
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
setInterval(archiveOldBoms, 24 * 60 * 60 * 1000);

// Cleanup expired sessions
setInterval(function() {
  var now = Date.now();
  sessions.forEach(function(s, k) { if (now - s.up > TIMEOUT) sessions.delete(k); });
}, 5 * 60 * 1000);
