/**
 * lib/oa-allowlist.js — sobek Phase 07: OA allowlist (log-only default) +
 * enforce gate, behind flag (P'Phong approved, default OFF).
 *
 * Business rule (P'Phong): OA ใช้ได้เฉพาะ user ที่ register ใน
 * survey.enervia.co.th. Phase 07 shipped log-only (observe + count).
 * This follow-up adds the actual gate — env `OA_ENFORCE=1` turns it on.
 * Default stays OFF: deployed behavior does not change until someone
 * explicitly sets the env var. Lesson from a prior rollout: always log
 * before you block, and never let a deploy silently start blocking.
 *
 * Two allow-sources, either is enough:
 *   1. env OA_ALLOWED_USERS — comma-separated LINE userIds
 *   2. SQLite table oa_allowlist(user_id) — empty for now, reserved for a
 *      future WP → SQLite sync (survey.enervia.co.th registrants)
 *
 * Schema (in nasri.sqlite):
 *   oa_allowlist  (user_id TEXT PRIMARY KEY, source TEXT, added_at INTEGER)
 *   oa_access_log (id INTEGER PK AUTOINCREMENT, user_id TEXT, in_list INTEGER,
 *                  event_type TEXT, ts INTEGER)
 *
 * Usage:
 *   var oaAllowlist = require('./lib/oa-allowlist')(sqliteAvailable ? sqliteDb : null, {
 *     envList: process.env.OA_ALLOWED_USERS
 *   });
 *   oaAllowlist.logAccess(userId, ev.type);      // every webhook event — never blocks
 *   oaAllowlist.report(30);                      // 30-day in/out summary for admin
 *   oaAllowlist.isEnforced();                    // OA_ENFORCE === '1' — read live, not cached
 *   oaAllowlist.isAllowlistEmpty();               // true = enforce ON here would lock out everyone but admin
 *
 * Falls back to an in-memory Map/array if db is null (dev/no-sqlite).
 *
 * sobek 𓂀 — Security Engineer | Phase 07 (log-only) + enforce follow-up | 2026-08-12
 */
'use strict';

module.exports = function makeOaAllowlist(db, opts) {
  opts = opts || {};

  function parseEnvList(raw) {
    return (raw || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  }
  var envList = parseEnvList(opts.envList !== undefined ? opts.envList : process.env.OA_ALLOWED_USERS);
  var envSet = {};
  envList.forEach(function(id) { envSet[id] = true; });

  var _stmts = {};
  function _stmt(sql) {
    if (!_stmts[sql]) _stmts[sql] = db.prepare(sql);
    return _stmts[sql];
  }

  // ── In-memory fallback (no sqlite) ──────────────────────────
  var _memAllowlist = {};   // user_id -> true
  var _memLog = [];         // { user_id, in_list, event_type, ts }

  if (db) {
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS oa_allowlist (' +
        '  user_id TEXT PRIMARY KEY,' +
        '  source TEXT DEFAULT "manual",' +
        '  added_at INTEGER NOT NULL' +
        ');'
      );
      db.exec(
        'CREATE TABLE IF NOT EXISTS oa_access_log (' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  user_id TEXT NOT NULL,' +
        '  in_list INTEGER NOT NULL,' +
        '  event_type TEXT,' +
        '  ts INTEGER NOT NULL' +
        ');'
      );
      db.exec('CREATE INDEX IF NOT EXISTS idx_oa_access_log_ts ON oa_access_log (ts);');
    } catch (e) {
      console.error('[oa-allowlist] Schema init error:', e.message);
    }
  }

  function isInSqliteAllowlist(userId) {
    if (!db) return false;
    try {
      var row = _stmt('SELECT 1 FROM oa_allowlist WHERE user_id = ?').get(userId);
      return !!row;
    } catch (e) {
      return false;
    }
  }

  function isAllowed(userId) {
    if (!userId) return false;
    if (envSet[userId]) return true;
    if (db) return isInSqliteAllowlist(userId);
    return !!_memAllowlist[userId];
  }

  /** Read live (not cached at module-load) — env can flip without a restart-sensitive cache going stale mid-run. */
  function isEnforced() {
    return (opts.enforceFlag !== undefined ? opts.enforceFlag : process.env.OA_ENFORCE) === '1';
  }

  /** True if BOTH allow-sources are empty — enforcing here blocks everyone but admin. Callers should log loudly. */
  function isAllowlistEmpty() {
    if (envList.length > 0) return false;
    if (db) {
      try {
        var row = _stmt('SELECT COUNT(*) as n FROM oa_allowlist').get();
        return !row || row.n === 0;
      } catch (e) {
        return true; // can't confirm — assume worst case (empty) so the warning fires
      }
    }
    return Object.keys(_memAllowlist).length === 0;
  }

  /**
   * Log-only hook — call on every webhook event. Never returns a value
   * callers should branch on for blocking; it exists purely to observe.
   */
  function logAccess(userId, eventType) {
    if (!userId) return;
    var inList = isAllowed(userId) ? 1 : 0;
    var ts = Date.now();
    if (db) {
      try {
        _stmt('INSERT INTO oa_access_log (user_id, in_list, event_type, ts) VALUES (?, ?, ?, ?)')
          .run(userId, inList, eventType || '', ts);
      } catch (e) {
        console.error('[oa-allowlist] logAccess error:', e.message);
      }
    } else {
      _memLog.push({ user_id: userId, in_list: inList, event_type: eventType || '', ts: ts });
      if (_memLog.length > 5000) _memLog.shift(); // bound memory in fallback mode
    }
  }

  /** 30-day (default) summary of who hit the bot, split in/out of the allowlist. */
  function report(days) {
    var windowDays = days || 30;
    var cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    var rows;
    if (db) {
      try {
        rows = _stmt(
          'SELECT user_id, in_list, COUNT(*) as hits, MAX(ts) as last_seen ' +
          'FROM oa_access_log WHERE ts >= ? GROUP BY user_id, in_list ORDER BY hits DESC'
        ).all(cutoff);
      } catch (e) {
        rows = [];
      }
    } else {
      var byUser = {};
      _memLog.filter(function(r) { return r.ts >= cutoff; }).forEach(function(r) {
        var key = r.user_id + ':' + r.in_list;
        if (!byUser[key]) byUser[key] = { user_id: r.user_id, in_list: r.in_list, hits: 0, last_seen: 0 };
        byUser[key].hits++;
        byUser[key].last_seen = Math.max(byUser[key].last_seen, r.ts);
      });
      rows = Object.keys(byUser).map(function(k) { return byUser[k]; }).sort(function(a, b) { return b.hits - a.hits; });
    }
    var inList = rows.filter(function(r) { return r.in_list; });
    var outList = rows.filter(function(r) { return !r.in_list; });
    var totalEvents = rows.reduce(function(sum, r) { return sum + r.hits; }, 0);
    return {
      windowDays: windowDays,
      totalEvents: totalEvents,
      inList: inList,
      outList: outList,
      distinctUsers: rows.length,
    };
  }

  /** Admin-facing text summary for the "allowlist report" command. */
  function formatReport(days) {
    var r = report(days);
    var enforceState = isEnforced() ? '🔴 ENFORCE ON' : '⚪ log-only (enforce OFF)';
    var lines = [
      '📋 Allowlist Report (' + r.windowDays + 'd) — ' + enforceState,
      'ผู้ใช้ทั้งหมด: ' + r.distinctUsers + ' คน / ' + r.totalEvents + ' events',
      '',
      '✅ ใน list (' + r.inList.length + '):',
    ];
    r.inList.slice(0, 20).forEach(function(row) {
      lines.push('  ' + row.user_id + ' — ' + row.hits + ' hits');
    });
    if (r.inList.length > 20) lines.push('  … +' + (r.inList.length - 20) + ' more');
    lines.push('');
    lines.push('❌ นอก list (' + r.outList.length + '):');
    r.outList.slice(0, 20).forEach(function(row) {
      lines.push('  ' + row.user_id + ' — ' + row.hits + ' hits');
    });
    if (r.outList.length > 20) lines.push('  … +' + (r.outList.length - 20) + ' more');
    return lines.join('\n');
  }

  return {
    isAllowed: isAllowed,
    logAccess: logAccess,
    report: report,
    formatReport: formatReport,
    isEnforced: isEnforced,
    isAllowlistEmpty: isAllowlistEmpty,
  };
};
