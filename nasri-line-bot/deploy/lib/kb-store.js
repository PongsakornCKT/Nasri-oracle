'use strict';

// Read-only KB snapshot access. The handle is deliberately process-local and
// reopened when PR-2 replaces the snapshot file.
var fs = require('fs');
var Database;
try {
  Database = require('better-sqlite3');
} catch (e1) {
  try {
    Database = require('bun:sqlite').Database;
  } catch (e2) {
    try {
      var nodeSqlite = require('node:sqlite');
      Database = nodeSqlite.DatabaseSync;
    } catch (e3) {
      Database = null;
    }
  }
}
var normalizeThaiInput = require('./thai-normalize').normalizeThaiInput;

var cached = { path: '', mtimeMs: 0, db: null };

function snapshotPath() {
  return process.env.KB_SNAPSHOT_PATH || './data/kb-snapshot.sqlite';
}

function closeCached() {
  if (cached.db) {
    try { cached.db.close(); } catch (e) { /* already closed */ }
  }
  cached = { path: '', mtimeMs: 0, db: null };
}

function snapshotStat() {
  var file = snapshotPath();
  try { return { path: file, stat: fs.statSync(file) }; }
  catch (e) { return { path: file, stat: null }; }
}

function getDb() {
  var info = snapshotStat();
  if (!info.stat) {
    if (cached.db) closeCached();
    console.warn('[kb-store] snapshot missing: ' + info.path);
    return null;
  }
  var mtimeMs = Number(info.stat.mtimeMs || info.stat.mtime.getTime());
  if (cached.db && cached.path === info.path && cached.mtimeMs === mtimeMs) return cached.db;
  if (!Database) {
    console.warn('[kb-store] better-sqlite3 unavailable');
    return null;
  }
  if (cached.db) closeCached();
  try {
    cached = { path: info.path, mtimeMs: mtimeMs, db: new Database(info.path, { readonly: true, fileMustExist: true }) };
    return cached.db;
  } catch (e) {
    console.warn('[kb-store] open failed: ' + e.message);
    closeCached();
    return null;
  }
}

function ftsQuery(query) {
  var normalized = normalizeThaiInput(String(query || '')) || '';
  var words = normalized.replace(/["']/g, ' ').split(/\s+/).filter(function(w) { return w.length > 0; });
  if (!words.length) return '';
  return words.map(function(w) { return '"' + w.replace(/"/g, '') + '"'; }).join(' OR ');
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function mapRow(row) {
  var meta = parseMetadata(row.metadata);
  return {
    content: row.content || '',
    source: row.source || '',
    category: meta.category || row.source_type || '',
    brand: meta.brand || null,
    chunk_id: row.chunk_id,
  };
}

var SELECT_COLS = 'SELECT c.id AS chunk_id, c.content, c.source, c.source_type, c.metadata, c.tags';

function brandClause(opts, params) {
  if (!opts.brand) return '';
  params.push(String(opts.brand));
  return " AND json_valid(c.metadata) AND lower(COALESCE(json_extract(c.metadata, '$.brand'), '')) = lower(?)";
}

function ftsSearch(db, query, opts, topK) {
  var match = ftsQuery(query);
  if (!match) return [];
  var params = [match];
  var sql = SELECT_COLS + ', bm25(kb_fts) AS rank FROM kb_fts JOIN kb_chunks c ON c.rowid = kb_fts.rowid '
    + 'WHERE kb_fts MATCH ?' + brandClause(opts, params) + ' ORDER BY rank LIMIT ?';
  params.push(topK);
  var statement = db.prepare(sql);
  return statement.all.apply(statement, params).map(mapRow);
}

/**
 * Substring fallback.
 *
 * The snapshot indexes Thai text that was word-segmented at export time, but a
 * LINE message arrives unsegmented — so a compound like "แบตเตอรี่" or
 * "อินเวอร์เตอร์" matches nothing through FTS even though the documents clearly
 * contain it (measured on the real snapshot: FTS 0 vs LIKE 19 and 132). Falling
 * back to a substring scan recovers those queries. It is only reached when FTS
 * finds nothing, and the corpus is small enough (~4k chunks) for this to stay
 * in the low-millisecond range.
 */
function likeSearch(db, query, opts, topK) {
  var needle = String(query || '').trim();
  if (needle.length < 2) return [];
  // Escape LIKE wildcards so a literal % or _ in the question cannot widen it.
  var escaped = needle.replace(/[\\%_]/g, function(ch) { return '\\' + ch; });
  var params = ['%' + escaped + '%'];
  var sql = SELECT_COLS + " FROM kb_chunks c WHERE c.content LIKE ? ESCAPE '\\'"
    + brandClause(opts, params)
    + ' ORDER BY length(c.content) ASC LIMIT ?';
  params.push(topK);
  var statement = db.prepare(sql);
  return statement.all.apply(statement, params).map(mapRow);
}

/**
 * Thai → English term glossary.
 *
 * Manufacturer documentation (Sigenergy, ATMOCE datasheets and manuals) is in
 * English, while the team asks in Thai. Measured on the real snapshot:
 * "แบตเตอรี่" appears in 0 branded chunks, "battery" in 349. Without this the
 * bot would answer "ไม่มีข้อมูล" while holding the answer. Deterministic table
 * rather than an LLM translation call — no latency, no cost, no drift.
 */
var TH_EN = [
  ['แบตเตอรี่', 'battery'], ['แบต', 'battery'],
  ['อินเวอร์เตอร์', 'inverter'], ['อินเวอเตอร์', 'inverter'],
  ['แผงโซลาร์', 'solar panel'], ['แผง', 'panel'], ['โซลาร์', 'solar'],
  ['ประกัน', 'warranty'], ['รับประกัน', 'warranty'],
  ['การติดตั้ง', 'installation'], ['ติดตั้ง', 'installation'],
  ['คู่มือ', 'manual'], ['สเปค', 'specification'], ['สเป็ค', 'specification'],
  ['กำลังไฟ', 'power output'], ['แรงดัน', 'voltage'], ['กระแส', 'current'],
  ['ประสิทธิภาพ', 'efficiency'], ['อายุการใช้งาน', 'lifespan'],
  ['การบำรุงรักษา', 'maintenance'], ['บำรุงรักษา', 'maintenance'],
  ['ข้อผิดพลาด', 'error'], ['รหัสข้อผิดพลาด', 'error code'],
  ['เชื่อมต่อ', 'connection'], ['สายไฟ', 'cable'], ['ตู้', 'combiner'],
  ['มิเตอร์', 'meter'], ['กราวด์', 'grounding'], ['สายดิน', 'grounding'],
  ['อุณหภูมิ', 'temperature'], ['น้ำหนัก', 'weight'], ['ขนาด', 'dimension'],
  ['เฟส', 'phase'], ['ชาร์จ', 'charge'], ['ความจุ', 'capacity'],
];

/** Query variants to try, in order: the original first, then English terms. */
function queryVariants(query) {
  var text = String(query || '');
  var out = [text];
  var seen = {};
  for (var i = 0; i < TH_EN.length; i++) {
    var th = TH_EN[i][0], en = TH_EN[i][1];
    if (text.indexOf(th) >= 0 && !seen[en]) { seen[en] = true; out.push(en); }
  }
  return out;
}

function search(query, opts) {
  opts = opts || {};
  var db = getDb();
  if (!db) return [];
  var topK = Math.max(1, Math.min(50, Number(opts.topK || 8)));
  try {
    var variants = queryVariants(query);
    var results = [];
    var seenChunks = {};
    for (var i = 0; i < variants.length && results.length < topK; i++) {
      var need = topK - results.length;
      var hits = ftsSearch(db, variants[i], opts, need);
      if (!hits.length) hits = likeSearch(db, variants[i], opts, need);
      for (var j = 0; j < hits.length; j++) {
        var key = hits[j].chunk_id;
        if (seenChunks[key]) continue;
        seenChunks[key] = true;
        results.push(hits[j]);
      }
    }
    return results.slice(0, topK);
  } catch (e) {
    console.warn('[kb-store] search failed: ' + e.message);
    return [];
  }
}

function getSnapshotDate() {
  var info = snapshotStat();
  if (!info.stat) return null;
  return new Date(Number(info.stat.mtimeMs || info.stat.mtime.getTime())).toISOString();
}

function close() { closeCached(); }

module.exports = { search: search, getSnapshotDate: getSnapshotDate, close: close };
