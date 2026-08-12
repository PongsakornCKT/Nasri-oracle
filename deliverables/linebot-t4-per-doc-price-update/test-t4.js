/**
 * test-t4.js — Verification Test Suite for T4v3 Per-Document Price Override (#14 - REVISION 3)
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
  console.log('🧪 [T4v3 Test] Starting test suite...');

  const mockDb = new MockSqliteDb();
  const overrideEngine = createDocPriceOverride({ db: mockDb });

  const docId = 'LINE-QT-2026-0812-005';
  const mockQtCrud = {
    getQuotationDetail: async (qtId) => ({
      header: { quote_number: qtId, grand_total: 42800 },
      items: [
        { id: 1, part_number: 'SUN2000-10KTL-M1', part_name: 'Inverter Huawei 10kW', quantity: 1, unit_cost: 38000, total_cost: 38000 },
        { id: 2, part_number: 'RAIL-4200', part_name: 'Keenoc Aluminum Rail', quantity: 10, unit_cost: 480, total_cost: 4800 }
      ]
    }),
    editItem: async (qtId, itemId, changes, opts) => {
      assert.strictEqual(qtId, 'LINE-QT-2026-0812-005', 'Quotation ID must match');
      assert.strictEqual(itemId, 1, 'Target item ID should be 1');
      assert.strictEqual(changes.unit_cost, 36000, 'unit_cost change must be 36000');
      return { total_snapshot: 40800 };
    }
  };

  // Test 1: Update item price via _qtCrud.editItem directly
  const res = await overrideEngine.updateDocumentItemPrice(docId, 'Huawei', 36000, 'U_ADMIN', mockQtCrud, '/tmp/test.db');
  assert.strictEqual(res.ok, true, 'Price override should succeed via _qtCrud');
  assert.strictEqual(res.old_price, 38000, 'Old price should be 38000');
  assert.strictEqual(res.new_price, 36000, 'New price should be 36000');
  assert.strictEqual(res.new_total, 40800, 'Document total should update to 40800');

  // Test 2: Audit log is recorded in SQLite
  assert.strictEqual(mockDb.auditLogs.length, 1, 'Audit log must record 1 entry');
  assert.strictEqual(mockDb.auditLogs[0].doc_id, docId, 'Audit log doc_id must match');
  assert.strictEqual(mockDb.auditLogs[0].old_price, 38000, 'Audit log old_price must match');
  assert.strictEqual(mockDb.auditLogs[0].new_price, 36000, 'Audit log new_price must match');

  // Test 3: Updating non-existent item returns error cleanly
  const errRes = await overrideEngine.updateDocumentItemPrice(docId, 'NonExistentItem', 9999, 'U_ADMIN', mockQtCrud, '/tmp/test.db');
  assert.strictEqual(errRes.ok, false, 'Non-existent item should return ok: false');
  assert.ok(errRes.error.includes('not found'), 'Error message should indicate item not found');

  console.log('✅ [T4v3 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [T4v3 Test] FAILED:', err);
  process.exit(1);
});
