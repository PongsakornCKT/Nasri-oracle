/**
 * test-s1.js — Verification Test Suite for S1 Decouple Remaining Hardcoded Prices Phase 2 (#11)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { resolveAtmoceMiPrice, resolveSigenergyAccessory } = require('./lib/decouple-phase2');

async function runTests() {
  console.log('🧪 [S1 Test] Starting test suite...');

  // Test 1: ATMOCE MI-500 catalog price preference
  const mockCatalog = {
    'Inverters - ATMOCE': [
      { 'รุ่น': 'MI-500', 'ราคาขาย': '4600' }
    ],
    'Inverters - Sigenergy': [
      { 'รุ่น': 'HomePro SP-F', 'ราคาขาย': '34500' }
    ]
  };

  const miRes = resolveAtmoceMiPrice(mockCatalog, 'MI-500', 4400);
  assert.strictEqual(miRes.price, 4600, 'MI-500 price should prefer catalog value');
  assert.strictEqual(miRes.source, 'catalog', 'Source tag should be catalog');

  // Test 2: ATMOCE MI-500 fallback preservation when catalog is empty
  const miFallback = resolveAtmoceMiPrice({}, 'MI-500', 4400);
  assert.strictEqual(miFallback.price, 4400, 'MI-500 price should fall back to 4400 when catalog missing');
  assert.strictEqual(miFallback.source, 'fallback', 'Source tag should be fallback');

  // Test 3: Sigenergy Gateway catalog price preference
  const sigenRes = resolveSigenergyAccessory(mockCatalog, 'HomePro SP-F', 'Gateway HomePro SP-F', 33400);
  assert.strictEqual(sigenRes.price, 34500, 'Sigenergy Gateway price should prefer catalog value');
  assert.strictEqual(sigenRes.source, 'catalog', 'Source tag should be catalog');

  // Test 4: Sigenergy Gateway fallback preservation when item missing
  const sigenFallback = resolveSigenergyAccessory(mockCatalog, 'MissingGateway', 'Gateway Fallback', 15800);
  assert.strictEqual(sigenFallback.price, 15800, 'Sigenergy Gateway should fall back to hardcoded 15800');
  assert.strictEqual(sigenFallback.source, 'fallback', 'Source tag should be fallback');

  console.log('✅ [S1 Test] All 4 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [S1 Test] FAILED:', err);
  process.exit(1);
});
