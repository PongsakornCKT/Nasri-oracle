'use strict';

/**
 * doc-price-override.js — T4v4 Per-Document Price Override Engine (#14 - REVISION 4)
 * Updates item price in ONE specific QT/BOM document directly in SQLite (_persistence.sqliteDb).
 * NEVER calls _qtCrud (avoids bun/ts subprocess ENOENT on production) and NEVER writes back to Google Sheets.
 * Records audit trail in `doc_price_audit`.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createDocPriceOverride(opts) {
  opts = opts || {};
  var db = opts.db || (opts.persistence ? opts.persistence.sqliteDb : null);

  if (!db && opts.sqlitePath) {
    try {
      var Database = require('better-sqlite3');
      db = new Database(opts.sqlitePath);
      db.pragma('journal_mode = WAL');
    } catch (e) {
      try {
        var BunDb = require('bun:sqlite').Database;
        db = new BunDb(opts.sqlitePath);
      } catch (e2) {
        console.warn('[doc-price-override] Direct SQLite init notice:', e.message);
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

  function updateDocumentItemPrice(docId, itemName, newPrice, userId, memoryItems) {
    if (!docId || !itemName) {
      return { ok: false, error: 'Invalid document ID or item name' };
    }
    newPrice = parseFloat(newPrice);
    if (isNaN(newPrice) || newPrice < 0) {
      return { ok: false, error: 'Invalid price value' };
    }

    docId = String(docId).trim();
    itemName = String(itemName).trim();
    userId = String(userId || '').trim();

    var itemLower = itemName.toLowerCase();
    var oldPrice = 0;
    var updatedCount = 0;
    var updatedItems = [];

    // Path 1: Update in-memory items array (if provided by active session/loader)
    if (Array.isArray(memoryItems) && memoryItems.length > 0) {
      memoryItems.forEach(function(item) {
        var pName = (item.part_name || item.part_number || item.name || item.description || '').toLowerCase();
        if (pName.indexOf(itemLower) >= 0 || itemLower.indexOf(pName) >= 0) {
          oldPrice = item.unit_cost || item.unit_price || item.price || 0;
          item.unit_cost = newPrice;
          if (item.unit_price !== undefined) item.unit_price = newPrice;
          if (item.price !== undefined) item.price = newPrice;
          var qty = item.quantity || 1;
          item.total_cost = qty * newPrice;
          item.price_source = 'doc_override';
          updatedCount++;
        }
      });
      updatedItems = memoryItems;
    }

    // Path 2: Direct SQLite update via _persistence.sqliteDb (without bun or qtCrud subprocess)
    if (db) {
      try {
        var itemsTableCols = db.prepare("PRAGMA table_info(quotation_items)").all().map(function(c) { return c.name; });
        if (itemsTableCols.length > 0) {
          var rows = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ?").all(docId);
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var rName = (r.part_name || r.part_number || r.description || '').toLowerCase();
            if (rName.indexOf(itemLower) >= 0 || itemLower.indexOf(rName) >= 0) {
              if (!oldPrice) oldPrice = r.unit_cost || r.unit_price || 0;
              var rQty = r.quantity || 1;
              var rTotal = rQty * newPrice;

              if (itemsTableCols.indexOf('unit_cost') >= 0 && itemsTableCols.indexOf('total_cost') >= 0) {
                db.prepare("UPDATE quotation_items SET unit_cost = ?, total_cost = ? WHERE id = ?").run(newPrice, rTotal, r.id);
              } else if (itemsTableCols.indexOf('unit_price') >= 0) {
                db.prepare("UPDATE quotation_items SET unit_price = ? WHERE id = ?").run(newPrice, r.id);
              }
              updatedCount++;
            }
          }

          // Recalculate quotation grand_total in quotations table
          if (updatedCount > 0) {
            var allRows = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ?").all(docId);
            var grandTotal = allRows.reduce(function(sum, row) {
              return sum + (row.total_cost || ((row.quantity || 1) * (row.unit_cost || row.unit_price || 0)));
            }, 0);

            var qtCols = db.prepare("PRAGMA table_info(quotations)").all().map(function(c) { return c.name; });
            if (qtCols.indexOf('grand_total') >= 0) {
              db.prepare("UPDATE quotations SET grand_total = ? WHERE id = ? OR quote_number = ?").run(grandTotal, docId, docId);
            }
          }
        }
      } catch (e) {
        console.warn('[doc-price-override] Direct SQLite update notice:', e.message);
      }
    }

    if (updatedCount === 0 && (!memoryItems || memoryItems.length === 0)) {
      return { ok: false, error: 'Item "' + itemName + '" not found in document ' + docId };
    }

    // Record Audit Log in SQLite
    if (db) {
      try {
        var stmt = db.prepare('INSERT INTO doc_price_audit (doc_id, user_id, item_name, old_price, new_price, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
        stmt.run(docId, userId, itemName, oldPrice, newPrice, Date.now());
      } catch (e) {
        console.error('[doc-price-override] Audit log error:', e.message);
      }
    }

    var calcTotal = updatedItems.reduce(function(sum, item) { return sum + (item.total_cost || 0); }, 0);

    return {
      ok: true,
      doc_id: docId,
      updated_items: updatedCount,
      old_price: oldPrice,
      new_price: newPrice,
      new_total: calcTotal,
      items: updatedItems
    };
  }

  return {
    updateDocumentItemPrice: updateDocumentItemPrice,
    db: db
  };
};
