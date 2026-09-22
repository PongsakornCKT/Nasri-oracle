/**
 * lib/bom-cache-store.js — v2.1 P5: SQLite-backed BOM result cache (TTL 1h)
 *
 * Caches full BOM JSON in nasri.sqlite bom_cache table.
 * Avoids re-running Python PDF generator for identical specs within 1 hour.
 *
 * Cache key: SHA-1 hex of the canonical JSON-serialised request params.
 * TTL: 1 hour from creation. Expired entries purged lazily on get() or by purge().
 *
 * Schema:
 *   bom_cache (cache_key TEXT PK, bom_json TEXT, source_key TEXT,
 *              created_at TEXT, expires_at TEXT)
 *
 * Usage:
 *   var bomCache = require('./lib/bom-cache-store')(sqliteDb);
 *   var hit = bomCache.get(cacheKey);
 *   if (!hit) { ... generate ... bomCache.set(cacheKey, data, sourceKey); }
 *   bomCache.purge();   // call hourly
 *
 * ptah 𓂀 — Backend Architect | v2.1 P5 | 2026-04-13
 */
'use strict';

var crypto = require('crypto');

/**
 * makeKey(params) — deterministic SHA-1 key from an arbitrary params object.
 * Sorts keys before serialising to ensure { a:1, b:2 } === { b:2, a:1 }.
 */
function makeKey(params) {
  var sorted = JSON.stringify(params, Object.keys(params).sort());
  return crypto.createHash('sha1').update(sorted).digest('hex');
}

module.exports = function makeBomCacheStore(db) {
  var _stmts = {};
  function _stmt(sql) {
    if (!_stmts[sql]) _stmts[sql] = db.prepare(sql);
    return _stmts[sql];
  }

  var TTL_HOURS = 1;

  /**
   * get(cacheKey) → parsed object | null
   * Returns null if not found or expired (expired row is deleted on read).
   */
  function get(cacheKey) {
    if (!db || !cacheKey) return null;
    try {
      var now = new Date().toISOString();
      var row = _stmt(
        "SELECT bom_json, expires_at FROM bom_cache WHERE cache_key = ?"
      ).get(cacheKey);

      if (!row) return null;

      if (row.expires_at <= now) {
        // Lazy expiry — delete stale entry
        _stmt("DELETE FROM bom_cache WHERE cache_key = ?").run(cacheKey);
        return null;
      }

      return JSON.parse(row.bom_json);
    } catch (e) {
      console.error('[bom-cache-store] get error:', e.message);
      return null;
    }
  }

  /**
   * set(cacheKey, data, sourceKey?) — store data for TTL_HOURS.
   * Replaces any existing entry with the same key.
   */
  function set(cacheKey, data, sourceKey) {
    if (!db || !cacheKey) return;
    try {
      var now = new Date();
      var expires = new Date(now.getTime() + TTL_HOURS * 3600 * 1000);
      _stmt(`
        INSERT OR REPLACE INTO bom_cache (cache_key, bom_json, source_key, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        cacheKey,
        JSON.stringify(data),
        sourceKey || null,
        now.toISOString(),
        expires.toISOString()
      );
    } catch (e) {
      console.error('[bom-cache-store] set error:', e.message);
    }
  }

  /**
   * invalidate(sourceKey) — remove all cache entries for a LINE user/group.
   * Call when the user explicitly updates their BOM or catalog changes.
   */
  function invalidate(sourceKey) {
    if (!db || !sourceKey) return 0;
    try {
      var info = _stmt("DELETE FROM bom_cache WHERE source_key = ?").run(sourceKey);
      return info.changes;
    } catch (e) {
      console.error('[bom-cache-store] invalidate error:', e.message);
      return 0;
    }
  }

  /**
   * purge() — delete all expired entries. Call hourly.
   * Returns number of rows deleted.
   */
  function purge() {
    if (!db) return 0;
    try {
      var info = _stmt(
        "DELETE FROM bom_cache WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ','now')"
      ).run();
      return info.changes;
    } catch (e) {
      console.error('[bom-cache-store] purge error:', e.message);
      return 0;
    }
  }

  return { makeKey, get, set, invalidate, purge };
};
