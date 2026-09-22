'use strict';

/**
 * webhook-dedup.js — R2 Webhook Redelivery Dedup (#R2)
 * Prevents duplicate execution when LINE retries webhook requests.
 * Uses SQLite table `processed_events` with automatic 7-day TTL cleanup.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createWebhookDedup(opts) {
  opts = opts || {};
  var sqlitePath = opts.sqlitePath;
  var db = opts.db || null;
  var ttlDays = opts.ttlDays || 7;
  var ttlMs = ttlDays * 24 * 60 * 60 * 1000;

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
        console.warn('[webhook-dedup] SQLite init skipped/failed:', e.message);
      }
    }
  }

  // Init table schema
  if (db) {
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS processed_events (' +
        '  event_id TEXT PRIMARY KEY,' +
        '  event_type TEXT DEFAULT "",' +
        '  processed_at INTEGER NOT NULL' +
        ');'
      );
    } catch (e) {
      console.error('[webhook-dedup] Schema init error:', e.message);
    }
  }

  /**
   * Check if event has already been processed.
   * If not processed, records event_id and returns false (allow processing).
   * If already processed, returns true (duplicate -> skip processing).
   *
   * @param {string} eventId LINE webhookEventId or event identifier
   * @param {string} eventType e.g. "message", "postback"
   * @returns {boolean} true if duplicate (already processed), false if new
   */
  function isDuplicateAndRecord(eventId, eventType) {
    if (!eventId || !db) return false;

    try {
      // 1. Check if eventId exists
      var existing = db.prepare('SELECT processed_at FROM processed_events WHERE event_id = ?').get(eventId);
      if (existing) {
        return true; // Duplicate!
      }

      // 2. Record new eventId
      var stmt = db.prepare('INSERT OR IGNORE INTO processed_events (event_id, event_type, processed_at) VALUES (?, ?, ?)');
      stmt.run(String(eventId).trim(), (eventType || '').trim(), Date.now());
      return false; // New event processed cleanly
    } catch (e) {
      console.error('[webhook-dedup] Error checking eventId:', e.message);
      return false; // Degrade gracefully on DB error
    }
  }

  /**
   * Clean up old processed events (> 7 days) to prevent DB bloat.
   */
  function cleanupOldEvents() {
    if (!db) return 0;
    try {
      var cutoff = Date.now() - ttlMs;
      var stmt = db.prepare('DELETE FROM processed_events WHERE processed_at < ?');
      var res = stmt.run(cutoff);
      return res && res.changes ? res.changes : 0;
    } catch (e) {
      console.error('[webhook-dedup] Cleanup error:', e.message);
      return 0;
    }
  }

  return {
    isDuplicateAndRecord: isDuplicateAndRecord,
    cleanupOldEvents: cleanupOldEvents,
    db: db
  };
};
