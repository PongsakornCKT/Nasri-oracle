'use strict';

// ─── Quote Follow-up Engine + วางบิล (nasri-oa-v2 Phase 06) ───
// กติกาธุรกิจ (พี่พง 2026-08-12, business-questions.md B7/B8 — ห้ามเพี้ยน):
//   - อายุใบเสนอราคา 15 วัน (auto-expire)
//   - เตือน follow-up ทุก 3 วัน จนกว่าจะปิด (accepted/rejected) หรือหมดอายุ
//   - วางบิล: sale เจ้าของใบทำเองได้ (หรือ admin)
//
// Schema note: two competing "quotations" table shapes exist in this
// codebase's history — the rich one from scripts/enervia/migrate-v2.ts
// (id=QT number TEXT PK, status, created_by, created_at) and a legacy
// simple one from lib/persistence.js (autoincrement id, quote_number,
// user_id, ts). This module works against WHICHEVER is actually live in
// the target db via PRAGMA table_info() column detection, and adds the
// columns it needs (status/last_reminded_at/billed/billed_at/billed_by)
// with ALTER TABLE ADD COLUMN if missing — additive only, never drops
// or renames existing columns.
//
// Usage:
//   var followup = require('./lib/quote-followup')({
//     db: _persistence.sqliteDb,
//     lPush: lPush,              // (to, msgs, category) — already quota-ledger-wrapped
//     auditLog: auditLog,
//     notifyAdmin: notifyAdmin,
//     isAdminUser: isAdminUser,
//   });
//   await followup.runFollowupSweep();          // cron job body
//   await followup.markBilled(qtId, userId);    // "วางบิล <QT id>" handler

var REMINDER_DAYS = 3;
var EXPIRE_DAYS = 15;
var DAY_MS = 24 * 60 * 60 * 1000;

module.exports = function createQuoteFollowup(opts) {
  opts = opts || {};
  var db = opts.db;
  var lPushFn = typeof opts.lPush === 'function' ? opts.lPush : function() { return Promise.resolve(); };
  var auditLogFn = typeof opts.auditLog === 'function' ? opts.auditLog : function() {};
  var notifyAdminFn = typeof opts.notifyAdmin === 'function' ? opts.notifyAdmin : function() { return Promise.resolve(); };
  var isAdminUserFn = typeof opts.isAdminUser === 'function' ? opts.isAdminUser : function() { return false; };
  var clock = typeof opts.now === 'function' ? opts.now : function() { return Date.now(); };

  var _schemaEnsured = false;
  var _cols = null;

  function ensureSchema() {
    if (!db) return [];
    if (_schemaEnsured && _cols) return _cols;
    var cols = db.prepare('PRAGMA table_info(quotations)').all().map(function(c) { return c.name; });
    function addCol(name, def) {
      if (cols.indexOf(name) === -1) {
        try {
          db.exec('ALTER TABLE quotations ADD COLUMN ' + name + ' ' + def);
          cols.push(name);
        } catch (e) { /* concurrent add or already exists — non-fatal */ }
      }
    }
    addCol('status', "TEXT DEFAULT 'draft'");
    addCol('last_reminded_at', 'TEXT');
    addCol('billed', 'INTEGER DEFAULT 0');
    addCol('billed_at', 'TEXT');
    addCol('billed_by', 'TEXT');
    _cols = cols;
    _schemaEnsured = true;
    return cols;
  }

  function idCol(cols) { return cols.indexOf('quote_number') !== -1 ? 'quote_number' : 'id'; }
  function ownerCol(cols) { return cols.indexOf('created_by') !== -1 ? 'created_by' : 'user_id'; }
  function tsCol(cols) { return cols.indexOf('created_at') !== -1 ? 'created_at' : 'ts'; }

  function parseTs(ts) {
    var t = Date.parse(ts);
    return isNaN(t) ? null : t;
  }

  function ageDays(nowMs, createdTs) {
    var created = parseTs(createdTs);
    if (created === null) return null;
    return (nowMs - created) / DAY_MS;
  }

  // ── Follow-up sweep — cron job body (/api/cron/followup) ──────────
  // Returns a summary object for logging/testing; never throws (each
  // row's push failure is isolated so one bad push doesn't kill the sweep).
  async function runFollowupSweep() {
    if (!db) return { scanned: 0, reminded: 0, expired: 0, errors: 0 };
    var cols = ensureSchema();
    var idC = idCol(cols), ownerC = ownerCol(cols), tsC = tsCol(cols);
    var now = clock();

    var rows;
    try {
      rows = db.prepare(
        'SELECT ' + idC + ' AS qt_id, ' + ownerC + ' AS owner, ' + tsC + ' AS created_ts, ' +
        'status, last_reminded_at, customer_name FROM quotations ' +
        "WHERE status IS NULL OR status NOT IN ('accepted', 'rejected', 'expired')"
      ).all();
    } catch (e) {
      console.error('[quote-followup] sweep query error:', e.message);
      return { scanned: 0, reminded: 0, expired: 0, errors: 1 };
    }

    var reminded = 0, expiredCount = 0, errors = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var age = ageDays(now, row.created_ts);
      if (age === null || age < REMINDER_DAYS) continue;
      if (!row.owner) continue; // no sale to notify

      var lastRemindedMs = row.last_reminded_at ? parseTs(row.last_reminded_at) : null;
      var dueForReminder = lastRemindedMs === null || (now - lastRemindedMs) >= REMINDER_DAYS * DAY_MS;
      if (!dueForReminder) continue;

      var nowIso = new Date(now).toISOString();

      try {
        if (age >= EXPIRE_DAYS) {
          db.prepare('UPDATE quotations SET status = ?, last_reminded_at = ? WHERE ' + idC + ' = ?')
            .run('expired', nowIso, row.qt_id);
          await lPushFn(row.owner, [{
            type: 'text',
            text: '⏰ ใบเสนอราคา ' + row.qt_id + (row.customer_name ? ' (' + row.customer_name + ')' : '') +
              ' หมดอายุแล้ว (เกิน ' + EXPIRE_DAYS + ' วัน) — ระบบตั้งสถานะ "expired" ให้อัตโนมัติ',
          }], 'reminder');
          auditLogFn('quote_expired', row.owner, row.qt_id);
          expiredCount++;
        } else {
          db.prepare('UPDATE quotations SET last_reminded_at = ? WHERE ' + idC + ' = ?')
            .run(nowIso, row.qt_id);
          var daysLeft = Math.max(0, Math.ceil(EXPIRE_DAYS - age));
          await lPushFn(row.owner, [{
            type: 'text',
            text: '🔔 ใบเสนอราคา ' + row.qt_id + (row.customer_name ? ' (' + row.customer_name + ')' : '') +
              ' ยังไม่ปิด (' + Math.floor(age) + ' วัน) — เหลือ ' + daysLeft + ' วันก่อนหมดอายุ ลอง follow up ลูกค้าดูครับ',
          }], 'reminder');
          auditLogFn('quote_reminder_sent', row.owner, row.qt_id);
          reminded++;
        }
      } catch (e) {
        console.error('[quote-followup] row error for', row.qt_id, ':', e.message);
        errors++;
      }
    }

    var summary = { scanned: rows.length, reminded: reminded, expired: expiredCount, errors: errors };
    if (errors > 0) {
      notifyAdminFn('⚠️ [quote-followup] sweep finished with ' + errors + ' error(s) — scanned=' + rows.length).catch(function() {});
    }
    return summary;
  }

  // ── วางบิล <QT id> — sale เจ้าของใบเองได้ หรือ admin ─────────────
  async function markBilled(qtId, userId) {
    if (!db) return { ok: false, error: 'no db' };
    var cols = ensureSchema();
    var idC = idCol(cols), ownerC = ownerCol(cols);

    var row;
    try {
      row = db.prepare('SELECT ' + idC + ' AS qt_id, ' + ownerC + ' AS owner, billed FROM quotations WHERE ' + idC + ' = ?').get(qtId);
    } catch (e) {
      return { ok: false, error: 'query error: ' + e.message };
    }
    if (!row) return { ok: false, error: 'not_found' };

    if (row.owner && row.owner !== userId && !isAdminUserFn(userId)) {
      auditLogFn('billing_denied', userId, qtId);
      return { ok: false, error: 'forbidden' };
    }
    if (row.billed) {
      return { ok: false, error: 'already_billed' };
    }

    var nowIso = new Date(clock()).toISOString();
    try {
      db.prepare('UPDATE quotations SET billed = 1, billed_at = ?, billed_by = ? WHERE ' + idC + ' = ?')
        .run(nowIso, userId, qtId);
    } catch (e) {
      return { ok: false, error: 'write error: ' + e.message };
    }

    auditLogFn('quote_billed', userId, qtId);

    var to = row.owner || userId;
    await lPushFn(to, [{
      type: 'text',
      text: '💰 วางบิลแล้ว: ' + qtId + '\nโดย: ' + userId + '\nเวลา: ' + nowIso,
    }], 'billing');

    return { ok: true, qt_id: qtId, billed_at: nowIso, billed_by: userId };
  }

  return {
    runFollowupSweep: runFollowupSweep,
    markBilled: markBilled,
    ensureSchema: ensureSchema,
    REMINDER_DAYS: REMINDER_DAYS,
    EXPIRE_DAYS: EXPIRE_DAYS,
  };
};
