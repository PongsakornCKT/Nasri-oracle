'use strict';

/**
 * doc-price-override.js — T4v3 Per-Document Price Override Engine (#14 - REVISION 3)
 * Updates item price in ONE specific QT/BOM document in nasri.sqlite directly via _qtCrud.
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

  async function updateDocumentItemPrice(docId, itemName, newPrice, userId, qtCrud, dbPath) {
    if (!docId || !itemName) {
      return { ok: false, error: 'Invalid document ID or item name' };
    }
    newPrice = parseFloat(newPrice);
    if (isNaN(newPrice) || newPrice < 0) {
      return { ok: false, error: 'Invalid price value' };
    }

    if (!qtCrud || typeof qtCrud.getQuotationDetail !== 'function') {
      return { ok: false, error: 'qtCrud bridge unavailable' };
    }

    try {
      var detail = await qtCrud.getQuotationDetail(docId, dbPath);
      if (!detail || !detail.items || detail.items.length === 0) {
        return { ok: false, error: 'Document ' + docId + ' not found or has no items' };
      }

      var itemLower = itemName.toLowerCase();
      var targetItem = null;

      for (var i = 0; i < detail.items.length; i++) {
        var item = detail.items[i];
        var pName = (item.part_name || item.part_number || item.description || '').toLowerCase();
        if (pName.indexOf(itemLower) >= 0 || itemLower.indexOf(pName) >= 0) {
          targetItem = item;
          break;
        }
      }

      if (!targetItem) {
        return { ok: false, error: 'Item "' + itemName + '" not found in document ' + docId };
      }

      var oldPrice = targetItem.unit_cost || targetItem.unit_price || 0;
      var newQty = targetItem.quantity || 1;
      var newTotalCost = newQty * newPrice;

      // Update item in nasri.sqlite via _qtCrud.editItem
      var editRes = await qtCrud.editItem(docId, targetItem.id, {
        unit_cost: newPrice,
        unit_price: newPrice,
        total_cost: newTotalCost
      }, { dbPath: dbPath, editedBy: userId });

      // Record Audit Log in SQLite
      if (db) {
        try {
          var stmt = db.prepare('INSERT INTO doc_price_audit (doc_id, user_id, item_name, old_price, new_price, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
          stmt.run(String(docId).trim(), String(userId || '').trim(), String(itemName).trim(), oldPrice, newPrice, Date.now());
        } catch (e) {
          console.error('[doc-price-override] Audit log error:', e.message);
        }
      }

      return {
        ok: true,
        doc_id: docId,
        item_id: targetItem.id,
        item_name: targetItem.part_name || targetItem.part_number || itemName,
        old_price: oldPrice,
        new_price: newPrice,
        new_total: editRes && editRes.total_snapshot ? editRes.total_snapshot : (detail.header ? detail.header.grand_total : 0)
      };
    } catch (e) {
      console.error('[doc-price-override] Error updating item price:', e.message);
      return { ok: false, error: e.message };
    }
  }

  return {
    updateDocumentItemPrice: updateDocumentItemPrice,
    db: db
  };
};
