/**
 * test-q3.js — Verification Test Suite for Q3 Sheet Freshness Alert (#8)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const createFreshnessMonitor = require('./lib/sheet-freshness-monitor');

async function runTests() {
  console.log('🧪 [Q3 Test] Starting test suite...');

  let adminNotifyCount = 0;
  let adminNotifyText = '';
  let alertErrorCount = 0;
  let alertErrorCategory = '';
  let alertErrorMsg = '';
  let invalidateCalled = false;

  const mockCache = {
    invalidate: () => { invalidateCalled = true; }
  };

  const monitor = createFreshnessMonitor({
    catalogCache: mockCache,
    notifyAdmin: async (text) => { adminNotifyCount++; adminNotifyText = text; },
    alertAdminError: (category, err) => { alertErrorCount++; alertErrorCategory = category; alertErrorMsg = (err && err.message) || String(err); },
    staleThresholdMs: 4 * 60 * 60 * 1000,
    priceSpikeRatio: 0.10
  });

  // Test 1: Fresh cache (< 4h) & initial prices — no alerts
  const catalogV1 = {
    Finalprice: [
      { 'ขนาด(W)': '5000', 'เฟส': '1', 'ราคาขาย': '129000' },
      { 'ขนาด(W)': '10000', 'เฟส': '3', 'ราคาขาย': '219000' }
    ]
  };

  monitor.checkFreshness(catalogV1, { age_ms: 100000 }); // 100s old
  assert.strictEqual(adminNotifyCount, 0, 'Fresh cache should not trigger notifyAdmin');
  assert.strictEqual(alertErrorCount, 0, 'Initial price baseline should not trigger price spike alert');

  // Test 2: Stale cache (> 4h) triggers stale alert & invalidates cache
  monitor.checkFreshness(catalogV1, { age_ms: 5 * 3600 * 1000 }); // 5 hours old
  assert.strictEqual(adminNotifyCount, 1, 'Stale cache (>4h) should trigger notifyAdmin');
  assert.ok(adminNotifyText.includes('แคชราคากลางหมดอายุ'), 'Notification text should mention cache expiration');
  assert.strictEqual(invalidateCalled, true, 'Stale cache should trigger cache.invalidate()');

  // Test 3: Price change <= 10% (5% increase) — no price spike alert
  const catalogV2 = {
    Finalprice: [
      { 'ขนาด(W)': '5000', 'เฟส': '1', 'ราคาขาย': '135450' }, // 129000 * 1.05 = +5%
      { 'ขนาด(W)': '10000', 'เฟส': '3', 'ราคาขาย': '219000' }
    ]
  };
  monitor.checkFreshness(catalogV2, { age_ms: 1000 });
  assert.strictEqual(alertErrorCount, 0, '5% price change should not trigger price spike alert');

  // Test 4: Price change > 10% (20% increase) — triggers price spike alert
  const catalogV3 = {
    Finalprice: [
      { 'ขนาด(W)': '5000', 'เฟส': '1', 'ราคาขาย': '162540' }, // 135450 * 1.20 = +20%
      { 'ขนาด(W)': '10000', 'เฟส': '3', 'ราคาขาย': '219000' }
    ]
  };
  monitor.checkFreshness(catalogV3, { age_ms: 1000 });
  assert.strictEqual(alertErrorCount, 1, '20% price change (>10%) should trigger alertAdminError');
  assert.strictEqual(alertErrorCategory, 'price-spike', 'Alert category should be price-spike');
  assert.ok(alertErrorMsg.includes('เพิ่มขึ้น 20.0%'), 'Alert message should detail price increase percentage');

  console.log('✅ [Q3 Test] All 4 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [Q3 Test] FAILED:', err);
  process.exit(1);
});
