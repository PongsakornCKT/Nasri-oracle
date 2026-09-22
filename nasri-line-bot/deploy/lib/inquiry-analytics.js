'use strict';

/**
 * inquiry-analytics.js — Q4 Inquiry Demand Analytics (#9)
 * Logs price/BOM/quote inquiries to SQLite table `inquiries` (Zero PII).
 * Supports both better-sqlite3 (Node) and bun:sqlite (Bun).
 * Provides top-10 demand summary over last 30 days.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createInquiryAnalytics(opts) {
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
        console.warn('[inquiry-analytics] SQLite init skipped/failed:', e.message);
      }
    }
  }

  // Init table schema (Zero PII — NO userId, NO customer_name, NO phone)
  if (db) {
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS inquiries (' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  inquiry_type TEXT NOT NULL,' +   // "price_search", "bom_quote", "package_query"
        '  brand TEXT DEFAULT "",' +        // e.g. "Huawei", "ATMOCE", "Solis"
        '  size_kw TEXT DEFAULT "",' +      // e.g. "5", "10"
        '  package_name TEXT DEFAULT "",' + // e.g. "5kW 1-Phase"
        '  created_at INTEGER NOT NULL' +
        ');'
      );
    } catch (e) {
      console.error('[inquiry-analytics] Schema init error:', e.message);
    }
  }

  function logInquiry(inquiryType, brand, sizeKw, packageName) {
    if (!db) return;
    try {
      var stmt = db.prepare(
        'INSERT INTO inquiries (inquiry_type, brand, size_kw, package_name, created_at) VALUES (?, ?, ?, ?, ?)'
      );
      stmt.run(
        inquiryType || 'general',
        (brand || '').trim(),
        (sizeKw || '').toString().trim(),
        (packageName || '').trim(),
        Date.now()
      );
    } catch (e) {
      console.error('[inquiry-analytics] logInquiry error:', e.message);
    }
  }

  function getDemandSummary(days) {
    if (!db) return { total: 0, days: days || 30, top_packages: [] };
    var numDays = days || 30;
    var sinceTs = Date.now() - (numDays * 24 * 60 * 60 * 1000);
    try {
      var totalRow = db.prepare('SELECT count(*) as total FROM inquiries WHERE created_at >= ?').get(sinceTs);
      var total = totalRow ? (totalRow.total || 0) : 0;

      var rows = db.prepare(
        'SELECT brand, size_kw, package_name, count(*) as count ' +
        'FROM inquiries ' +
        'WHERE created_at >= ? ' +
        'GROUP BY brand, size_kw, package_name ' +
        'ORDER BY count DESC ' +
        'LIMIT 10'
      ).all(sinceTs);

      return {
        total: total,
        days: numDays,
        top_packages: rows.map(function(r, i) {
          return {
            rank: i + 1,
            brand: r.brand || 'ทั่วไป',
            size_kw: r.size_kw || '—',
            package_name: r.package_name || (r.brand + ' ' + r.size_kw + 'kW'),
            count: r.count,
            share_pct: total > 0 ? parseFloat((r.count / total * 100).toFixed(1)) : 0
          };
        })
      };
    } catch (e) {
      console.error('[inquiry-analytics] getDemandSummary error:', e.message);
      return { total: 0, days: numDays, top_packages: [] };
    }
  }

  return { logInquiry: logInquiry, getDemandSummary: getDemandSummary, db: db };
};
