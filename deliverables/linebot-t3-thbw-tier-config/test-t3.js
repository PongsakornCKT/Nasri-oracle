/**
 * test-t3.js — Verification Test Suite for T3 THB/W Tier Config (#5)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { getThbPerWTier, defaultTierConfig } = require('./lib/thbw-tier-config');

async function runTests() {
  console.log('🧪 [T3 Test] Starting test suite...');

  // Test 1: 5kW system THB/W tier classification
  // 1-5kW rules: <=28 Economy, 28-35 Standard, >35 Premium
  const resEcon5 = getThbPerWTier(25.0, 5.0);
  assert.strictEqual(resEcon5.tier, 'Economy', '25 THB/W for 5kW should be Economy');
  assert.strictEqual(resEcon5.badge, '🟢 Economy', 'Badge should be 🟢 Economy');

  const resStd5 = getThbPerWTier(30.0, 5.0);
  assert.strictEqual(resStd5.tier, 'Standard', '30 THB/W for 5kW should be Standard');
  assert.strictEqual(resStd5.badge, '🔵 Standard', 'Badge should be 🔵 Standard');

  const resPrem5 = getThbPerWTier(40.0, 5.0);
  assert.strictEqual(resPrem5.tier, 'Premium', '40 THB/W for 5kW should be Premium');
  assert.strictEqual(resPrem5.badge, '⭐ Premium', 'Badge should be ⭐ Premium');

  // Test 2: 10kW system THB/W tier classification
  // 10-20kW rules: <=20 Economy, 20-25 Standard, >25 Premium
  const resEcon10 = getThbPerWTier(19.0, 10.0);
  assert.strictEqual(resEcon10.tier, 'Economy', '19 THB/W for 10kW should be Economy');

  const resPrem10 = getThbPerWTier(27.0, 10.0);
  assert.strictEqual(resPrem10.tier, 'Premium', '27 THB/W for 10kW should be Premium');

  // Test 3: Custom config override (testing config flexibility)
  const customConfig = {
    small: { maxKw: 5.0, econMax: 20.0, stdMax: 30.0 },
    medium: { maxKw: 20.0, econMax: 15.0, stdMax: 20.0 },
    large: { maxKw: 999.0, econMax: 12.0, stdMax: 15.0 }
  };
  const resCustom = getThbPerWTier(25.0, 5.0, customConfig);
  assert.strictEqual(resCustom.tier, 'Standard', 'Custom config override should classify 25 as Standard');

  console.log('✅ [T3 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [T3 Test] FAILED:', err);
  process.exit(1);
});
