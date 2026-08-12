/**
 * test-w1.js — Verification Test Suite for W1 Cable & Protection Sizing (#16)
 * Verifies calculation accuracy against SPEC-cable-protection-sizing.md Master Matrix (1P & 3P, 5kW - 50kW).
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { calculateSizing } = require('./lib/cable-protection-sizer');

async function runTests() {
  console.log('🧪 [W1 Test] Starting test suite...');

  // Test 1: 1P 5.0kW (Inverter I_inv = 22.96A -> Breaker = 32A MCB 1P, AC Cable = 6.0 sq.mm)
  const res1P5k = calculateSizing({ inverterKw: 5.0, phase: 1, distanceMeters: 30 });
  assert.strictEqual(res1P5k.ac_breaker.rating_a, 32, '1P 5kW breaker should be 32A');
  assert.strictEqual(res1P5k.ac_breaker.type, 'MCB 1P', '1P breaker type should be MCB 1P');
  assert.strictEqual(res1P5k.ac_cable.sqmm, 6.0, '1P 5kW AC cable should be 6.0 sq.mm');

  // Test 2: 3P 10.0kW (Inverter I_inv = 14.58A -> Breaker = 25A MCB 3P, AC Cable = 6.0 sq.mm)
  const res3P10k = calculateSizing({ inverterKw: 10.0, phase: 3, distanceMeters: 30 });
  assert.strictEqual(res3P10k.ac_breaker.rating_a, 25, '3P 10kW breaker should be 25A');
  assert.strictEqual(res3P10k.ac_breaker.type, 'MCB 3P', '3P 10kW breaker type should be MCB 3P');
  assert.strictEqual(res3P10k.ac_cable.sqmm, 6.0, '3P 10kW AC cable should be 6.0 sq.mm');

  // Test 3: 3P 20.0kW (Inverter I_inv = 29.16A -> Breaker = 40A MCB 3P, AC Cable = 16.0 sq.mm)
  const res3P20k = calculateSizing({ inverterKw: 20.0, phase: 3, distanceMeters: 30 });
  assert.strictEqual(res3P20k.ac_breaker.rating_a, 40, '3P 20kW breaker should be 40A');
  assert.strictEqual(res3P20k.ac_cable.sqmm, 16.0, '3P 20kW AC cable should be 16.0 sq.mm');

  // Test 4: 3P 50.0kW Commercial (Inverter I_inv = 72.90A -> Breaker = 100A MCCB 3P, AC Cable = 50.0 sq.mm, DC SPD = 1100V)
  const res3P50k = calculateSizing({ inverterKw: 50.0, phase: 3, distanceMeters: 40 });
  assert.strictEqual(res3P50k.ac_breaker.rating_a, 100, '3P 50kW breaker should be 100A');
  assert.strictEqual(res3P50k.ac_breaker.type, 'MCCB 3P', '3P 50kW breaker type should be MCCB 3P');
  assert.strictEqual(res3P50k.dc_spd.voltage, '1100V DC', '3P 50kW DC SPD should be 1100V DC');

  // Test 5: Standard EIT/IEC spec references in items array
  assert.ok(res1P5k.items.length >= 5, 'Result items array must contain at least 5 component items');
  assert.ok(res1P5k.items[0].spec.includes('EIT 022013-22'), 'Items spec must reference EIT 022013-22 standard');

  console.log('✅ [W1 Test] All 5 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [W1 Test] FAILED:', err);
  process.exit(1);
});
