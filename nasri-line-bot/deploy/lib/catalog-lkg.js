'use strict';

// ─── catalog-lkg.js — Last-Known-Good catalog snapshot (SQLite) ───
//
// nasri-oa-v2 Phase 05: L3 fallback for lib/catalog-cache.js when
// Google Sheets network fetch AND in-memory cache are both dead
// (e.g. fresh cold-start with Sheets down). Persists the last
// successfully-fetched catalog to SQLite so a restart doesn't leave
// the bot with zero product data.
//
// Usage:
//   var catalogLkg = require('./lib/catalog-lkg')({
//     SQLITE_PATH, notifyAdmin,
//   });
//
//   // After a successful catalog refresh (all sheets non-empty):
//   catalogLkg.save(catalog);  // sanity-gated, may reject + notify admin
//
//   // When live fetch fails and no in-memory data exists:
//   var stale = catalogLkg.load();  // { catalog, fetched_at } or null
//
// Sanity gate: rejects a new LKG write if total row count dropped
// more than 30% vs the previously-stored LKG (protects against
// writing a half-broken Sheets response as the new "good" baseline).

var fs = require('fs');
var path = require('path');

var SANITY_DROP_THRESHOLD = 0.30; // reject if rows drop >30% vs prior LKG

module.exports = function createCatalogLkg(opts) {
  opts = opts || {};
  var SQLITE_PATH = opts.SQLITE_PATH;
  var notifyAdminFn = typeof opts.notifyAdmin === 'function' ? opts.notifyAdmin : function() { return Promise.resolve(); };

  var db = null;
  var available = false;
  var initError = '';

  (function init() {
    try {
      if (opts.db) { db = opts.db; available = true; db.exec(
        'CREATE TABLE IF NOT EXISTS catalog_lkg (' +
        '  id INTEGER PRIMARY KEY CHECK (id = 1),' +
        '  json TEXT NOT NULL, row_count INTEGER NOT NULL, fetched_at TEXT NOT NULL);'
      ); return; }
      if (SQLITE_PATH) fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });
      var Database = require('better-sqlite3');
      db = new Database(SQLITE_PATH);
      db.pragma('journal_mode = WAL');
      db.exec(
        'CREATE TABLE IF NOT EXISTS catalog_lkg (' +
        '  id INTEGER PRIMARY KEY CHECK (id = 1),' + // single-row table, always overwritten
        '  json TEXT NOT NULL,' +
        '  row_count INTEGER NOT NULL,' +
        '  fetched_at TEXT NOT NULL' +
        ');'
      );
      available = true;
    } catch (e) {
      initError = e.message;
      available = false;
      console.error('[catalog-lkg] init failed:', e.message);
    }
  })();

  function _rowCount(catalog) {
    var total = 0;
    Object.keys(catalog || {}).forEach(function(k) {
      var rows = catalog[k];
      if (Array.isArray(rows)) total += rows.length;
    });
    return total;
  }

  // Treat a catalog as "dead" if every sheet is empty — this is the
  // signal catalog-cache.js should use to fall through to LKG.
  function isDead(catalog) {
    if (!catalog) return true;
    return _rowCount(catalog) === 0;
  }

  /**
   * save(catalog) — sanity-gated write. Returns true if written,
   * false if rejected (and admin notified) or SQLite unavailable.
   */
  function save(catalog) {
    if (!available) return false;
    var newCount = _rowCount(catalog);
    if (newCount === 0) return false; // never persist a dead catalog as LKG

    try {
      var prev = db.prepare('SELECT row_count FROM catalog_lkg WHERE id = 1').get();
      if (prev && prev.row_count > 0) {
        var dropRatio = (prev.row_count - newCount) / prev.row_count;
        if (dropRatio > SANITY_DROP_THRESHOLD) {
          var msg = '⚠️ [catalog-lkg] rejected new snapshot — row count dropped ' +
            (dropRatio * 100).toFixed(1) + '% (prev=' + prev.row_count + ', new=' + newCount + '). ' +
            'Keeping older LKG. Check Google Sheets source.';
          console.warn(msg);
          notifyAdminFn(msg).catch(function() {});
          return false;
        }
      }

      db.prepare(
        'INSERT INTO catalog_lkg (id, json, row_count, fetched_at) VALUES (1, ?, ?, ?)' +
        ' ON CONFLICT(id) DO UPDATE SET json = excluded.json, row_count = excluded.row_count, fetched_at = excluded.fetched_at'
      ).run(JSON.stringify(catalog), newCount, new Date().toISOString());
      return true;
    } catch (e) {
      console.error('[catalog-lkg] save failed:', e.message);
      return false;
    }
  }

  /**
   * load() — returns { catalog, row_count, fetched_at } or null.
   */
  function load() {
    if (!available) return null;
    try {
      var row = db.prepare('SELECT json, row_count, fetched_at FROM catalog_lkg WHERE id = 1').get();
      if (!row) return null;
      return {
        catalog: JSON.parse(row.json),
        row_count: row.row_count,
        fetched_at: row.fetched_at,
      };
    } catch (e) {
      console.error('[catalog-lkg] load failed:', e.message);
      return null;
    }
  }

  function stats() {
    return { available: available, init_error: initError || null };
  }

  return { save: save, load: load, isDead: isDead, stats: stats };
};
