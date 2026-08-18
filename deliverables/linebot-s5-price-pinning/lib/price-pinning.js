'use strict';

/**
 * price-pinning.js — S5 Quotation Price Pinning Engine (#S5)
 * Snapshots quotation line-item prices into SQLite table `qt_price_snapshots`.
 * Ensures regenerated/resent PDFs maintain original prices regardless of Google Sheets updates.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createPricePinning(opts) {
  opts = opts || {};
  var sqlitePath = opts.sqlitePath;
  var db = opts.db || null;

  if (!db && sqlitePath) {
    try {
      var Database = require('better-sqlite3');
      db = new Database(sqlitePath);
      db.pragma('journal_mode = WAL');
    } catch (e) {
      try {
        var BunDb = require('bun:sqlite').Database;
        db = new BunDb(sqlitePath);
      } catch (e2) {
        console.warn('[price-pinning] SQLite init skipped/failed:', e.message);
      }
    }
  }

  // Init schema
  if (db) {
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS qt_price_snapshots (' +
        '  qt_no TEXT PRIMARY KEY,' +
        '  user_id TEXT DEFAULT "",' +
        '  items_json TEXT NOT NULL,' +
        '  created_at INTEGER NOT NULL' +
        ');'
      );
    } catch (e) {
      console.error('[price-pinning] Schema init error:', e.message);
    }
  }

  function snapshotPrice(qtNo, userId, items) {
    if (!qtNo || !db || !Array.isArray(items)) return false;
    try {
      var stmt = db.prepare('INSERT OR REPLACE INTO qt_price_snapshots (qt_no, user_id, items_json, created_at) VALUES (?, ?, ?, ?)');
      stmt.run(String(qtNo).trim(), String(userId || '').trim(), JSON.stringify(items), Date.now());
      return true;
    } catch (e) {
      console.error('[price-pinning] Snapshot error:', e.message);
      return false;
    }
  }

  function getPinnedSnapshot(qtNo) {
    if (!qtNo || !db) return null;
    try {
      var row = db.prepare('SELECT items_json, created_at FROM qt_price_snapshots WHERE qt_no = ?').get(String(qtNo).trim());
      if (row && row.items_json) {
        return {
          items: JSON.parse(row.items_json),
          created_at: row.created_at
        };
      }
    } catch (e) {
      console.error('[price-pinning] Get snapshot error:', e.message);
    }
    return null;
  }

  return {
    snapshotPrice: snapshotPrice,
    getPinnedSnapshot: getPinnedSnapshot,
    db: db
  };
};
