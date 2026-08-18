/**
 * test-q7.js — Verification Test Suite for Q7 Catalog Price Decoupling (#11)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { lookupPriceWithFallback } = require('./lib/catalog-price-helper');

async function runTests() {
  console.log('🧪 [Q7 Test] Starting test suite...');

  // Test 1: Preference for Catalog price when available
  const mockCatalog = {
    'Combiner Box & Others': [
      { 'รายการ': 'Smart Dongle WIFI', 'ราคาขาย': '1850' }
    ]
  };

  const catalogRes = lookupPriceWithFallback(mockCatalog, 'Combiner Box & Others', 'Smart Dongle WIFI', 1730);
  assert.strictEqual(catalogRes.price, 1850, 'Price should come from Catalog when available');
  assert.strictEqual(catalogRes.source, 'catalog', 'Source tag should be catalog');

  // Test 2: Fallback reservation when item not found in catalog
  const fallbackRes = lookupPriceWithFallback(mockCatalog, 'Combiner Box & Others', 'NonExistentItem', 9900);
  assert.strictEqual(fallbackRes.price, 9900, 'Price should fallback to hardcoded default');
  assert.strictEqual(fallbackRes.source, 'fallback', 'Source tag should be fallback');

  // Test 3: Fallback reservation when catalog sheet is missing
  const missingSheetRes = lookupPriceWithFallback({}, 'MissingSheet', 'Smart Dongle WIFI', 1730);
  assert.strictEqual(missingSheetRes.price, 1730, 'Missing sheet should degrade to hardcoded fallback');
  assert.strictEqual(missingSheetRes.source, 'fallback', 'Source tag should be fallback');

  console.log('✅ [Q7 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [Q7 Test] FAILED:', err);
  process.exit(1);
});
