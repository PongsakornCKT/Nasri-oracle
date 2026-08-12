/**
 * test-t5.js — Verification Test Suite for T5 Discount Alert (#B5)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const createDiscountAlert = require('./lib/discount-alert');

async function runTests() {
  console.log('🧪 [T5 Test] Starting test suite...');

  let adminAlertText = '';
  let adminAlertCount = 0;

  const alertEngine = createDiscountAlert({
    thresholdPct: 10.0,
    notifyAdmin: async (text) => {
      adminAlertCount++;
      adminAlertText = text;
    }
  });

  // Test 1: Normal discount keeping net margin >= 10% -> No warning
  // Selling = 100,000, Normal Profit = 20,000 (20%), Discount = 5,000 -> Net Price = 95,000, Net Profit = 15,000 (15.8%)
  const okRes = alertEngine.checkDiscountImpact(5000, 20000, 100000);
  assert.strictEqual(okRes.isViolation, false, 'Discount leaving 15.8% margin should not trigger alert');
  assert.strictEqual(okRes.warningText, null, 'No warning text for acceptable discount');
  assert.strictEqual(adminAlertCount, 0, 'No admin alert for acceptable discount');

  // Test 2: Excessive discount dropping net margin < 10% -> Warning text + Admin alert
  // Selling = 100,000, Normal Profit = 15,000 (15%), Discount = 8,000 -> Net Price = 92,000, Net Profit = 7,000 (7.6%)
  const violationRes = alertEngine.checkDiscountImpact(8000, 15000, 100000);
  assert.strictEqual(violationRes.isViolation, true, 'Discount leaving 7.6% margin MUST trigger violation');
  assert.strictEqual(violationRes.finalMarginPct, 7.6, 'Final net margin should be 7.6%');
  assert.ok(violationRes.warningText.includes('ส่วนลด ฿8,000 ส่งผลให้มาร์จิ้นเหลือ 7.6%'), 'Warning text should be formatted for sales');
  assert.strictEqual(adminAlertCount, 1, 'Violation must trigger admin alert');
  assert.ok(adminAlertText.includes('[DISCOUNT ALERT]'), 'Admin alert should contain DISCOUNT ALERT header');

  // Test 3: Alert-only non-blocking rule (checkDiscountImpact returns object without throwing error)
  assert.doesNotThrow(() => {
    alertEngine.checkDiscountImpact(12000, 15000, 100000);
  }, 'Excessive discount must not throw or block execution');

  console.log('✅ [T5 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [T5 Test] FAILED:', err);
  process.exit(1);
});
