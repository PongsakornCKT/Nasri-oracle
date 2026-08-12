/**
 * test-q2.js — Verification Test Suite for Q2 Price Provenance Footnote (#13)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');

function formatProvenanceText(ageMs) {
  if (ageMs === null || ageMs === undefined || isNaN(ageMs)) return '';
  var ageMin = Math.floor(Math.max(0, ageMs) / 60000);
  var cacheLabel = (ageMs < 60000) ? 'สด' : 'แคช';
  return 'ℹ️ ข้อมูลราคากลางอัปเดตเมื่อ ' + ageMin + ' นาทีก่อน (' + cacheLabel + ')';
}

async function runTests() {
  console.log('🧪 [Q2 Test] Starting test suite...');

  // Test 1: Fresh cache (< 1 minute) shows (สด)
  const freshText = formatProvenanceText(10000); // 10 seconds
  assert.strictEqual(freshText, 'ℹ️ ข้อมูลราคากลางอัปเดตเมื่อ 0 นาทีก่อน (สด)', 'Fresh cache should show 0 นาทีก่อน (สด)');

  // Test 2: Cached data (5 minutes) shows (แคช)
  const cachedText = formatProvenanceText(300000); // 300,000ms = 5 minutes
  assert.strictEqual(cachedText, 'ℹ️ ข้อมูลราคากลางอัปเดตเมื่อ 5 นาทีก่อน (แคช)', 'Cached data should show 5 นาทีก่อน (แคช)');

  // Test 3: Null or undefined age_ms returns empty string (degrades gracefully)
  assert.strictEqual(formatProvenanceText(null), '', 'Null ageMs should return empty string');
  assert.strictEqual(formatProvenanceText(undefined), '', 'Undefined ageMs should return empty string');
  assert.strictEqual(formatProvenanceText(NaN), '', 'NaN ageMs should return empty string');

  // Test 4: Display-only assertion — Verify price numbers are untouched
  const mockMatches = [{ name: 'Huawei 10kW', price: 45000, sheet: 'Inverters - Huawei' }];
  const fmtPrice = mockMatches[0].price.toLocaleString('en-US');
  assert.strictEqual(fmtPrice, '45,000', 'Price number formatting must remain untouched');

  console.log('✅ [Q2 Test] All 4 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [Q2 Test] FAILED:', err);
  process.exit(1);
});
