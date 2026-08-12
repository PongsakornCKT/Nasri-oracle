/**
 * test-q5.js — Verification Test Suite for Q5 Wire Finalprice Tab (#10)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { searchFinalprice } = require('./lib/finalprice-search');

async function runTests() {
  console.log('🧪 [Q5 Test] Starting test suite...');

  const mockCatalog = {
    Finalprice: [
      { 'ขนาด(W)': '5000', 'เฟส': '1', 'จำนวนแผง': '10', 'ราคาขาย': '129000', 'THB/W': '25.8' },
      { 'ขนาด(W)': '10000', 'เฟส': '3', 'จำนวนแผง': '20', 'ราคาขาย': '219000', 'THB/W': '21.9' }
    ]
  };

  // Test 1: Direct package match for 5kW 1-phase
  const res5k = searchFinalprice(mockCatalog, 'ราคา 5kW 1 เฟส เท่าไหร่');
  assert.ok(res5k && res5k.length > 0, 'Should match 5kW package');
  assert.strictEqual(res5k[0].size_kw, 5, 'Size should be 5kW');
  assert.strictEqual(res5k[0].price, 129000, 'Price should be 129,000');

  // Test 2: Direct package match for 10kW 3-phase
  const res10k = searchFinalprice(mockCatalog, 'ขอราคาแพ็กเกจ 10kW 3p');
  assert.ok(res10k && res10k.length > 0, 'Should match 10kW package');
  assert.strictEqual(res10k[0].size_kw, 10, 'Size should be 10kW');

  // Test 3: Component query fallback (e.g. "ราคาแผง AIKO") returns null for component search fallback
  const resComponent = searchFinalprice(mockCatalog, 'ขอราคาแผง AIKO 650W');
  assert.strictEqual(resComponent, null, 'Component specific query should return null to allow component fallback');

  // Test 4: Horus Guard — Null / Corrupt catalog degrades gracefully to null
  assert.strictEqual(searchFinalprice(null, '5kW'), null, 'Null catalog should return null');
  assert.strictEqual(searchFinalprice({}, '5kW'), null, 'Empty catalog object should return null');
  assert.strictEqual(searchFinalprice({ Finalprice: 'invalid' }, '5kW'), null, 'Corrupt Finalprice should return null');

  console.log('✅ [Q5 Test] All 4 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [Q5 Test] FAILED:', err);
  process.exit(1);
});
