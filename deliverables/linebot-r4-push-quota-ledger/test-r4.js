/**
 * test-r4.js — Verification Test Suite for R4 LINE Push Quota Ledger (#R4)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');

// Mock SQLite DB for standalone test execution
class MockSqliteDb {
  constructor() {
    this.ledger = [];
    this.queue = [];
  }
  pragma() {}
  exec() {}
  prepare(sql) {
    const self = this;
    if (sql.includes('SELECT count(*) as c FROM push_ledger')) {
      return {
        get: (monthKey) => {
          const matched = self.ledger.filter(r => r.month_key === monthKey);
          return { c: matched.length };
        }
      };
    }
    if (sql.includes('INSERT INTO push_ledger')) {
      return {
        run: (cat, target, ts, mKey) => {
          self.ledger.push({ category: cat, target_id: target, created_at: ts, month_key: mKey });
        }
      };
    }
    if (sql.includes('INSERT INTO push_outbound_queue')) {
      return {
        run: (cat, target, payload, ts) => {
          self.queue.push({ category: cat, target_id: target, payload: payload, queued_at: ts });
        }
      };
    }
    return { get: () => ({}), run: () => ({}) };
  }
}

const createPushQuotaLedger = require('./lib/push-quota-ledger');

async function runTests() {
  console.log('🧪 [R4 Test] Starting test suite...');

  let adminAlertCount = 0;
  let adminAlertText = '';

  const mockDb = new MockSqliteDb();
  const ledger = createPushQuotaLedger({
    db: mockDb,
    quotaLimit: 10, // Set low quota limit for fast testing
    notifyAdmin: async (text) => {
      adminAlertCount++;
      adminAlertText = text;
    }
  });

  // Test 1: Initial state (0/10)
  assert.strictEqual(ledger.getMonthlyUsage(), 0, 'Initially usage should be 0');
  assert.strictEqual(ledger.canSendPush(), true, 'Initially canSendPush should be true');

  // Test 2: Record push 1..7 (no alert yet)
  for (let i = 1; i <= 7; i++) {
    const res = ledger.recordAndCheckPush('qt', 'user_' + i, 'hello');
    assert.strictEqual(res.allowed, true, 'Push ' + i + ' should be allowed');
    assert.strictEqual(res.queued, false, 'Push ' + i + ' should not be queued');
  }
  assert.strictEqual(adminAlertCount, 0, '7/10 push should not trigger 80% alert yet');

  // Test 3: 8th push hits 80% threshold (8/10) -> triggers admin alert
  const res8 = ledger.recordAndCheckPush('qt', 'user_8', 'hello');
  assert.strictEqual(res8.allowed, true, '8th push should be allowed');
  assert.strictEqual(adminAlertCount, 1, '8th push should trigger 80% quota alert');
  assert.ok(adminAlertText.includes('[LINE PUSH QUOTA ALERT]'), 'Alert text should contain PUSH QUOTA ALERT header');

  // Test 4: Record 9th and 10th push
  ledger.recordAndCheckPush('qt', 'user_9', 'hello');
  ledger.recordAndCheckPush('qt', 'user_10', 'hello');
  assert.strictEqual(ledger.getMonthlyUsage(), 10, 'Usage should be 10/10');

  // Test 5: 11th push hits 100% quota -> Queues message into push_outbound_queue (never drops silently!)
  const res11 = ledger.recordAndCheckPush('bom', 'user_11', 'hello overflow');
  assert.strictEqual(res11.allowed, false, '11th push should NOT be allowed via direct push');
  assert.strictEqual(res11.queued, true, '11th push MUST be queued into outbound queue');
  assert.strictEqual(mockDb.queue.length, 1, 'Outbound queue should contain 1 queued message');
  assert.strictEqual(mockDb.queue[0].category, 'bom', 'Queued message category should be bom');

  console.log('✅ [R4 Test] All 5 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [R4 Test] FAILED:', err);
  process.exit(1);
});
