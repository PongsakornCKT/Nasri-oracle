/**
 * test-r5.js — Verification Test Suite for R5 Keenoc Mounting Auto-Scale (#19)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { calculateKeenocMounting } = require('./lib/keenoc-mounting-calculator');

async function runTests() {
  console.log('🧪 [R5 Test] Starting test suite...');

  const mockCatalog = {
    'Mounting - Keenoc': [
      { 'รุ่น': 'Aluminum Rail 4200mm', 'ราคาขาย': '480' },
      { 'รุ่น': 'End Clamp 35mm', 'ราคาขาย': '38' },
      { 'รุ่น': 'Mid Clamp 35mm', 'ราคาขาย': '32' },
      { 'รุ่น': 'L-Feet 80mm', 'ราคาขาย': '48' },
      { 'รุ่น': 'Tile Roof Hook', 'ราคาขาย': '125' }
    ]
  };

  // Test 1: Formula Verification for 10 panels on Metal Roof
  // Rail = 10, End Clamp = 20, Mid Clamp = (10-1)*2 = 18, L-Feet = 20
  const itemsMetal = calculateKeenocMounting(mockCatalog, 10, 'metal');
  assert.strictEqual(itemsMetal.length, 4, 'Should generate 4 mounting items');

  const rail = itemsMetal.find(i => i.part_number === 'RAIL-4200');
  assert.strictEqual(rail.quantity, 10, 'Rail qty should equal panel count (10)');
  assert.strictEqual(rail.unit_cost, 480, 'Rail price should come from catalog (480)');

  const endClamp = itemsMetal.find(i => i.part_number === 'END-CLAMP');
  assert.strictEqual(endClamp.quantity, 20, 'End Clamp qty should equal panel count * 2 (20)');

  const midClamp = itemsMetal.find(i => i.part_number === 'MID-CLAMP');
  assert.strictEqual(midClamp.quantity, 18, 'Mid Clamp qty should equal (panel count - 1) * 2 (18)');

  const lFeet = itemsMetal.find(i => i.part_number === 'L-FEET-80');
  assert.strictEqual(lFeet.quantity, 20, 'L-Feet qty should equal panel count * 2 (20)');

  // Test 2: Tile Roof Anchor Selection
  const itemsTile = calculateKeenocMounting(mockCatalog, 10, 'tile');
  const tileHook = itemsTile.find(i => i.part_number === 'TILE-HOOK');
  assert.ok(tileHook, 'Tile roof should select TILE-HOOK anchor');
  assert.strictEqual(tileHook.unit_cost, 125, 'Tile hook price should come from catalog (125)');

  // Test 3: Zero or invalid panel count returns empty array
  assert.strictEqual(calculateKeenocMounting(mockCatalog, 0, 'metal').length, 0, 'Zero panel count should return empty array');

  console.log('✅ [R5 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [R5 Test] FAILED:', err);
  process.exit(1);
});
