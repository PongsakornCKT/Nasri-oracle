'use strict';

/**
 * push-quota-ledger.js — R4 LINE Push Quota Ledger & Outbound Queue (#R4)
 * Tracks LINE push API quota usage per-category (qt, bom, alert, reminder).
 * Alerts admin at 80% quota usage. Queues messages instead of dropping when quota hits 100%.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createPushQuotaLedger(opts) {
  opts = opts || {};
  var sqlitePath = opts.sqlitePath;
  var db = opts.db || null;
  var quotaLimit = opts.quotaLimit || parseInt(process.env.LINE_PUSH_QUOTA || '500', 10);
  var notifyAdminFn = typeof opts.notifyAdmin === 'function' ? opts.notifyAdmin : function() { return Promise.resolve(); };

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
        console.warn('[push-quota-ledger] SQLite init skipped/failed:', e.message);
      }
    }
  }

  // Init tables schema
  if (db) {
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS push_ledger (' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  category TEXT NOT NULL,' +        // "qt" | "bom" | "alert" | "reminder"
        '  target_id TEXT NOT NULL,' +
        '  created_at INTEGER NOT NULL,' +
        '  month_key TEXT NOT NULL' +        // "2026-08"
        ');' +
        'CREATE TABLE IF NOT EXISTS push_outbound_queue (' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  category TEXT NOT NULL,' +
        '  target_id TEXT NOT NULL,' +
        '  payload TEXT NOT NULL,' +
        '  queued_at INTEGER NOT NULL' +
        ');'
      );
    } catch (e) {
      console.error('[push-quota-ledger] Schema init error:', e.message);
    }
  }

  function getMonthKey() {
    var d = new Date();
    var m = (d.getMonth() + 1).toString();
    if (m.length === 1) m = '0' + m;
    return d.getFullYear() + '-' + m;
  }

  function getMonthlyUsage() {
    if (!db) return 0;
    try {
      var mKey = getMonthKey();
      var row = db.prepare('SELECT count(*) as c FROM push_ledger WHERE month_key = ?').get(mKey);
      return row ? (row.c || 0) : 0;
    } catch (e) {
      return 0;
    }
  }

  var _alert80Sent = false;

  function canSendPush() {
    var usage = getMonthlyUsage();
    return usage < quotaLimit;
  }

  function recordAndCheckPush(category, targetId, payload) {
    category = (category || 'general').toLowerCase();
    targetId = targetId || '';
    var mKey = getMonthKey();
    var currentUsage = getMonthlyUsage();

    // 1. Quota Exceeded (>= 100%) -> Queue message instead of dropping!
    if (currentUsage >= quotaLimit) {
      if (db) {
        try {
          var qStmt = db.prepare('INSERT INTO push_outbound_queue (category, target_id, payload, queued_at) VALUES (?, ?, ?, ?)');
          qStmt.run(category, targetId, typeof payload === 'string' ? payload : JSON.stringify(payload), Date.now());
        } catch (e) {}
      }
      return { allowed: false, queued: true, current_usage: currentUsage, quota_limit: quotaLimit };
    }

    // 2. Record Push in Ledger
    if (db) {
      try {
        var stmt = db.prepare('INSERT INTO push_ledger (category, target_id, created_at, month_key) VALUES (?, ?, ?, ?)');
        stmt.run(category, targetId, Date.now(), mKey);
      } catch (e) {}
    }

    var newUsage = currentUsage + 1;

    // 3. 80% Quota Threshold Alert
    if (newUsage >= Math.floor(quotaLimit * 0.80) && !_alert80Sent) {
      _alert80Sent = true;
      var alertText = '⚠️ [LINE PUSH QUOTA ALERT] Monthly push usage hit ' + newUsage + '/' + quotaLimit + ' (80% threshold)!';
      notifyAdminFn(alertText).catch(function() {});
    }

    return { allowed: true, queued: false, current_usage: newUsage, quota_limit: quotaLimit };
  }

  return {
    canSendPush: canSendPush,
    recordAndCheckPush: recordAndCheckPush,
    getMonthlyUsage: getMonthlyUsage,
    quotaLimit: quotaLimit,
    db: db
  };
};
