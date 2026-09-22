'use strict';

/**
 * doc-price-override.js — T4 Per-Document Price Override Engine (#14)
 * Updates item price in ONE specific QT/BOM document directly in SQLite (_persistence.sqliteDb).
 * Uses PRAGMA table_info(quotation_items) to safely detect rich schema columns (quotation_id, total_price, description/part_name).
 *
 * STRICT RULES:
 *   - NEVER spawn bun/qtCrud subprocesses.
 *   - NEVER write back to Google Sheets.
 *   - NEVER throw on missing table/items — return graceful error response.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createDocPriceOverride(opts) {
  opts = opts || {};
  var db = opts.db || (opts.persistence ? opts.persistence.sqliteDb : null);

  function getTableCols(tableName) {
    if (!db || typeof db.prepare !== 'function') return [];
    try {
      var rows = db.prepare("PRAGMA table_info(" + tableName + ")").all();
      return Array.isArray(rows) ? rows.map(function(c) { return c.name; }) : [];
    } catch (e) {
      return [];
    }
  }

  // Init audit table schema if db is available
  if (db && typeof db.exec === 'function') {
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
      // Non-fatal if audit table already exists or schema restricted
    }
  }

  function updateDocumentItemPrice(docId, itemName, newPrice, userId) {
    if (!docId || !itemName) {
      return { ok: false, error: 'โปรดระบุเลขที่เอกสารและชื่อรายการ' };
    }
    newPrice = parseFloat(newPrice);
    if (isNaN(newPrice) || newPrice < 0) {
      return { ok: false, error: 'ราคาใหม่ไม่ถูกต้อง' };
    }

    docId = String(docId).trim();
    itemName = String(itemName).trim();
    userId = String(userId || '').trim();

    if (!db) {
      return { ok: false, error: 'ระบบนี้ยังไม่รองรับแก้ราคารายใบ (ไม่พบฐานข้อมูล)' };
    }

    // PRAGMA table_info detection
    var qtItemsCols = getTableCols('quotation_items');
    if (qtItemsCols.length === 0) {
      return { ok: false, error: 'ระบบนี้ยังไม่รองรับแก้ราคารายใบ' };
    }

    var itemLower = itemName.toLowerCase();
    var priceCol = qtItemsCols.indexOf('total_price') >= 0 ? 'total_price' : (qtItemsCols.indexOf('unit_cost') >= 0 ? 'unit_cost' : null);
    if (!priceCol) {
      return { ok: false, error: 'ระบบนี้ยังไม่รองรับแก้ราคารายใบ (ไม่พบคอลัมน์ราคา)' };
    }

    try {
      var rows = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ?").all(docId);
      if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: false, error: 'ไม่พบรายการอุปกรณ์ในเอกสาร ' + docId };
      }

      var targetRow = null;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var rName = (r.description || r.part_name || r.part_number || '').toLowerCase();
        if (rName.indexOf(itemLower) >= 0 || itemLower.indexOf(rName) >= 0) {
          targetRow = r;
          break;
        }
      }

      if (!targetRow) {
        return { ok: false, error: 'ไม่พบรายการ "' + itemName + '" ในเอกสาร ' + docId };
      }

      var _hasUnit = qtItemsCols.indexOf('unit_price') >= 0;
      var oldPrice = parseFloat((_hasUnit ? targetRow.unit_price : targetRow[priceCol]) || targetRow.unit_cost || targetRow.unit_price || 0);

      // "ราคา" = ราคาต่อหน่วย (unit price, พี่พงยืนยัน 2026-08-12). ตั้ง unit_price = ราคาที่ป้อน
      // แล้ว recompute total_price = unit_price × quantity × (1 - line_discount) ให้ record consistent.
      var _qty = parseFloat(targetRow.quantity || 1) || 1;
      var _disc = parseFloat(targetRow.line_discount || 0) || 0;
      if (_hasUnit) {
        db.prepare("UPDATE quotation_items SET unit_price = ? WHERE id = ?").run(newPrice, targetRow.id);
        if (qtItemsCols.indexOf('total_price') >= 0) {
          var _lineTotal = newPrice * _qty * (1 - _disc);
          db.prepare("UPDATE quotation_items SET total_price = ? WHERE id = ?").run(_lineTotal, targetRow.id);
        }
        if (qtItemsCols.indexOf('price_at_creation') >= 0) {
          try { db.prepare("UPDATE quotation_items SET price_at_creation = ? WHERE id = ?").run(newPrice, targetRow.id); } catch (e) {}
        }
      } else {
        // legacy/simple schema — ไม่มี unit_price แยก: เขียนคอลัมน์ราคาที่มี (unit_cost) ตรงๆ เป็นราคาต่อหน่วย
        db.prepare("UPDATE quotation_items SET " + priceCol + " = ? WHERE id = ?").run(newPrice, targetRow.id);
      }

      // Recalculate document grand_total จาก total_price (rich) หรือ priceCol (legacy)
      var _sumCol = qtItemsCols.indexOf('total_price') >= 0 ? 'total_price' : priceCol;
      var updatedRows = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ?").all(docId);
      var newTotal = updatedRows.reduce(function(sum, r) { return sum + (parseFloat(r[_sumCol] || 0)); }, 0);

      var qtCols = getTableCols('quotations');
      if (qtCols.indexOf('grand_total') >= 0) {
        try {
          db.prepare("UPDATE quotations SET grand_total = ? WHERE id = ? OR quote_number = ?").run(newTotal, docId, docId);
        } catch (e) {}
      }

      // Record Audit Log in SQLite
      try {
        if (getTableCols('doc_price_audit').length > 0) {
          db.prepare('INSERT INTO doc_price_audit (doc_id, user_id, item_name, old_price, new_price, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(docId, userId, itemName, oldPrice, newPrice, Date.now());
        }
      } catch (e) {}

      return {
        ok: true,
        doc_id: docId,
        item_id: targetRow.id,
        item_name: targetRow.description || targetRow.part_name || itemName,
        old_price: oldPrice,
        new_price: newPrice,
        new_total: newTotal
      };
    } catch (e) {
      console.error('[doc-price-override] SQLite query error:', e.message);
      return { ok: false, error: 'เกิดข้อผิดพลาดในการอัปเดตราคา: ' + e.message };
    }
  }

  return {
    updateDocumentItemPrice: updateDocumentItemPrice,
    db: db
  };
};
