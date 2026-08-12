/**
 * test-r3.js — Verification Test Suite for R3 SQLite to JSON Fallback Fail-Loud (#R3)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const createDegradedGuard = require('./lib/degraded-guard');

async function runTests() {
  console.log('🧪 [R3 Test] Starting test suite...');

  let adminAlertText = '';
  let adminAlertCount = 0;

  const guard = createDegradedGuard({
    notifyAdmin: async (text) => {
      adminAlertCount++;
      adminAlertText = text;
    }
  });

  // Test 1: Initial health status is healthy (not degraded)
  const health0 = guard.getHealthStatus({ status: 'ok' });
  assert.strictEqual(health0.degraded_mode, false, 'Initially degraded_mode should be false');
  assert.strictEqual(health0.storage_engine, 'sqlite_wal', 'Initially storage_engine should be sqlite_wal');
  assert.strictEqual(health0.degraded_reason, null, 'Initially degraded_reason should be null');

  // Test 2: Triggering markDegraded notifies admin immediately
  guard.markDegraded('SQLite disk I/O error on WAL file');
  assert.strictEqual(guard.isDegraded(), true, 'isDegraded() should return true after markDegraded');
  assert.strictEqual(adminAlertCount, 1, 'markDegraded should push 1 alert to admin');
  assert.ok(adminAlertText.includes('[DEGRADED MODE ALERT]'), 'Alert text should contain DEGRADED MODE ALERT header');
  assert.ok(adminAlertText.includes('SQLite disk I/O error'), 'Alert text should contain failure reason');

  // Test 3: Subsequent markDegraded calls do not flood admin with duplicate alerts
  guard.markDegraded('Another SQLite error');
  assert.strictEqual(adminAlertCount, 1, 'Subsequent markDegraded should not send duplicate admin alert');

  // Test 4: Health status payload reflects degraded state
  const health1 = guard.getHealthStatus({ status: 'ok' });
  assert.strictEqual(health1.degraded_mode, true, 'Health payload should show degraded_mode: true');
  assert.strictEqual(health1.storage_engine, 'legacy_json', 'Health payload should show storage_engine: legacy_json');
  assert.strictEqual(health1.degraded_reason, 'SQLite disk I/O error on WAL file', 'Health payload should contain reason');

  console.log('✅ [R3 Test] All 4 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [R3 Test] FAILED:', err);
  process.exit(1);
});
