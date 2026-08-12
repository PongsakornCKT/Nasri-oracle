'use strict';

/**
 * winloss-tracker.js — T6 Win/Loss Deal Tracking Engine (#B9)
 * Tracks win/loss status and reason taxonomy for quotations in SQLite `qt_outcomes`.
 * P'Phong Decision B9 Taxonomy:
 *   1. "แพง" (price_too_high)
 *   2. "คู่แข่ง" (lost_to_competitor)
 *   3. "เลื่อน" (project_postponed)
 *   4. "อื่นๆ" (other)
 *
 * Calculates real close rate for Admin LINE command "close rate" (removing fake 0.72).
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createWinLossTracker(opts) {
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
        console.warn('[winloss-tracker] SQLite init skipped/failed:', e.message);
      }
    }
  }

  // Init table schema
  if (db) {
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS qt_outcomes (' +
        '  qt_no TEXT PRIMARY KEY,' +
        '  status TEXT NOT NULL,' +          // "win" | "loss"
        '  category TEXT NOT NULL,' +        // "won" | "แพง" | "คู่แข่ง" | "เลื่อน" | "อื่นๆ"
        '  reason_note TEXT DEFAULT "",' +
        '  user_id TEXT DEFAULT "",' +
        '  closed_at INTEGER NOT NULL' +
        ');'
      );
    } catch (e) {
      console.error('[winloss-tracker] Schema init error:', e.message);
    }
  }

  function parseReasonCategory(reasonText) {
    reasonText = (reasonText || '').trim();
    if (!reasonText) return { category: 'อื่นๆ', note: '' };

    var lo = reasonText.toLowerCase();

    if (/แพง|ราคา|แพงกว่า|งบไม่พอ|งบ/i.test(lo)) {
      return { category: 'แพง', note: reasonText };
    } else if (/คู่แข่ง|แข่ง|เจ้าอื่น|รายอื่น/i.test(lo)) {
      return { category: 'คู่แข่ง', note: reasonText };
    } else if (/เลื่อน|รอก่อน|ยังไม่พร้อม|ปีหน้า|เดือนหน้า/i.test(lo)) {
      return { category: 'เลื่อน', note: reasonText };
    } else {
      return { category: 'อื่นๆ', note: reasonText };
    }
  }

  function recordOutcome(qtNo, status, reasonText, userId) {
    if (!qtNo || !db) return false;
    status = (status || 'win').toLowerCase();

    var catObj = status === 'win' ? { category: 'won', note: 'ปิดงานได้สำเร็จ' } : parseReasonCategory(reasonText);

    try {
      var stmt = db.prepare('INSERT OR REPLACE INTO qt_outcomes (qt_no, status, category, reason_note, user_id, closed_at) VALUES (?, ?, ?, ?, ?, ?)');
      stmt.run(String(qtNo).trim(), status, catObj.category, catObj.note, String(userId || '').trim(), Date.now());
      return { ok: true, qt_no: qtNo, status: status, category: catObj.category, note: catObj.note };
    } catch (e) {
      console.error('[winloss-tracker] Record outcome error:', e.message);
      return { ok: false, error: e.message };
    }
  }

  function getCloseRateSummary() {
    if (!db) return { total: 0, wins: 0, losses: 0, close_rate_pct: 0, category_breakdown: { 'แพง': 0, 'คู่แข่ง': 0, 'เลื่อน': 0, 'อื่นๆ': 0 } };
    try {
      var rows = db.prepare('SELECT status, category FROM qt_outcomes').all();
      var total = rows.length;
      var wins = 0;
      var losses = 0;
      var breakdown = { 'แพง': 0, 'คู่แข่ง': 0, 'เลื่อน': 0, 'อื่นๆ': 0 };

      rows.forEach(function(r) {
        if (r.status === 'win') wins++;
        else {
          losses++;
          if (breakdown[r.category] !== undefined) breakdown[r.category]++;
          else breakdown['อื่นๆ']++;
        }
      });

      var rate = total > 0 ? (wins / total) * 100 : 0;
      return {
        total: total,
        wins: wins,
        losses: losses,
        close_rate_pct: parseFloat(rate.toFixed(1)),
        category_breakdown: breakdown
      };
    } catch (e) {
      return { total: 0, wins: 0, losses: 0, close_rate_pct: 0, category_breakdown: { 'แพง': 0, 'คู่แข่ง': 0, 'เลื่อน': 0, 'อื่นๆ': 0 } };
    }
  }

  return {
    recordOutcome: recordOutcome,
    getCloseRateSummary: getCloseRateSummary,
    parseReasonCategory: parseReasonCategory,
    db: db
  };
};
