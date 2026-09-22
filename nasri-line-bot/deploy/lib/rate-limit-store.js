/**
 * lib/rate-limit-store.js — v2.1 P4: SQLite-backed rate limiting
 *
 * Replaces the in-memory rateLimitMap (Map<string, number>) in app.js.
 * Data survives process restarts — no count loss on Passenger reload.
 *
 * Schema (in nasri.sqlite):
 *   rate_limits (user_id TEXT, action TEXT, date TEXT, count INTEGER,
 *                PRIMARY KEY (user_id, action, date))
 *
 * Window: UTC calendar day (YYYY-MM-DD). Counts reset automatically
 * when the date advances — old rows are never deleted eagerly (see purgeOld).
 *
 * Usage:
 *   var rl = require('./lib/rate-limit-store')(sqliteDb);
 *   if (!rl.check(userId, 'qt', 20)) { ... deny ... }
 *   rl.increment(userId, 'qt');
 *   var n = rl.count(userId, 'qt');
 *   rl.purgeOld();   // call once daily to remove stale rows
 *
 * Falls back to in-memory Map if sqliteDb is null/unavailable.
 *
 * ptah 𓂀 — Backend Architect | v2.1 P4 | 2026-04-13
 */
'use strict';

module.exports = function makeRateLimitStore(db) {
  // ── Prepared statements (cached on first call) ──────────────
  var _stmts = {};

  function _stmt(sql) {
    if (!_stmts[sql]) _stmts[sql] = db.prepare(sql);
    return _stmts[sql];
  }

  function _today() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  }

  // ── Fallback: in-memory Map (used when db is null) ──────────
  var _mem = new Map();
  function _memKey(userId, action) {
    return userId + ':' + _today() + ':' + action;
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * check(userId, action, max) → boolean
   * Returns true if user has NOT yet hit the max for today.
   */
  function check(userId, action, max) {
    if (!userId) return true;
    if (!db) {
      var n = _mem.get(_memKey(userId, action)) || 0;
      return n < max;
    }
    try {
      var row = _stmt(
        'SELECT count FROM rate_limits WHERE user_id = ? AND action = ? AND date = ?'
      ).get(userId, action, _today());
      return !row || row.count < max;
    } catch (e) {
      console.error('[rate-limit-store] check error:', e.message);
      return true; // fail-open on DB error (don't block users on store failure)
    }
  }

  /**
   * increment(userId, action) — atomically add 1 to today's count.
   * Uses INSERT OR REPLACE to handle first-use within the day.
   */
  function increment(userId, action) {
    if (!userId) return;
    if (!db) {
      var k = _memKey(userId, action);
      _mem.set(k, (_mem.get(k) || 0) + 1);
      return;
    }
    try {
      _stmt(`
        INSERT INTO rate_limits (user_id, action, date, count, updated_at)
        VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        ON CONFLICT(user_id, action, date)
        DO UPDATE SET count = count + 1,
                      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      `).run(userId, action, _today());
    } catch (e) {
      console.error('[rate-limit-store] increment error:', e.message);
    }
  }

  /**
   * count(userId, action) → number — today's usage count.
   */
  function count(userId, action) {
    if (!userId) return 0;
    if (!db) return _mem.get(_memKey(userId, action)) || 0;
    try {
      var row = _stmt(
        'SELECT count FROM rate_limits WHERE user_id = ? AND action = ? AND date = ?'
      ).get(userId, action, _today());
      return row ? row.count : 0;
    } catch (e) {
      console.error('[rate-limit-store] count error:', e.message);
      return 0;
    }
  }

  /**
   * purgeOld() — delete rows older than today.
   * Call once daily (e.g. midnight setInterval) to keep the table small.
   * Returns number of rows deleted.
   */
  function purgeOld() {
    if (!db) return 0;
    try {
      var info = _stmt('DELETE FROM rate_limits WHERE date < ?').run(_today());
      return info.changes;
    } catch (e) {
      console.error('[rate-limit-store] purgeOld error:', e.message);
      return 0;
    }
  }

  /**
   * getAbusers(action, threshold) → [{ user_id, count }]
   * Returns users who have exceeded threshold today — used by LN-NOTIFY rate_abuse.
   */
  function getAbusers(action, threshold) {
    if (!db) return [];
    try {
      return _stmt(`
        SELECT user_id, count FROM rate_limits
        WHERE action = ? AND date = ? AND count >= ?
        ORDER BY count DESC
      `).all(action, _today(), threshold) || [];
    } catch (e) {
      console.error('[rate-limit-store] getAbusers error:', e.message);
      return [];
    }
  }

  return { check, increment, count, purgeOld, getAbusers };
};
