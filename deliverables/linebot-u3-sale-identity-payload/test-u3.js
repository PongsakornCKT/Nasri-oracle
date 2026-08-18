/**
 * test-u3.js — Verification Test Suite for U3 Sale Identity & Phone Normalizer (#B1)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { normalizePhone, buildSyncPayload } = require('./lib/sale-identity-payload');

async function runTests() {
  console.log('🧪 [U3 Test] Starting test suite...');

  // Test 1: Phone normalization (+66 -> 0, strip dashes/spaces)
  assert.strictEqual(normalizePhone('+66812345678'), '0812345678', '+66 prefix should convert to 0');
  assert.strictEqual(normalizePhone('081-234-5678'), '0812345678', 'Dashes should be stripped');
  assert.strictEqual(normalizePhone('081 234 5678'), '0812345678', 'Spaces should be stripped');
  assert.strictEqual(normalizePhone('66812345678'), '0812345678', '66 prefix (11 digits) should convert to 0');

  // Test 2: Build sync payload with sale_line_user_id
  const spec = { customer_name: 'คุณสมชาย', phone: '+66891234567', customer_address: 'กรุงเทพฯ' };
  const quoteResult = { quote_number: 'LINE-QT-001', brand: 'Huawei', size_kw: 10.0, grand_total: 250000 };
  const lineUserId = 'U1001_SALES_ID';

  const payload = buildSyncPayload(spec, quoteResult, lineUserId);
  assert.strictEqual(payload.quote_number, 'LINE-QT-001', 'Quote number must match');
  assert.strictEqual(payload.sale_line_user_id, 'U1001_SALES_ID', 'sale_line_user_id must match LINE user ID');
  assert.strictEqual(payload.customer_phone, '0891234567', 'Phone must be normalized to 0891234567');
  assert.strictEqual(payload.selling_price, 250000, 'Selling price must match grand_total');

  console.log('✅ [U3 Test] All 2 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [U3 Test] FAILED:', err);
  process.exit(1);
});
