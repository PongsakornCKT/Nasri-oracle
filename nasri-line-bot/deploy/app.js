/**
 * Nasri LINE OA Bot — Node.js + Phusion Passenger (Plesk)
 * CommonJS, zero dependencies, Passenger-compatible.
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
const API = 'https://api.line.me/v2/bot';

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
        { type: 'text', text: '• "nasri สร้าง BOM" — สร้างใบ BOM', margin: 'sm', size: 'sm', wrap: true },
        { type: 'text', text: '• "nasri ค้นหา [คำค้น]" — ค้นหา BOM', margin: 'sm', size: 'sm', wrap: true },
        { type: 'text', text: '• "nasri ช่วย" — เมนูช่วยเหลือ', margin: 'sm', size: 'sm', wrap: true },
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
        { type: 'text', text: 'พิมพ์: ชื่อ, ผู้ผลิต, จำนวน, ราคา', size: 'sm', weight: 'bold', wrap: true },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'เช่น: Solar Panel, Trina, 220, 2423', margin: 'md', size: 'xs', color: '#888888', wrap: true },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: '"เสร็จ" → สรุป / "ลบ" → ลบล่าสุด / "ยกเลิก" → ยกเลิก', margin: 'md', size: 'xs', wrap: true },
      ], paddingAll: '12px' },
    },
  };
}

// ─── BOM Session ──────────────────────────────────────────────
const sessions = new Map();
const TIMEOUT = 30 * 60 * 1000;

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
  if (/inverter|อินเวอร์เตอร์/.test(l)) return 'อินเวอร์เตอร์';
  if (/cable|สาย|wire/.test(l)) return 'cable';
  if (/isolat/.test(l)) return 'isolator';
  return 'general';
}

function parseItem(text) {
  const sep = text.includes('/') ? '/' : ',';
  const p = text.split(sep).map(function(s) { return s.trim(); });
  if (p.length >= 3) {
    const nm = p[0], mfr = p.length >= 4 ? p[1] : '';
    const q = parseFloat((p.length >= 4 ? p[2] : p[1]).replace(/[,฿บาท\s]/g, ''));
    const c = parseFloat((p.length >= 4 ? p[3] : p[2]).replace(/[,฿บาท\s]/g, ''));
    if (q > 0 && c >= 0) return { part_number: '', part_name: nm, manufacturer: mfr, category: guessCat(nm), quantity: q, unit_cost: c, total_cost: q * c, notes: '' };
  }
  return null;
}

function summary(d) {
  var tc = 0, tq = 0;
  d.items.forEach(function(i) { tc += i.total_cost; tq += i.quantity; });
  var t = '📋 สรุป BOM\n━━━━━━━━━━━━━━━\nโปรเจกต์: ' + d.project_name + '\nที่อยู่: ' + d.project_address + '\nวันที่: ' + d.order_date + '\n━━━━━━━━━━━━━━━\n';
  d.items.forEach(function(it, i) { t += (i+1) + '. ' + it.part_name + (it.manufacturer ? ' (' + it.manufacturer + ')' : '') + '\n   ' + it.quantity + ' x ฿' + it.unit_cost.toLocaleString() + ' = ฿' + it.total_cost.toLocaleString() + '\n'; });
  t += '━━━━━━━━━━━━━━━\nรวม: ' + tq + ' รายการ • ฿' + tc.toLocaleString() + '\n';
  return t;
}

// ─── BOM Flow ─────────────────────────────────────────────────
async function startBom(ev) {
  const k = sKey(ev.source);
  const ex = getSess(k);
  if (ex && ex.step !== 'gen') { await rText(ev.replyToken, 'มี BOM ค้างอยู่ครับ\nพิมพ์ "ยกเลิก" เพื่อเริ่มใหม่'); return; }
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
    if (lo === 'เสร็จ' || lo === 'done') {
      if (!s.data.items.length) { await rText(rt, 'เพิ่มอย่างน้อย 1 รายการครับ'); return true; }
      s.step = 'confirm'; await rText(rt, summary(s.data) + '\nพิมพ์ "ยืนยัน" หรือ "แก้ไข"'); return true;
    }
    if (lo === 'ลบ' || lo === 'undo') { var rm = s.data.items.pop(); await rText(rt, rm ? 'ลบ "' + rm.part_name + '" (เหลือ ' + s.data.items.length + ')' : 'ไม่มีรายการให้ลบ'); return true; }
    var it = parseItem(text);
    if (it) { s.data.items.push(it); await rText(rt, '✓ ' + it.part_name + ' x' + it.quantity + ' = ฿' + it.total_cost.toLocaleString() + ' (รวม ' + s.data.items.length + ')\n\nเพิ่มอีก หรือ "เสร็จ"'); return true; }
    await rText(rt, 'ลอง: Solar Panel, Trina, 220, 2423'); return true;
  }
  if (s.step === 'confirm') {
    if (lo === 'ยืนยัน' || lo === 'confirm' || lo === 'ok') {
      s.step = 'gen'; await rText(rt, 'บันทึก BOM... 📄');
      saveBom(k, s.data, ev.source).catch(function(e) { console.error('[bom]', e); }); return true;
    }
    if (lo === 'แก้ไข' || lo === 'edit') { s.step = 'items'; await rText(rt, 'แก้ไขได้เลย (' + s.data.items.length + ' รายการ)'); return true; }
    await rText(rt, '"ยืนยัน" หรือ "แก้ไข" ครับ'); return true;
  }
  return false;
}

async function saveBom(k, data, src) {
  var to = src.type === 'group' ? src.groupId : src.userId;
  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    var slug = data.project_name.replace(/[^a-zA-Z0-9\u0E01-\u0E4F]/g, '-').replace(/-+/g, '-').slice(0, 40);
    var fn = 'bom-' + slug + '-' + Date.now() + '.json';
    fs.writeFileSync(path.join(TMP_DIR, fn), JSON.stringify(data, null, 2), 'utf8');
    var tc = 0; data.items.forEach(function(i) { tc += i.total_cost; });
    await lPush(to, [{ type: 'text', text: '✅ BOM บันทึกแล้ว!\n\n📄 ' + data.project_name + '\n📦 ' + data.items.length + ' รายการ\n💰 ฿' + tc.toLocaleString() + '\n\n📥 https://ai.enervia.co.th/api/bom/' + encodeURIComponent(fn) }]);
  } catch (e) { await lPush(to, [{ type: 'text', text: '❌ Error: ' + e.message }]); }
  sessions.delete(k);
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
  var isN = lo.indexOf('nasri') >= 0;
  if (!isN) { await bomMsg(ev); return; }
  console.log('[nasri] ' + sKey(ev.source) + ': ' + text);
  if ((lo.indexOf('สร้าง') >= 0 || lo.indexOf('create') >= 0) && lo.indexOf('bom') >= 0) { await startBom(ev); return; }
  if (lo.indexOf('ค้นหา') >= 0 || lo.indexOf('search') >= 0) { await rText(rt, 'กำลังพัฒนาครับ...'); return; }
  await lReply(rt, [menuFlex()]);
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

  // BOM download
  if (method === 'GET' && url.indexOf('/api/bom/') === 0) {
    var fn = decodeURIComponent(url.replace('/api/bom/', ''));
    if (!fn || fn.indexOf('..') >= 0) { res.writeHead(400); res.end('Bad'); return; }
    var fp = path.join(TMP_DIR, fn);
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('Not found'); return; }
    var d = fs.readFileSync(fp);
    res.writeHead(200, { 'Content-Type': fn.endsWith('.pdf') ? 'application/pdf' : 'application/json', 'Content-Disposition': 'attachment; filename="' + fn + '"' });
    res.end(d);
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"error":"Not found"}');
});

// Passenger integration
var port = (typeof PhusionPassenger !== 'undefined') ? 'passenger' : (process.env.PORT || 3000);
server.listen(port, function() {
  console.log('🏠 Nasri LINE Bot listening on ' + port);
});

// Cleanup
setInterval(function() {
  var now = Date.now();
  sessions.forEach(function(s, k) { if (now - s.up > TIMEOUT) sessions.delete(k); });
}, 5 * 60 * 1000);
