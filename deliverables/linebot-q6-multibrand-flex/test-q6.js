/**
 * test-q6.js — Verification Test Suite for Q6 Multi-Brand Comparison Flex (#6)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { isCompareQuery, buildMultiBrandCompareFlex } = require('./lib/multibrand-flex');

async function runTests() {
  console.log('🧪 [Q6 Test] Starting test suite...');

  // Test 1: Query detection
  assert.strictEqual(isCompareQuery('10kW 3 เฟส ยี่ห้อไหนดี'), true, 'Should match "ยี่ห้อไหนดี"');
  assert.strictEqual(isCompareQuery('เทียบราคา 5kW'), true, 'Should match "เทียบราคา"');
  assert.strictEqual(isCompareQuery('ขอราคาแผง AIKO'), false, 'Direct component price query should not match compare');

  // Test 2: Multi-brand Flex generation & Cheap -> Expensive sorting & Tier Badges
  const mockCatalog = {
    'Inverters - ATMOCE': [
      { 'รุ่น': 'ATMOCE 5kW 1P', 'ราคา': '25000', 'kw': '5kW' }
    ],
    'Inverters - Huawei': [
      { 'รุ่น': 'SUN2000-5KTL-L1', 'ราคา': '38000', 'kw': '5kW' }
    ],
    'Inverters - Solis': [
      { 'รุ่น': 'Solis-1P5K-4G', 'ราคา': '29000', 'kw': '5kW' }
    ]
  };

  const flex = buildMultiBrandCompareFlex(mockCatalog, 'เทียบราคา 5kW 1P');
  assert.ok(flex, 'Should return Flex payload');
  assert.strictEqual(flex.type, 'flex', 'Payload type should be flex');
  assert.strictEqual(flex.contents.type, 'carousel', 'Contents type should be carousel');

  const bubbles = flex.contents.contents;
  assert.strictEqual(bubbles.length, 3, 'Should generate 3 brand bubbles');

  // Verify cheap -> expensive sorting (ATMOCE 25k -> Solis 29k -> Huawei 38k)
  assert.strictEqual(bubbles[0].header.contents[1].text, 'ATMOCE', 'Cheapest brand should be ATMOCE');
  assert.strictEqual(bubbles[0].header.contents[0].text, '🟢 Economy', 'Cheapest brand should have Economy badge');

  assert.strictEqual(bubbles[1].header.contents[1].text, 'Solis', 'Second brand should be Solis');
  assert.strictEqual(bubbles[1].header.contents[0].text, '🔵 Standard / Value', 'Second brand should have Standard badge');

  assert.strictEqual(bubbles[2].header.contents[1].text, 'Huawei', 'Third brand should be Huawei');
  assert.strictEqual(bubbles[2].header.contents[0].text, '⭐ Premium', 'Third brand should have Premium badge');

  console.log('✅ [Q6 Test] All 2 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [Q6 Test] FAILED:', err);
  process.exit(1);
});
