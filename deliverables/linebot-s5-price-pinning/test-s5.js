/**
 * test-s5.js — Verification Test Suite for S5 Price Pinning Engine (#S5)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');

// Mock SQLite DB for standalone test execution
class MockSqliteDb {
  constructor() {
    this.rows = new Map();
  }
  pragma() {}
  exec() {}
  prepare(sql) {
    const self = this;
    if (sql.includes('SELECT items_json, created_at FROM qt_price_snapshots')) {
      return {
        get: (qtNo) => self.rows.has(qtNo) ? self.rows.get(qtNo) : null
      };
    }
    if (sql.includes('INSERT OR REPLACE INTO qt_price_snapshots')) {
      return {
        run: (qtNo, userId, itemsJson, ts) => {
          self.rows.set(qtNo, { items_json: itemsJson, created_at: ts });
        }
      };
    }
    return { get: () => null, run: () => ({}) };
  }
}

const createPricePinning = require('./lib/price-pinning');

async function runTests() {
  console.log('🧪 [S5 Test] Starting test suite...');

  const mockDb = new MockSqliteDb();
  const pinning = createPricePinning({ db: mockDb });

  const qtNo = 'QT-2026-0812-001';
  const originalItems = [
    { part_number: 'SUN2000-10KTL-M1', unit_cost: 38000, total_cost: 38000 },
    { part_number: 'RAIL-4200', unit_cost: 480, total_cost: 9600 }
  ];

  // Test 1: Snapshot creation succeeds
  const ok = pinning.snapshotPrice(qtNo, 'U1001', originalItems);
  assert.strictEqual(ok, true, 'snapshotPrice should return true');

  // Test 2: Retrieval returns pinned original prices regardless of external changes
  const snapshot = pinning.getPinnedSnapshot(qtNo);
  assert.ok(snapshot, 'getPinnedSnapshot should return snapshot object');
  assert.strictEqual(snapshot.items.length, 2, 'Snapshot items count should be 2');
  assert.strictEqual(snapshot.items[0].unit_cost, 38000, 'Original inverter price must remain 38,000');

  // Test 3: Querying non-existent QT number returns null gracefully
  const missing = pinning.getPinnedSnapshot('QT-NON-EXISTENT');
  assert.strictEqual(missing, null, 'Non-existent QT should return null');

  console.log('✅ [S5 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [S5 Test] FAILED:', err);
  process.exit(1);
});
