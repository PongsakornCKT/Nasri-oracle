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
      var Database = require('better-sqlite3');
      sqliteDb = new Database(SQLITE_PATH);
      sqliteDb.pragma('journal_mode = WAL');
      sqliteDb.pragma('synchronous = NORMAL');
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
        'CREATE INDEX IF NOT EXISTS idx_qt_user ON quotations(user_id);' +
        'CREATE INDEX IF NOT EXISTS idx_qt_ts ON quotations(ts DESC);' +
        'CREATE INDEX IF NOT EXISTS idx_qt_brand ON quotations(brand);'
      );
      sqliteAvailable = true;
      console.log('[sqlite] Initialized at ' + SQLITE_PATH + ' (WAL mode)');

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
  function _qtRowToLegacy(r) {
    if (!r) return null;
    return {
      ts: r.ts || '',
      userId: r.user_id || '',
      quote_number: r.quote_number || '',
      brand: r.brand || '',
      size_kw: r.size_kw || 0,
      phase: r.phase || '',
      has_battery: !!r.has_battery,
      grand_total: r.grand_total || 0,
      customer_name: r.customer_name || '',
      pdf_url: r.pdf_url || '',
      pdf_file: r.pdf_file || '',
      spec_file: r.spec_file || '',
    };
  }

  function loadQtIndex() {
    if (sqliteAvailable) {
      try {
        var rows = sqliteDb.prepare('SELECT * FROM quotations ORDER BY ts ASC').all();
        return { quotations: rows.map(_qtRowToLegacy) };
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
        var rows = sqliteDb.prepare(
          'SELECT * FROM quotations WHERE user_id = ? ORDER BY ts DESC LIMIT ?'
        ).all(userId, limit || 5);
        return rows.map(_qtRowToLegacy);
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
  };
};
