/**
 * test-t4.js — Verification Test Suite for T4v4 Per-Document Price Override (#14 - REVISION 4)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');

// Mock SQLite DB for standalone test execution (matching _persistence.sqliteDb)
class MockSqliteDb {
  constructor() {
    this.auditLogs = [];
    this.items = [
      { id: 1, quotation_id: 'LINE-QT-2026-0812-005', part_number: 'SUN2000-10KTL-M1', part_name: 'Inverter Huawei 10kW', quantity: 1, unit_cost: 38000, total_cost: 38000 },
      { id: 2, quotation_id: 'LINE-QT-2026-0812-005', part_number: 'RAIL-4200', part_name: 'Keenoc Aluminum Rail', quantity: 10, unit_cost: 480, total_cost: 4800 }
    ];
    this.quotations = [
      { id: 'LINE-QT-2026-0812-005', quote_number: 'LINE-QT-2026-0812-005', grand_total: 42800 }
    ];
  }
  pragma() {}
  exec() {}
  prepare(sql) {
    const self = this;
    if (sql.includes('PRAGMA table_info(quotation_items)')) {
      return { all: () => [{ name: 'id' }, { name: 'quotation_id' }, { name: 'part_name' }, { name: 'unit_cost' }, { name: 'total_cost' }] };
    }
    if (sql.includes('PRAGMA table_info(quotations)')) {
      return { all: () => [{ name: 'id' }, { name: 'quote_number' }, { name: 'grand_total' }] };
    }
    if (sql.includes('SELECT * FROM quotation_items WHERE quotation_id')) {
      return {
        all: (docId) => self.items.filter(i => i.quotation_id === docId)
      };
    }
    if (sql.includes('UPDATE quotation_items SET unit_cost')) {
      return {
        run: (unitCost, totalCost, id) => {
          const item = self.items.find(i => i.id === id);
          if (item) {
            item.unit_cost = unitCost;
            item.total_cost = totalCost;
          }
        }
      };
    }
    if (sql.includes('UPDATE quotations SET grand_total')) {
      return {
        run: (grandTotal, id) => {
          const qt = self.quotations.find(q => q.id === id || q.quote_number === id);
          if (qt) qt.grand_total = grandTotal;
        }
      };
    }
    if (sql.includes('INSERT INTO doc_price_audit')) {
      return {
        run: (docId, userId, itemName, oldPrice, newPrice, ts) => {
          self.auditLogs.push({ doc_id: docId, user_id: userId, item_name: itemName, old_price: oldPrice, new_price: newPrice, updated_at: ts });
        }
      };
    }
    return { get: () => null, all: () => [], run: () => ({}) };
  }
}

const createDocPriceOverride = require('./lib/doc-price-override');

async function runTests() {
  console.log('🧪 [T4v4 Test] Starting test suite...');

  const mockDb = new MockSqliteDb();
  const overrideEngine = createDocPriceOverride({ db: mockDb });

  const docId = 'LINE-QT-2026-0812-005';

  // Test 1: Update item price directly in SQLite (without bun or qtCrud)
  const res = overrideEngine.updateDocumentItemPrice(docId, 'Huawei', 36000, 'U_ADMIN');
  assert.strictEqual(res.ok, true, 'Price override should succeed directly in SQLite');
  assert.strictEqual(res.old_price, 38000, 'Old price should be 38000');
  assert.strictEqual(res.new_price, 36000, 'New price should be 36000');
  assert.strictEqual(mockDb.items[0].unit_cost, 36000, 'Direct SQLite update must set unit_cost to 36000');
  assert.strictEqual(mockDb.items[0].total_cost, 36000, 'Direct SQLite update must set total_cost to 36000');
  assert.strictEqual(mockDb.quotations[0].grand_total, 40800, 'Direct SQLite update must set grand_total to 40800');

  // Test 2: Audit log is recorded in SQLite
  assert.strictEqual(mockDb.auditLogs.length, 1, 'Audit log must record 1 entry');
  assert.strictEqual(mockDb.auditLogs[0].doc_id, docId, 'Audit log doc_id must match');
  assert.strictEqual(mockDb.auditLogs[0].old_price, 38000, 'Audit log old_price must match');
  assert.strictEqual(mockDb.auditLogs[0].new_price, 36000, 'Audit log new_price must match');

  // Test 3: Updating non-existent item returns error cleanly
  const errRes = overrideEngine.updateDocumentItemPrice(docId, 'NonExistentItem', 9999, 'U_ADMIN');
  assert.strictEqual(errRes.ok, false, 'Non-existent item should return ok: false');
  assert.ok(errRes.error.includes('not found'), 'Error message should indicate item not found');

  console.log('✅ [T4v4 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [T4v4 Test] FAILED:', err);
  process.exit(1);
});
