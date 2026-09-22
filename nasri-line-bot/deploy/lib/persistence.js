'use strict';

// ─── Persistence: SQLite + legacy JSON fallback ───────────────
// Factory used from app.js:
//
//   var persistence = require('./lib/persistence')({
//     BOM_DIR, TMP_DIR, BOM_INDEX, QT_INDEX_PATH, SQLITE_PATH,
//     USE_LEGACY_JSON, generateBomHtml, auditLog, lastBom,
//   });
//
// Returns an object exposing everything the rest of app.js used to
// call inline. Behaviour is intentionally identical to the original
// monolith — only the location moved.

var fs = require('fs');
var path = require('path');

// Rows are stamped with SQLite's datetime('now'), which is UTC. Business days
// are Bangkok days, so every "today" comparison shifts by this offset.
var TZ_OFFSET = process.env.KB_TZ_OFFSET || '+7 hours';
// Upper bound on how many of a group's messages go into one summary prompt.
var MAX_SUMMARY_MESSAGES = Number(process.env.SUMMARY_MAX_MESSAGES || 400);

module.exports = function createPersistence(opts) {
  opts = opts || {};
  var BOM_DIR = opts.BOM_DIR;
  var TMP_DIR = opts.TMP_DIR;
  var BOM_INDEX = opts.BOM_INDEX;
  var QT_INDEX_PATH = opts.QT_INDEX_PATH;
  var SQLITE_PATH = opts.SQLITE_PATH;
  var USE_LEGACY_JSON = !!opts.USE_LEGACY_JSON;
  // Callbacks injected so saveBom can keep its old side-effects.
  var generateBomHtmlFn = typeof opts.generateBomHtml === 'function' ? opts.generateBomHtml : function() { return ''; };
  var auditLogFn = typeof opts.auditLog === 'function' ? opts.auditLog : function() {};
  var lastBomMap = opts.lastBom || null;

  var sqliteDb = null;
  var sqliteAvailable = false;
  var sqliteInitError = '';

  // ─── SQLite initialisation + one-time legacy migration ──────
  (function initSqlite() {
    try {
      fs.mkdirSync(BOM_DIR, { recursive: true });
      var Database;
      try {
        Database = require('better-sqlite3');
      } catch (e) {
        try {
          Database = require('bun:sqlite').Database;
        } catch (e2) {
          try {
            var nodeSqlite = require('node:sqlite');
            Database = nodeSqlite.DatabaseSync;
          } catch (e3) {
            throw e;
          }
        }
      }
      sqliteDb = new Database(SQLITE_PATH);
      if (typeof sqliteDb.pragma === 'function') {
        sqliteDb.pragma('journal_mode = WAL');
        sqliteDb.pragma('synchronous = NORMAL');
      } else {
        try { sqliteDb.exec('PRAGMA journal_mode = WAL;'); } catch (e) {}
        try { sqliteDb.exec('PRAGMA synchronous = NORMAL;'); } catch (e) {}
      }
      sqliteDb.exec(
        'CREATE TABLE IF NOT EXISTS boms (' +
        '  filename TEXT PRIMARY KEY,' +
        '  project_name TEXT,' +
        '  customer_name TEXT,' +
        '  project_address TEXT,' +
        '  created TEXT NOT NULL,' +
        '  updated TEXT NOT NULL,' +
        '  item_count INTEGER,' +
        '  total_cost REAL,' +
        '  source_key TEXT' +
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_boms_source ON boms(source_key);' +
        'CREATE INDEX IF NOT EXISTS idx_boms_updated ON boms(updated DESC);' +
        'CREATE TABLE IF NOT EXISTS quotations (' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  ts TEXT NOT NULL,' +
        '  user_id TEXT,' +
        '  quote_number TEXT,' +
        '  brand TEXT,' +
        '  size_kw REAL,' +
        '  phase TEXT,' +
        '  has_battery INTEGER,' +
        '  grand_total REAL,' +
        '  customer_name TEXT,' +
        '  pdf_url TEXT,' +
        '  pdf_file TEXT,' +
        '  spec_file TEXT' +
        ');' +
        // idx_qt_user/idx_qt_ts intentionally NOT created here (see below) —
        // CREATE TABLE IF NOT EXISTS above is a no-op when scripts/enervia/
        // migrate-v2.ts's rich schema (id=QT number TEXT PK, created_by,
        // created_at — no user_id/ts columns) already owns this table on
        // the live file. Bundling those indexes into this same multi-
        // statement exec() would throw "no such column: user_id/ts" on the
        // FIRST statement that references a missing column, which aborts
        // the entire exec() — including the unrelated access_logs/
        // pdpa_consents tables below — and drops sqliteAvailable to false,
        // silently degrading everything (not just QT) to legacy JSON. See
        // the column-guarded CREATE INDEX block right after this exec().
        // sobek: admin command audit log — append-only, never DELETE/UPDATE
        'CREATE TABLE IF NOT EXISTS access_logs (' +
        '  id        INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  ts        TEXT    NOT NULL DEFAULT (datetime(\'now\')),' +
        '  user_id   TEXT    NOT NULL,' +
        '  intent    TEXT    NOT NULL,' +
        '  allowed   INTEGER NOT NULL,' +  // 1 = granted, 0 = denied
        '  input_len INTEGER,' +            // length of sanitized input (no PII)
        '  detail    TEXT' +                // extra context, no raw user message
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_access_ts     ON access_logs(ts DESC);' +
        'CREATE INDEX IF NOT EXISTS idx_access_user   ON access_logs(user_id);' +
        'CREATE INDEX IF NOT EXISTS idx_access_intent ON access_logs(intent);' +
        // sobek K3: PDPA consent log — append-only, never update/delete
        'CREATE TABLE IF NOT EXISTS pdpa_consents (' +
        '  id          INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  ts          TEXT    NOT NULL DEFAULT (datetime(\'now\')),' +
        '  user_id     TEXT    NOT NULL,' +
        '  consent_type TEXT   NOT NULL,' +   // 'quotation_pdf' | 'bom_pdf'
        '  consented   INTEGER NOT NULL,' +   // 1 = yes, 0 = declined
        '  ip_hash     TEXT,' +               // SHA256 of LINE userId (not raw IP)
        '  version     TEXT    NOT NULL DEFAULT \'v1\'' + // consent version for future changes
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_pdpa_user ON pdpa_consents(user_id);' +
        'CREATE INDEX IF NOT EXISTS idx_pdpa_ts   ON pdpa_consents(ts DESC);' +
        'CREATE TABLE IF NOT EXISTS bom_postback_state (' +
        '  user_id    TEXT PRIMARY KEY,' +
        '  bom_data   TEXT NOT NULL,' +
        '  updated_at INTEGER NOT NULL' +
        ');' +
        'CREATE TABLE IF NOT EXISTS group_messages (' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  group_id TEXT NOT NULL,' +
        '  user_id TEXT,' +
        '  display_name TEXT,' +
        '  text TEXT NOT NULL,' +
        '  ts TEXT DEFAULT (datetime(\'now\'))' +
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_gm_group_ts ON group_messages(group_id, ts);' +
        'CREATE TABLE IF NOT EXISTS group_meta (' +
        '  group_id TEXT PRIMARY KEY,' +
        '  announced INTEGER DEFAULT 0,' +
        '  summary_enabled INTEGER DEFAULT 1' +
        ');' +
        'CREATE TABLE IF NOT EXISTS notes (' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  scope_key TEXT NOT NULL,' +
        '  created_by TEXT,' +
        '  text TEXT NOT NULL,' +
        '  due_ts TEXT,' +
        '  done INTEGER DEFAULT 0,' +
        '  created_ts TEXT DEFAULT (datetime(\'now\'))' +
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_notes_due ON notes(done, due_ts);'
      );
      sqliteAvailable = true;
      console.log('[sqlite] Initialized at ' + SQLITE_PATH + ' (WAL mode)');

      // ─── Column-guarded QT indexes — column-agnostic across schema eras ──
      // (see comment above, in place of the old unconditional idx_qt_user/
      // idx_qt_ts/idx_qt_brand statements). Checked once via PRAGMA
      // table_info() so this never throws regardless of which `quotations`
      // schema actually owns the live table.
      try {
        var _qtIdxCols = sqliteDb.prepare('PRAGMA table_info(quotations)').all().map(function(c) { return c.name; });
        if (_qtIdxCols.indexOf('user_id') !== -1) sqliteDb.exec('CREATE INDEX IF NOT EXISTS idx_qt_user ON quotations(user_id)');
        if (_qtIdxCols.indexOf('ts') !== -1) sqliteDb.exec('CREATE INDEX IF NOT EXISTS idx_qt_ts ON quotations(ts DESC)');
        if (_qtIdxCols.indexOf('brand') !== -1) sqliteDb.exec('CREATE INDEX IF NOT EXISTS idx_qt_brand ON quotations(brand)');
      } catch (e) { console.error('[sqlite] qt index guard error:', e.message); }

      // ─── One-time migration from legacy JSON ──────────────────
      try {
        var bomRowCount = sqliteDb.prepare('SELECT COUNT(*) AS c FROM boms').get().c;
        var qtRowCount = sqliteDb.prepare('SELECT COUNT(*) AS c FROM quotations').get().c;
        var importedBoms = 0, importedQts = 0;

        if (bomRowCount === 0 && fs.existsSync(BOM_INDEX)) {
          try {
            var legacyBom = JSON.parse(fs.readFileSync(BOM_INDEX, 'utf8'));
            if (legacyBom && Array.isArray(legacyBom.boms)) {
              var insBom = sqliteDb.prepare(
                'INSERT OR IGNORE INTO boms ' +
                '(filename, project_name, customer_name, project_address, created, updated, item_count, total_cost, source_key) ' +
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
              );
              var txBom = sqliteDb.transaction(function(rows) {
                rows.forEach(function(b) {
                  if (!b || !b.filename) return;
                  insBom.run(
                    b.filename,
                    b.project_name || '',
                    b.customer_name || '',
                    b.project_address || '',
                    b.created || new Date().toISOString(),
                    b.updated || b.created || new Date().toISOString(),
                    b.item_count || 0,
                    b.total_cost || 0,
                    b.source_key || ''
                  );
                  importedBoms++;
                });
              });
              txBom(legacyBom.boms);
            }
          } catch (e) { console.error('[sqlite-migrate] bom import error:', e.message); }
        }

        if (qtRowCount === 0 && fs.existsSync(QT_INDEX_PATH)) {
          try {
            var legacyQt = JSON.parse(fs.readFileSync(QT_INDEX_PATH, 'utf8'));
            if (legacyQt && Array.isArray(legacyQt.quotations)) {
              var insQt = sqliteDb.prepare(
                'INSERT INTO quotations ' +
                '(ts, user_id, quote_number, brand, size_kw, phase, has_battery, grand_total, customer_name, pdf_url, pdf_file, spec_file) ' +
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              );
              var txQt = sqliteDb.transaction(function(rows) {
                rows.forEach(function(q) {
                  if (!q) return;
                  insQt.run(
                    q.ts || new Date().toISOString(),
                    q.userId || '',
                    q.quote_number || '',
                    q.brand || '',
                    q.size_kw || 0,
                    q.phase || '',
                    q.has_battery ? 1 : 0,
                    q.grand_total || 0,
                    q.customer_name || '',
                    q.pdf_url || '',
                    q.pdf_file || '',
                    q.spec_file || ''
                  );
                  importedQts++;
                });
              });
              txQt(legacyQt.quotations);
            }
          } catch (e) { console.error('[sqlite-migrate] qt import error:', e.message); }
        }

        if (importedBoms > 0 || importedQts > 0) {
          console.log('[sqlite-migrate] imported ' + importedBoms + ' boms / ' + importedQts + ' quotations from legacy JSON');
        }
      } catch (e) { console.error('[sqlite-migrate] error:', e.message); }
    } catch (e) {
      sqliteAvailable = false;
      sqliteDb = null;
      sqliteInitError = e && e.message ? e.message : String(e);
      if (e && e.stack) sqliteInitError += ' | STACK: ' + e.stack.split('\n').slice(0, 3).join(' / ');
      console.warn('[sqlite] better-sqlite3 unavailable (' + sqliteInitError + ') — falling back to legacy JSON file persistence');
    }
  })();

  // ─── BOM Persistence ────────────────────────────────────────
  function loadBomIndex() {
    if (sqliteAvailable) {
      try {
        var rows = sqliteDb.prepare(
          'SELECT filename, project_name, customer_name, project_address, created, updated, item_count, total_cost, source_key ' +
          'FROM boms ORDER BY created ASC'
        ).all();
        return { boms: rows };
      } catch (e) { console.error('[sqlite] loadBomIndex error:', e.message); return { boms: [] }; }
    }
    try {
      fs.mkdirSync(BOM_DIR, { recursive: true });
      if (fs.existsSync(BOM_INDEX)) {
        return JSON.parse(fs.readFileSync(BOM_INDEX, 'utf8'));
      }
    } catch (e) { console.error('[index] Load error:', e.message); }
    return { boms: [] };
  }

  function saveBomIndex(index) {
    if (sqliteAvailable && !USE_LEGACY_JSON) return;
    try {
      fs.mkdirSync(BOM_DIR, { recursive: true });
      fs.writeFileSync(BOM_INDEX, JSON.stringify(index, null, 2), 'utf8');
    } catch (e) { console.error('[index] Save error:', e.message); }
  }

  function upsertBom(entry) {
    if (!sqliteAvailable) return false;
    try {
      sqliteDb.prepare(
        'INSERT INTO boms (filename, project_name, customer_name, project_address, created, updated, item_count, total_cost, source_key) ' +
        'VALUES (@filename, @project_name, @customer_name, @project_address, @created, @updated, @item_count, @total_cost, @source_key) ' +
        'ON CONFLICT(filename) DO UPDATE SET ' +
        '  project_name=excluded.project_name, ' +
        '  customer_name=excluded.customer_name, ' +
        '  project_address=excluded.project_address, ' +
        '  updated=excluded.updated, ' +
        '  item_count=excluded.item_count, ' +
        '  total_cost=excluded.total_cost, ' +
        '  source_key=excluded.source_key'
      ).run({
        filename: entry.filename,
        project_name: entry.project_name || '',
        customer_name: entry.customer_name || '',
        project_address: entry.project_address || '',
        created: entry.created || new Date().toISOString(),
        updated: entry.updated || new Date().toISOString(),
        item_count: entry.item_count || 0,
        total_cost: entry.total_cost || 0,
        source_key: entry.source_key || '',
      });
      return true;
    } catch (e) { console.error('[sqlite] upsertBom error:', e.message); return false; }
  }

  function findBomBySourceAndProject(sourceKey, projectName) {
    if (!sqliteAvailable) return null;
    try {
      return sqliteDb.prepare(
        'SELECT * FROM boms WHERE source_key = ? AND project_name = ? LIMIT 1'
      ).get(sourceKey, projectName) || null;
    } catch (e) { return null; }
  }

  function searchBoms(query) {
    if (sqliteAvailable) {
      try {
        var like = '%' + String(query || '').toLowerCase() + '%';
        var rows = sqliteDb.prepare(
          'SELECT * FROM boms ' +
          'WHERE lower(project_name) LIKE ? ' +
          '   OR lower(customer_name) LIKE ? ' +
          '   OR lower(filename) LIKE ? ' +
          'ORDER BY updated DESC'
        ).all(like, like, like);
        return rows;
      } catch (e) { console.error('[sqlite] searchBoms error:', e.message); return []; }
    }
    var index = loadBomIndex();
    var q = String(query || '').toLowerCase();
    return index.boms.filter(function(b) {
      return (b.project_name || '').toLowerCase().indexOf(q) >= 0
        || (b.customer_name || '').toLowerCase().indexOf(q) >= 0
        || (b.filename || '').toLowerCase().indexOf(q) >= 0;
    }).sort(function(a, b) {
      return new Date(b.updated || b.created) - new Date(a.updated || a.created);
    });
  }

  // ─── QT History (per userId) ────────────────────────────────
  // Schema note (RUNBOOK.md "Schema note — pre-existing landmine"): two
  // competing `quotations` table shapes can be live in nasri.sqlite — the
  // rich one from scripts/enervia/migrate-v2.ts (id=QT number TEXT PK,
  // status, created_by, created_at) and this module's own legacy simple
  // one (autoincrement id, quote_number, user_id, ts). CREATE TABLE IF NOT
  // EXISTS is a no-op once either has created the table, so whichever ran
  // first "wins" — if the rich schema is live, `ORDER BY ts` has no such
  // column and throws, which loadQtIndex() was swallowing into an empty
  // list (bug: /health qt_count always 0 regardless of real row count).
  // Same PRAGMA table_info() column-detection fix as lib/quote-followup.js
  // (proven working there) — read-only, never ALTERs.
  var _qtCols = null;
  function getQtCols() {
    if (!sqliteAvailable) return [];
    if (_qtCols) return _qtCols;
    try {
      _qtCols = sqliteDb.prepare('PRAGMA table_info(quotations)').all().map(function(c) { return c.name; });
    } catch (e) { _qtCols = []; }
    return _qtCols;
  }
  function qtIdCol(cols)    { return cols.indexOf('quote_number') !== -1 ? 'quote_number' : 'id'; }
  function qtOwnerCol(cols) { return cols.indexOf('created_by')   !== -1 ? 'created_by'   : 'user_id'; }
  function qtTsCol(cols)    { return cols.indexOf('created_at')   !== -1 ? 'created_at'   : 'ts'; }

  function _qtRowToLegacy(r, cols) {
    if (!r) return null;
    cols = cols || [];
    var tsC = qtTsCol(cols), ownerC = qtOwnerCol(cols), idC = qtIdCol(cols);
    return {
      ts: r[tsC] || r.ts || '',
      userId: r[ownerC] || r.user_id || '',
      quote_number: r[idC] || r.quote_number || '',
      brand: r.brand || '',
      size_kw: r.size_kw || 0,
      phase: r.phase || '',
      has_battery: !!r.has_battery,
      // rich v2 schema (scripts/enervia/migrate-v2.ts) names this column
      // `total`, not `grand_total` — fall back to it so history/health
      // consumers show the real amount instead of 0.
      grand_total: r.grand_total || r.total || 0,
      customer_name: r.customer_name || '',
      pdf_url: r.pdf_url || '',
      pdf_file: r.pdf_file || '',
      spec_file: r.spec_file || '',
    };
  }

  function loadQtIndex() {
    if (sqliteAvailable) {
      try {
        var cols = getQtCols();
        var tsC = qtTsCol(cols);
        var rows = sqliteDb.prepare('SELECT * FROM quotations ORDER BY ' + tsC + ' ASC').all();
        return { quotations: rows.map(function(r) { return _qtRowToLegacy(r, cols); }) };
      } catch (e) { console.error('[sqlite] loadQtIndex error:', e.message); return { quotations: [] }; }
    }
    try {
      fs.mkdirSync(BOM_DIR, { recursive: true });
      if (fs.existsSync(QT_INDEX_PATH)) return JSON.parse(fs.readFileSync(QT_INDEX_PATH, 'utf8'));
    } catch (e) { console.error('[qt-index] Load error:', e.message); }
    return { quotations: [] };
  }

  function saveQtIndex(index) {
    if (sqliteAvailable && !USE_LEGACY_JSON) return;
    try {
      fs.mkdirSync(BOM_DIR, { recursive: true });
      fs.writeFileSync(QT_INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
    } catch (e) { console.error('[qt-index] Save error:', e.message); }
  }

  function insertQt(entry) {
    if (!sqliteAvailable) return false;
    try {
      sqliteDb.prepare(
        'INSERT INTO quotations ' +
        '(ts, user_id, quote_number, brand, size_kw, phase, has_battery, grand_total, customer_name, pdf_url, pdf_file, spec_file) ' +
        'VALUES (@ts, @user_id, @quote_number, @brand, @size_kw, @phase, @has_battery, @grand_total, @customer_name, @pdf_url, @pdf_file, @spec_file)'
      ).run({
        ts: entry.ts,
        user_id: entry.userId || '',
        quote_number: entry.quote_number || '',
        brand: entry.brand || '',
        size_kw: entry.size_kw || 0,
        phase: entry.phase || '',
        has_battery: entry.has_battery ? 1 : 0,
        grand_total: entry.grand_total || 0,
        customer_name: entry.customer_name || '',
        pdf_url: entry.pdf_url || '',
        pdf_file: entry.pdf_file || '',
        spec_file: entry.spec_file || '',
      });
      return true;
    } catch (e) { console.error('[sqlite] insertQt error:', e.message); return false; }
  }

  function saveQtHistory(userId, result, spec, pdfUrl) {
    try {
      var specFn = '';
      try {
        fs.mkdirSync(BOM_DIR, { recursive: true });
        var qnum = (result.quote_number || 'unknown').replace(/[^a-zA-Z0-9]/g, '');
        specFn = 'qt-' + qnum + '-' + Date.now() + '.json';
        var specPayload = {
          ts: new Date().toISOString(),
          userId: userId || '',
          quote_number: result.quote_number || '',
          pdf_url: pdfUrl || '',
          pdf_file: (result.path ? path.basename(result.path) : ''),
          spec: spec,
          result: result,
        };
        fs.writeFileSync(path.join(BOM_DIR, specFn), JSON.stringify(specPayload, null, 2), 'utf8');
      } catch (e) { console.error('[qt-spec-save]', e.message); specFn = ''; }

      var entry = {
        ts: new Date().toISOString(),
        userId: userId || '',
        quote_number: result.quote_number || '',
        brand: result.brand || spec.brand || '',
        size_kw: result.size_kw || spec.size_kw || 0,
        phase: result.phase || spec.phase || '',
        has_battery: !!(result.has_battery || spec.has_battery),
        grand_total: result.grand_total || 0,
        customer_name: spec.customer_name || '',
        pdf_url: pdfUrl || '',
        pdf_file: (result.path ? path.basename(result.path) : ''),
        spec_file: specFn,
      };

      if (sqliteAvailable && !USE_LEGACY_JSON) {
        insertQt(entry);
      } else {
        var index = loadQtIndex();
        index.quotations.push(entry);
        if (index.quotations.length > 500) index.quotations = index.quotations.slice(-500);
        saveQtIndex(index);
        if (sqliteAvailable && USE_LEGACY_JSON) insertQt(entry); // dual-write
      }
    } catch (e) { console.error('[qt-history] Save error:', e.message); }
  }

  function getQtHistoryForUser(userId, limit) {
    if (sqliteAvailable) {
      try {
        var cols = getQtCols();
        var ownerC = qtOwnerCol(cols), tsC = qtTsCol(cols);
        var rows = sqliteDb.prepare(
          'SELECT * FROM quotations WHERE ' + ownerC + ' = ? ORDER BY ' + tsC + ' DESC LIMIT ?'
        ).all(userId, limit || 5);
        return rows.map(function(r) { return _qtRowToLegacy(r, cols); });
      } catch (e) { console.error('[sqlite] getQtHistoryForUser error:', e.message); return []; }
    }
    try {
      var index = loadQtIndex();
      return index.quotations
        .filter(function(q) { return q.userId === userId; })
        .slice(-(limit || 5))
        .reverse();
    } catch (e) { return []; }
  }

  // ─── saveBom: writes JSON/HTML files + updates index ─────────
  // Keeps its original side effects (lastBom + auditLog) via injected deps.
  async function saveBom(k, data, src) {
    try {
      fs.mkdirSync(BOM_DIR, { recursive: true });
      fs.mkdirSync(TMP_DIR, { recursive: true });
      var slug = (data.project_name || 'unnamed').replace(/[^a-zA-Z0-9\u0E01-\u0E4F]/g, '-').replace(/-+/g, '-').slice(0, 40);
      var ts = Date.now();
      var fn = 'bom-' + slug + '-' + ts + '.json';

      // Check if this is an update of existing BOM (same source_key + project_name)
      var existing = null;
      if (sqliteAvailable) {
        existing = findBomBySourceAndProject(k, data.project_name);
        if (existing) fn = existing.filename;
      } else {
        var index = loadBomIndex();
        for (var i = 0; i < index.boms.length; i++) {
          if (index.boms[i].source_key === k && index.boms[i].project_name === data.project_name) {
            existing = index.boms[i];
            fn = existing.filename;
            break;
          }
        }
      }

      // Save JSON to boms dir
      fs.writeFileSync(path.join(BOM_DIR, fn), JSON.stringify(data, null, 2), 'utf8');
      // Also save HTML (rendered via injected generator)
      var htmlFn = fn.replace('.json', '.html');
      var html = generateBomHtmlFn(data);
      fs.writeFileSync(path.join(BOM_DIR, htmlFn), html, 'utf8');
      // Also keep copy in tmp for backward compat
      fs.writeFileSync(path.join(TMP_DIR, fn), JSON.stringify(data, null, 2), 'utf8');
      fs.writeFileSync(path.join(TMP_DIR, htmlFn), html, 'utf8');

      // Update index (SQLite upsert, or legacy JSON mutation)
      var tc = 0;
      data.items.forEach(function(i) { tc += i.total_cost; });
      var now = new Date().toISOString();

      if (sqliteAvailable && !USE_LEGACY_JSON) {
        upsertBom({
          filename: fn,
          project_name: data.project_name || '',
          customer_name: data.project_name || '',
          project_address: data.project_address || '',
          created: existing ? (existing.created || now) : now,
          updated: now,
          item_count: data.items.length,
          total_cost: tc,
          source_key: k,
        });
      } else {
        var jsonIndex = loadBomIndex();
        if (existing) {
          for (var j = 0; j < jsonIndex.boms.length; j++) {
            if (jsonIndex.boms[j].filename === existing.filename) {
              jsonIndex.boms[j].updated = now;
              jsonIndex.boms[j].item_count = data.items.length;
              jsonIndex.boms[j].total_cost = tc;
              jsonIndex.boms[j].project_address = data.project_address || '';
              break;
            }
          }
        } else {
          jsonIndex.boms.push({
            filename: fn,
            project_name: data.project_name || '',
            customer_name: data.project_name || '',
            project_address: data.project_address || '',
            created: now,
            updated: now,
            item_count: data.items.length,
            total_cost: tc,
            source_key: k,
          });
        }
        saveBomIndex(jsonIndex);
        if (sqliteAvailable && USE_LEGACY_JSON) {
          upsertBom({
            filename: fn,
            project_name: data.project_name || '',
            customer_name: data.project_name || '',
            project_address: data.project_address || '',
            created: existing ? (existing.created || now) : now,
            updated: now,
            item_count: data.items.length,
            total_cost: tc,
            source_key: k,
          });
        }
      }

      if (lastBomMap) lastBomMap.set(k, { filename: fn, data: data });
      console.log('[bom] Saved: ' + fn + (existing ? ' (updated)' : ' (new)'));
      auditLogFn('bom_saved', (src && (src.userId || src.groupId)) || '', fn + ' items=' + data.items.length);
    } catch (e) { console.error('[bom] Save error:', e.message); }
  }

  return {
    // sobek K3: PDPA consent log
    logConsent: function(userId, consentType, consented) {
      if (!sqliteAvailable || !sqliteDb) return;
      try {
        var crypto = require('crypto');
        var ipHash = crypto.createHash('sha256').update(userId || '').digest('hex').slice(0, 16);
        sqliteDb.prepare(
          'INSERT INTO pdpa_consents (user_id, consent_type, consented, ip_hash) VALUES (?,?,?,?)'
        ).run(userId || '', consentType || 'quotation_pdf', consented ? 1 : 0, ipHash);
      } catch (e) { /* non-blocking */ }
    },
    hasConsented: function(userId, consentType) {
      if (!sqliteAvailable || !sqliteDb) return false;
      try {
        var row = sqliteDb.prepare(
          'SELECT consented FROM pdpa_consents WHERE user_id=? AND consent_type=? ORDER BY ts DESC LIMIT 1'
        ).get(userId || '', consentType || 'quotation_pdf');
        return !!(row && row.consented === 1);
      } catch (e) { return false; }
    },
    // sobek: admin command audit log
    logAccess: function(userId, intent, allowed, inputLen, detail) {
      if (!sqliteAvailable || !sqliteDb) return;
      try {
        sqliteDb.prepare(
          'INSERT INTO access_logs (user_id, intent, allowed, input_len, detail) VALUES (?,?,?,?,?)'
        ).run(userId || '', intent || '', allowed ? 1 : 0, inputLen || 0, detail || '');
      } catch (e) { /* non-blocking — never fail main flow */ }
    },
    // bom postback state persistence across Passenger worker processes
    saveLastBom: function(userId, bomData) {
      if (!userId) return;
      if (lastBomMap) {
        lastBomMap.set(userId, { data: bomData, ts: Date.now() });
      }
      if (sqliteAvailable && sqliteDb) {
        try {
          sqliteDb.prepare(
            'INSERT INTO bom_postback_state (user_id, bom_data, updated_at) VALUES (?, ?, ?) ' +
            'ON CONFLICT(user_id) DO UPDATE SET bom_data = excluded.bom_data, updated_at = excluded.updated_at'
          ).run(userId, JSON.stringify(bomData), Date.now());
        } catch (e) {
          console.error('[saveLastBom sqlite]', e.message);
        }
      }
    },
    getLastBom: function(userId, ttlMs) {
      if (!userId) return null;
      ttlMs = ttlMs || 24 * 3600 * 1000;
      if (sqliteAvailable && sqliteDb) {
        try {
          var row = sqliteDb.prepare('SELECT bom_data, updated_at FROM bom_postback_state WHERE user_id = ?').get(userId);
          if (row && row.bom_data) {
            if (Date.now() - row.updated_at <= ttlMs) {
              return JSON.parse(row.bom_data);
            }
          }
        } catch (e) {
          console.error('[getLastBom sqlite]', e.message);
        }
      }
      if (lastBomMap && lastBomMap.has(userId)) {
        var lb = lastBomMap.get(userId);
        if (lb && lb.data) return lb.data;
      }
      return null;
    },
    // status
    get sqliteAvailable() { return sqliteAvailable; },
    get sqliteInitError() { return sqliteInitError; },
    get sqliteDb() { return sqliteDb; },
    // bom
    loadBomIndex: loadBomIndex,
    saveBomIndex: saveBomIndex,
    upsertBom: upsertBom,
    findBomBySourceAndProject: findBomBySourceAndProject,
    searchBoms: searchBoms,
    saveBom: saveBom,
    // qt
    loadQtIndex: loadQtIndex,
    saveQtIndex: saveQtIndex,
    insertQt: insertQt,
    saveQtHistory: saveQtHistory,
    getQtHistoryForUser: getQtHistoryForUser,
    _qtRowToLegacy: _qtRowToLegacy,
    // secretary notes (PR-7)
    addNote: function(scopeKey, createdBy, text, dueTs) {
      if (!sqliteAvailable || !sqliteDb || !scopeKey || !text) return null;
      try {
        var result = sqliteDb.prepare('INSERT INTO notes (scope_key, created_by, text, due_ts) VALUES (?, ?, ?, ?)').run(scopeKey, createdBy || null, text, dueTs || null);
        return sqliteDb.prepare('SELECT id, scope_key, created_by, text, due_ts, done, created_ts FROM notes WHERE id = ?').get(result.lastInsertRowid);
      } catch (e) { console.error('[addNote sqlite]', e.message); return null; }
    },
    listNotes: function(scopeKey) {
      if (!sqliteAvailable || !sqliteDb || !scopeKey) return [];
      try { return sqliteDb.prepare('SELECT id, scope_key, created_by, text, due_ts, done, created_ts FROM notes WHERE scope_key = ? AND done = 0 ORDER BY id DESC').all(scopeKey); }
      catch (e) { console.error('[listNotes sqlite]', e.message); return []; }
    },
    completeNote: function(scopeKey, id) {
      if (!sqliteAvailable || !sqliteDb || !scopeKey || !id) return false;
      try { return sqliteDb.prepare('UPDATE notes SET done = 1 WHERE id = ? AND scope_key = ? AND done = 0').run(Number(id), scopeKey).changes > 0; }
      catch (e) { console.error('[completeNote sqlite]', e.message); return false; }
    },
    deleteNote: function(scopeKey, id) {
      if (!sqliteAvailable || !sqliteDb || !scopeKey || !id) return false;
      try { return sqliteDb.prepare('DELETE FROM notes WHERE id = ? AND scope_key = ?').run(Number(id), scopeKey).changes > 0; }
      catch (e) { console.error('[deleteNote sqlite]', e.message); return false; }
    },
    dueNotes: function(nowIso) {
      if (!sqliteAvailable || !sqliteDb) return [];
      try { return sqliteDb.prepare('SELECT id, scope_key, created_by, text, due_ts, done, created_ts FROM notes WHERE done = 0 AND due_ts IS NOT NULL AND due_ts <= ? ORDER BY due_ts ASC, id ASC').all(nowIso || new Date().toISOString()); }
      catch (e) { console.error('[dueNotes sqlite]', e.message); return []; }
    },
    markNoteDone: function(id) {
      if (!sqliteAvailable || !sqliteDb || !id) return false;
      try { return sqliteDb.prepare('UPDATE notes SET done = 1 WHERE id = ? AND done = 0').run(Number(id)).changes > 0; }
      catch (e) { console.error('[markNoteDone sqlite]', e.message); return false; }
    },
    // group secretary (PR-6)
    saveGroupMessage: function(data) {
      if (!sqliteAvailable || !sqliteDb || !data || !data.groupId || !data.text) return;
      var text = String(data.text || '').trim();
      if (!text) return;
      if (text.length > 2000) text = text.slice(0, 2000) + '…';
      try {
        sqliteDb.prepare(
          'INSERT INTO group_messages (group_id, user_id, display_name, text) VALUES (?, ?, ?, ?)'
        ).run(data.groupId, data.userId || null, data.displayName || null, text);
      } catch (e) {
        console.error('[saveGroupMessage sqlite]', e.message);
      }
    },
    getGroupMeta: function(groupId) {
      if (!groupId) return { group_id: '', announced: 0, summary_enabled: 1 };
      if (sqliteAvailable && sqliteDb) {
        try {
          var row = sqliteDb.prepare('SELECT group_id, announced, summary_enabled FROM group_meta WHERE group_id = ?').get(groupId);
          if (row) return row;
        } catch (e) {
          console.error('[getGroupMeta sqlite]', e.message);
        }
      }
      return { group_id: groupId, announced: 0, summary_enabled: 1 };
    },
    setGroupAnnounced: function(groupId) {
      if (!groupId || !sqliteAvailable || !sqliteDb) return;
      try {
        sqliteDb.prepare(
          'INSERT INTO group_meta (group_id, announced, summary_enabled) VALUES (?, 1, 1) ' +
          'ON CONFLICT(group_id) DO UPDATE SET announced = 1'
        ).run(groupId);
      } catch (e) {
        console.error('[setGroupAnnounced sqlite]', e.message);
      }
    },
    resetGroupAnnounced: function(groupId) {
      if (!groupId || !sqliteAvailable || !sqliteDb) return;
      try {
        sqliteDb.prepare(
          'INSERT INTO group_meta (group_id, announced, summary_enabled) VALUES (?, 0, 1) ' +
          'ON CONFLICT(group_id) DO UPDATE SET announced = 0'
        ).run(groupId);
      } catch (e) {
        console.error('[resetGroupAnnounced sqlite]', e.message);
      }
    },
    // "Today" means today in Bangkok, not UTC. Rows are stamped with SQLite's
    // datetime('now'), which is always UTC, so comparing against a bare
    // date('now') dropped every message sent between 00:00 and 07:00 Thai time —
    // they carry the previous UTC date and vanished from the daily summary.
    //
    // The cap is a cost and reliability guard: an active group can produce
    // thousands of messages a day and the whole transcript goes to Haiku in one
    // prompt. Keeping the most recent MAX_SUMMARY_MESSAGES bounds both the bill
    // and the context window.
    getGroupMessagesToday: function(groupId, limit) {
      if (!groupId || !sqliteAvailable || !sqliteDb) return [];
      var cap = Math.max(1, Number(limit || MAX_SUMMARY_MESSAGES));
      try {
        var rows = sqliteDb.prepare(
          'SELECT id, group_id, user_id, display_name, text, ts FROM group_messages ' +
          'WHERE group_id = ? AND date(ts, ?) = date(\'now\', ?) ' +
          'ORDER BY id DESC LIMIT ?'
        ).all(groupId, TZ_OFFSET, TZ_OFFSET, cap);
        return rows.reverse(); // back to chronological order for the summary
      } catch (e) {
        console.error('[getGroupMessagesToday sqlite]', e.message);
        return [];
      }
    },
    /** Real total for today, so a truncated summary can say it was truncated. */
    countGroupMessagesToday: function(groupId) {
      if (!groupId || !sqliteAvailable || !sqliteDb) return 0;
      try {
        var row = sqliteDb.prepare(
          'SELECT COUNT(*) AS n FROM group_messages WHERE group_id = ? AND date(ts, ?) = date(\'now\', ?)'
        ).get(groupId, TZ_OFFSET, TZ_OFFSET);
        return (row && row.n) || 0;
      } catch (e) {
        console.error('[countGroupMessagesToday sqlite]', e.message);
        return 0;
      }
    },
    getActiveGroupsForSummary: function() {
      if (!sqliteAvailable || !sqliteDb) return [];
      try {
        return sqliteDb.prepare(
          'SELECT m.group_id, COUNT(m.id) AS message_count ' +
          'FROM group_messages m ' +
          'LEFT JOIN group_meta gm ON gm.group_id = m.group_id ' +
          'WHERE date(m.ts, ?) = date(\'now\', ?) AND COALESCE(gm.summary_enabled, 1) = 1 ' +
          'GROUP BY m.group_id HAVING message_count >= 5'
        ).all(TZ_OFFSET, TZ_OFFSET);
      } catch (e) {
        console.error('[getActiveGroupsForSummary sqlite]', e.message);
        return [];
      }
    },
    purgeOldGroupMessages: function(days) {
      days = typeof days === 'number' ? days : 90;
      if (!sqliteAvailable || !sqliteDb) return 0;
      try {
        var res = sqliteDb.prepare(
          'DELETE FROM group_messages WHERE ts < datetime(\'now\', \'-\' || ? || \' days\')'
        ).run(days);
        return res.changes || 0;
      } catch (e) {
        console.error('[purgeOldGroupMessages sqlite]', e.message);
        return 0;
      }
    },
  };
};
