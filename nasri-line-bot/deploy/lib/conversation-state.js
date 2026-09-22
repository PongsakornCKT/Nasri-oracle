/**
 * conversation-state.js — LN-STATE: CJS mirror of conversation-state.ts
 *
 * Uses better-sqlite3 (already a dep of nasri-line-bot) to read/write
 * conversation_states table in the same nasri.sqlite that app.js uses.
 *
 * API mirrors scripts/enervia/conversation-state.ts exactly:
 *   getState(userKey)                   → ConversationState | null
 *   setState(userKey, update)           → ConversationState
 *   clearPending(userKey)               → void
 *   setLastQuotation(userKey, qtId)     → void
 *   cleanExpired()                      → number (rows deleted)
 *
 * ra ☀️ — AI Engineer | 2026-04-13
 */

'use strict';

var EXPIRE_MINUTES = 30;

var DDL = [
  "CREATE TABLE IF NOT EXISTS conversation_states (",
  "  user_key           TEXT PRIMARY KEY,",
  "  last_quotation_id  TEXT,",
  "  pending_action     TEXT,",
  "  pending_params     TEXT DEFAULT '{}',",
  "  turn_count         INTEGER DEFAULT 0,",
  "  updated_at         TEXT DEFAULT (datetime('now'))",
  ");",
  "CREATE INDEX IF NOT EXISTS idx_cs_updated ON conversation_states(updated_at);",
].join('\n');

module.exports = function createConvState(opts) {
  opts = opts || {};
  var db = opts.db;  // better-sqlite3 Database instance — required

  if (!db) throw new Error('conversation-state: db option required');

  // Ensure table exists (idempotent)
  try { db.exec(DDL); } catch(e) { /* already exists */ }

  // ── getState ────────────────────────────────────────────────

  function getState(userKey) {
    var row;
    try {
      row = db.prepare(
        "SELECT user_key, last_quotation_id, pending_action, pending_params, turn_count, updated_at " +
        "FROM conversation_states " +
        "WHERE user_key = ? AND datetime(updated_at) >= datetime('now', ? || ' minutes')"
      ).get(userKey, String(-EXPIRE_MINUTES));
    } catch(e) {
      console.error('[conv-state] getState error:', e.message);
      return null;
    }
    if (!row) return null;

    var params = {};
    try { params = JSON.parse(row.pending_params || '{}'); } catch(e) {}

    return {
      user_key:          row.user_key,
      last_quotation_id: row.last_quotation_id || null,
      pending_action:    row.pending_action || null,
      pending_params:    params,
      turn_count:        row.turn_count || 0,
      updated_at:        row.updated_at,
    };
  }

  // ── setState ────────────────────────────────────────────────

  function setState(userKey, update) {
    update = update || {};
    var cur = getState(userKey);

    var lastQt     = 'last_quotation_id' in update ? update.last_quotation_id : (cur ? cur.last_quotation_id : null);
    var pending    = 'pending_action'    in update ? update.pending_action    : (cur ? cur.pending_action    : null);
    var params     = 'pending_params'    in update ? update.pending_params    : (cur ? cur.pending_params    : {});
    var turnCount  = (cur ? cur.turn_count : 0) + 1;

    try {
      db.prepare(
        "INSERT INTO conversation_states " +
        "  (user_key, last_quotation_id, pending_action, pending_params, turn_count, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, datetime('now')) " +
        "ON CONFLICT(user_key) DO UPDATE SET " +
        "  last_quotation_id = excluded.last_quotation_id, " +
        "  pending_action    = excluded.pending_action, " +
        "  pending_params    = excluded.pending_params, " +
        "  turn_count        = excluded.turn_count, " +
        "  updated_at        = datetime('now')"
      ).run(
        userKey,
        lastQt || null,
        pending || null,
        JSON.stringify(params || {}),
        turnCount
      );
    } catch(e) {
      console.error('[conv-state] setState error:', e.message);
    }

    return {
      user_key:          userKey,
      last_quotation_id: lastQt || null,
      pending_action:    pending || null,
      pending_params:    params || {},
      turn_count:        turnCount,
      updated_at:        new Date().toISOString(),
    };
  }

  // ── clearPending ────────────────────────────────────────────

  function clearPending(userKey) {
    try {
      db.prepare(
        "UPDATE conversation_states " +
        "SET pending_action = NULL, pending_params = '{}', updated_at = datetime('now') " +
        "WHERE user_key = ?"
      ).run(userKey);
    } catch(e) {
      console.error('[conv-state] clearPending error:', e.message);
    }
  }

  // ── setLastQuotation ────────────────────────────────────────

  function setLastQuotation(userKey, quotationId) {
    setState(userKey, { last_quotation_id: quotationId });
  }

  // ── cleanExpired ────────────────────────────────────────────

  function cleanExpired() {
    try {
      var res = db.prepare(
        "DELETE FROM conversation_states WHERE datetime(updated_at) < datetime('now', ? || ' minutes')"
      ).run(String(-EXPIRE_MINUTES));
      return res.changes;
    } catch(e) {
      console.error('[conv-state] cleanExpired error:', e.message);
      return 0;
    }
  }

  return { getState: getState, setState: setState, clearPending: clearPending, setLastQuotation: setLastQuotation, cleanExpired: cleanExpired };
};
