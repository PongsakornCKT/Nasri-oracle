/**
 * test-t4.js — Verification Test Suite for T4 Per-Document Price Override (#14)
 * Environment-independent mock DB test suite (matching catalog-lkg.test.js pattern).
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');

// Mock SQLite DB independent of native C++ binaries
class MockSqliteDb {
  constructor(options) {
    options = options || {};
    this.hasTable = options.hasTable !== false;
    this.auditLogs = [];
    this.items = [
      { id: 101, quotation_id: 'LINE-QT-2026-0812-005', description: 'Inverter Huawei 10kW', total_price: 38000, sort_order: 1, is_optional: 0 },
      { id: 102, quotation_id: 'LINE-QT-2026-0812-005', description: 'Keenoc Aluminum Rail', total_price: 4800, sort_order: 2, is_optional: 0 }
    ];
    this.quotations = [
      { id: 'LINE-QT-2026-0812-005', quote_number: 'LINE-QT-2026-0812-005', grand_total: 42800 }
    ];
  }

  exec() {}

  prepare(sql) {
    const self = this;
    if (sql.includes('PRAGMA table_info(quotation_items)')) {
      return {
        all: () => self.hasTable ? [
          { name: 'id' }, { name: 'quotation_id' }, { name: 'description' }, { name: 'total_price' }, { name: 'sort_order' }, { name: 'is_optional' }
        ] : []
      };
    }
    if (sql.includes('PRAGMA table_info(quotations)')) {
      return { all: () => [{ name: 'id' }, { name: 'quote_number' }, { name: 'grand_total' }] };
    }
    if (sql.includes('PRAGMA table_info(doc_price_audit)')) {
      return { all: () => [{ name: 'id' }, { name: 'doc_id' }, { name: 'user_id' }, { name: 'item_name' }, { name: 'old_price' }, { name: 'new_price' }, { name: 'updated_at' }] };
    }
    if (sql.includes('SELECT * FROM quotation_items WHERE quotation_id')) {
      return {
        all: (docId) => self.items.filter(i => i.quotation_id === docId)
      };
    }
    if (sql.includes('UPDATE quotation_items SET total_price')) {
      return {
        run: (totalPrice, id) => {
          const item = self.items.find(i => i.id === id);
          if (item) item.total_price = totalPrice;
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
  console.log('🧪 [T4 Test] Starting env-independent test suite...');

  // Test 1: Update item price in quotation_items directly
  const mockDb = new MockSqliteDb();
  const overrideEngine = createDocPriceOverride({ db: mockDb });

  const docId = 'LINE-QT-2026-0812-005';
  const res = overrideEngine.updateDocumentItemPrice(docId, 'Huawei', 36000, 'U_ADMIN');
  assert.strictEqual(res.ok, true, 'Price override should succeed directly in SQLite');
  assert.strictEqual(res.old_price, 38000, 'Old price should be 38000');
  assert.strictEqual(res.new_price, 36000, 'New price should be 36000');
  assert.strictEqual(mockDb.items[0].total_price, 36000, 'Direct SQLite update must set total_price to 36000');
  assert.strictEqual(mockDb.quotations[0].grand_total, 40800, 'Direct SQLite update must set grand_total to 40800');

  // Test 2: Audit log is recorded in SQLite
  assert.strictEqual(mockDb.auditLogs.length, 1, 'Audit log must record 1 entry');
  assert.strictEqual(mockDb.auditLogs[0].doc_id, docId, 'Audit log doc_id must match');
  assert.strictEqual(mockDb.auditLogs[0].old_price, 38000, 'Audit log old_price must match');
  assert.strictEqual(mockDb.auditLogs[0].new_price, 36000, 'Audit log new_price must match');

  // Test 3: Legacy environment without quotation_items table returns graceful message without throwing
  const mockLegacyDb = new MockSqliteDb({ hasTable: false });
  const legacyEngine = createDocPriceOverride({ db: mockLegacyDb });
  const legacyRes = legacyEngine.updateDocumentItemPrice(docId, 'Huawei', 36000, 'U_ADMIN');

  assert.strictEqual(legacyRes.ok, false, 'Legacy env should return ok: false');
  assert.strictEqual(legacyRes.error, 'ระบบนี้ยังไม่รองรับแก้ราคารายใบ', 'Legacy env error message must match expected string');

  console.log('✅ [T4 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [T4 Test] FAILED:', err);
  process.exit(1);
});
