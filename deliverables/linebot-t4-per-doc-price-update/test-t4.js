/**
 * test-t4.js — Verification Test Suite for T4 Per-Document Price Override (#14)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');

// Mock SQLite DB for standalone test execution
class MockSqliteDb {
  constructor() {
    this.auditLogs = [];
  }
  pragma() {}
  exec() {}
  prepare(sql) {
    const self = this;
    if (sql.includes('INSERT INTO doc_price_audit')) {
      return {
        run: (docId, userId, itemName, oldPrice, newPrice, ts) => {
          self.auditLogs.push({ doc_id: docId, user_id: userId, item_name: itemName, old_price: oldPrice, new_price: newPrice, updated_at: ts });
        }
      };
    }
    return { get: () => null, run: () => ({}) };
  }
}

const createDocPriceOverride = require('./lib/doc-price-override');

async function runTests() {
  console.log('🧪 [T4 Test] Starting test suite...');

  const mockDb = new MockSqliteDb();
  const overrideEngine = createDocPriceOverride({ db: mockDb });

  const docId = 'QT-2026-0812-005';
  const originalItems = [
    { part_number: 'SUN2000-10KTL-M1', part_name: 'Inverter Huawei 10kW', quantity: 1, unit_cost: 38000, total_cost: 38000 },
    { part_number: 'RAIL-4200', part_name: 'Keenoc Aluminum Rail', quantity: 10, unit_cost: 480, total_cost: 4800 }
  ];

  // Test 1: Update item price in doc updates unit_cost and recalculates total_cost
  const res = overrideEngine.updateDocumentItemPrice(docId, 'Huawei', 36000, 'U_ADMIN', originalItems);
  assert.strictEqual(res.ok, true, 'Price override should succeed');
  assert.strictEqual(res.updated_items, 1, 'Should update exactly 1 matching item');
  assert.strictEqual(res.old_price, 38000, 'Old price should be 38000');
  assert.strictEqual(res.new_price, 36000, 'New price should be 36000');
  assert.strictEqual(originalItems[0].unit_cost, 36000, 'Item unit_cost should be updated in array');
  assert.strictEqual(originalItems[0].total_cost, 36000, 'Item total_cost should be recalculated');
  assert.strictEqual(res.new_total, 40800, 'Document total should be 36000 + 4800 = 40800');

  // Test 2: Audit log is recorded in SQLite
  assert.strictEqual(mockDb.auditLogs.length, 1, 'Audit log must record 1 entry');
  assert.strictEqual(mockDb.auditLogs[0].doc_id, docId, 'Audit log doc_id must match');
  assert.strictEqual(mockDb.auditLogs[0].old_price, 38000, 'Audit log old_price must match');
  assert.strictEqual(mockDb.auditLogs[0].new_price, 36000, 'Audit log new_price must match');

  // Test 3: Updating non-existent item returns error cleanly without mutating array
  const errRes = overrideEngine.updateDocumentItemPrice(docId, 'NonExistentItem', 9999, 'U_ADMIN', originalItems);
  assert.strictEqual(errRes.ok, false, 'Non-existent item should return ok: false');
  assert.ok(errRes.error.includes('not found'), 'Error message should indicate item not found');

  console.log('✅ [T4 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [T4 Test] FAILED:', err);
  process.exit(1);
});
