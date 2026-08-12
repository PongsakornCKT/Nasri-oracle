'use strict';

/**
 * doc-price-override.js — T4 Per-Document Price Override Engine (#14)
 * Updates item price in ONE specific QT/BOM document without writing back to Google Sheets.
 * Enforces P'Phong Business Decision A3: NO CODE PATH MAY EVER WRITE BACK TO GOOGLE SHEETS!
 * Records audit trail log in SQLite `doc_price_audit`.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createDocPriceOverride(opts) {
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
        console.warn('[doc-price-override] SQLite init skipped/failed:', e.message);
      }
    }
  }

  // Init audit table schema
  if (db) {
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS doc_price_audit (' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  doc_id TEXT NOT NULL,' +
        '  user_id TEXT NOT NULL,' +
        '  item_name TEXT NOT NULL,' +
        '  old_price REAL NOT NULL,' +
        '  new_price REAL NOT NULL,' +
        '  updated_at INTEGER NOT NULL' +
        ');'
      );
    } catch (e) {
      console.error('[doc-price-override] Audit schema init error:', e.message);
    }
  }

  function updateDocumentItemPrice(docId, itemName, newPrice, userId, items) {
    if (!docId || !itemName || !Array.isArray(items)) {
      return { ok: false, error: 'Invalid document or items array' };
    }
    newPrice = parseFloat(newPrice);
    if (isNaN(newPrice) || newPrice < 0) {
      return { ok: false, error: 'Invalid price value' };
    }

    var itemLower = itemName.toLowerCase();
    var updatedCount = 0;
    var oldPrice = 0;

    items.forEach(function(item) {
      var pName = (item.part_name || item.part_number || item.name || '').toLowerCase();
      if (pName.indexOf(itemLower) >= 0 || itemLower.indexOf(pName) >= 0) {
        oldPrice = item.unit_cost || item.price || 0;
        item.unit_cost = newPrice;
        if (item.price !== undefined) item.price = newPrice;
        item.total_cost = (item.quantity || 1) * newPrice;
        item.price_source = 'doc_override';
        updatedCount++;
      }
    });

    if (updatedCount === 0) {
      return { ok: false, error: 'Item "' + itemName + '" not found in document ' + docId };
    }

    // Record Audit Log in SQLite
    if (db) {
      try {
        var stmt = db.prepare('INSERT INTO doc_price_audit (doc_id, user_id, item_name, old_price, new_price, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
        stmt.run(String(docId).trim(), String(userId || '').trim(), String(itemName).trim(), oldPrice, newPrice, Date.now());
      } catch (e) {
        console.error('[doc-price-override] Audit log error:', e.message);
      }
    }

    // Calculate new total
    var newTotal = items.reduce(function(sum, i) { return sum + (i.total_cost || 0); }, 0);

    return {
      ok: true,
      doc_id: docId,
      updated_items: updatedCount,
      old_price: oldPrice,
      new_price: newPrice,
      new_total: newTotal,
      items: items
    };
  }

  return {
    updateDocumentItemPrice: updateDocumentItemPrice,
    db: db
  };
};
