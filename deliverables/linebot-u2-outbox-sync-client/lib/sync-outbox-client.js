'use strict';

/**
 * sync-outbox-client.js — U2 Outbox Queue & Sync Client (#Phase04)
 * Enqueues generated QTs and flushes them to survey.enervia.co.th dashboard sync endpoint.
 * Features: Retry backoff (1m/5m/30m), dead-lettering after 5 attempts + notifyAdmin.
 *
 * STRICT RULE: Test suite uses MOCK fetch; NEVER hit live endpoints!
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createSyncOutboxClient(opts) {
  opts = opts || {};
  var sqlitePath = opts.sqlitePath;
  var db = opts.db || null;
  var fetchFn = opts.fetchFn || globalThis.fetch;
  var notifyAdminFn = typeof opts.notifyAdmin === 'function' ? opts.notifyAdmin : function() { return Promise.resolve(); };
  var botSecret = opts.botSecret || process.env.LF_BOT_SECRET || 'test_bot_secret_123';
  var syncEndpoint = opts.syncEndpoint || 'https://survey.enervia.co.th/wp-json/lf/v1/quotes/sync';

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
        console.warn('[sync-outbox-client] SQLite init skipped/failed:', e.message);
      }
    }
  }

  // Init table schema
  if (db) {
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS sync_outbox (' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  qt_no TEXT UNIQUE NOT NULL,' +
        '  payload_json TEXT NOT NULL,' +
        '  status TEXT DEFAULT "pending",' + // "pending" | "synced" | "dead_letter"
        '  retry_count INTEGER DEFAULT 0,' +
        '  next_retry_at INTEGER DEFAULT 0,' +
        '  created_at INTEGER NOT NULL' +
        ');'
      );
    } catch (e) {
      console.error('[sync-outbox-client] Schema init error:', e.message);
    }
  }

  function enqueueQuotation(qtNo, payload) {
    if (!qtNo || !payload || !db) return false;
    try {
      var stmt = db.prepare('INSERT OR REPLACE INTO sync_outbox (qt_no, payload_json, status, retry_count, next_retry_at, created_at) VALUES (?, ?, "pending", 0, 0, ?)');
      stmt.run(String(qtNo).trim(), JSON.stringify(payload), Date.now());
      return true;
    } catch (e) {
      console.error('[sync-outbox-client] Enqueue error:', e.message);
      return false;
    }
  }

  function getBackoffMs(retryCount) {
    if (retryCount === 1) return 1 * 60 * 1000;       // 1 min
    if (retryCount === 2) return 5 * 60 * 1000;       // 5 min
    return 30 * 60 * 1000;                            // 30 min
  }

  async function flushOutbox() {
    if (!db) return { flushed: 0, failed: 0 };
    var now = Date.now();

    var pendingRows = [];
    try {
      pendingRows = db.prepare('SELECT * FROM sync_outbox WHERE status = "pending" AND next_retry_at <= ? LIMIT 10').all(now);
    } catch (e) {
      return { flushed: 0, failed: 0, error: e.message };
    }

    var flushed = 0;
    var failed = 0;

    for (var i = 0; i < pendingRows.length; i++) {
      var row = pendingRows[i];
      try {
        var res = await fetchFn(syncEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-LF-Bot-Secret': botSecret
          },
          body: row.payload_json
        });

        if (res && (res.ok || res.status === 200 || res.status === 201)) {
          db.prepare('UPDATE sync_outbox SET status = "synced" WHERE id = ?').run(row.id);
          flushed++;
        } else {
          throw new Error('HTTP ' + (res ? res.status : 'no response'));
        }
      } catch (err) {
        failed++;
        var newRetries = (row.retry_count || 0) + 1;
        if (newRetries >= 5) {
          db.prepare('UPDATE sync_outbox SET status = "dead_letter", retry_count = ? WHERE id = ?').run(newRetries, row.id);
          notifyAdminFn('🚨 [SYNC DEAD-LETTER] Quotation ' + row.qt_no + ' failed sync 5 times. Error: ' + err.message).catch(function() {});
        } else {
          var nextTry = Date.now() + getBackoffMs(newRetries);
          db.prepare('UPDATE sync_outbox SET retry_count = ?, next_retry_at = ? WHERE id = ?').run(newRetries, nextTry, row.id);
        }
      }
    }

    return { flushed: flushed, failed: failed, total_pending: pendingRows.length };
  }

  return {
    enqueueQuotation: enqueueQuotation,
    flushOutbox: flushOutbox,
    db: db
  };
};
