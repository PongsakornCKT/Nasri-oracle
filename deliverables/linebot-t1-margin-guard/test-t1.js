/**
 * test-t1.js — Verification Test Suite for T1 Margin Guard (#4)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const createMarginGuard = require('./lib/margin-guard');

async function runTests() {
  console.log('🧪 [T1 Test] Starting test suite...');

  let adminAlertText = '';
  let adminAlertCount = 0;

  const guard = createMarginGuard({
    thresholdPct: 10.0,
    notifyAdmin: async (text) => {
      adminAlertCount++;
      adminAlertText = text;
    }
  });

  // Test 1: Normal margin >= 10% (e.g. profit 15,000 on selling 100,000 = 15%) -> No warning
  const normalRes = guard.checkMargin(15000, 100000);
  assert.strictEqual(normalRes.isLowMargin, false, 'Margin >= 10% should not be low margin');
  assert.strictEqual(normalRes.warningText, null, 'Normal margin should have no warning text');
  assert.strictEqual(adminAlertCount, 0, 'Normal margin should not trigger admin alert');

  // Test 2: Low margin < 10% (e.g. profit 8,000 on selling 100,000 = 8%) -> Warning text + Admin alert
  const lowRes = guard.checkMargin(8000, 100000);
  assert.strictEqual(lowRes.isLowMargin, true, 'Margin 8% should be flagged as low margin (<10%)');
  assert.strictEqual(lowRes.marginPct, 8.0, 'Margin percentage should be 8.0%');
  assert.ok(lowRes.warningText.includes('มาร์จิ้นต่ำกว่าเกณฑ์ 10%'), 'Warning text should be formatted for sales');
  assert.strictEqual(adminAlertCount, 1, 'Low margin must trigger admin alert');
  assert.ok(adminAlertText.includes('[MARGIN GUARD ALERT]'), 'Admin alert should contain MARGIN GUARD ALERT header');

  // Test 3: Alert-only non-blocking rule (checkMargin returns object without throwing error)
  assert.doesNotThrow(() => {
    guard.checkMargin(1000, 100000);
  }, 'Low margin must not throw or block execution');

  console.log('✅ [T1 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [T1 Test] FAILED:', err);
  process.exit(1);
});
