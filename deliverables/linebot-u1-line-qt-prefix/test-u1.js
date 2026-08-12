/**
 * test-u1.js — Verification Test Suite for U1 LINE QT Prefix (#B2)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { ensureLinePrefix, normalizeQtQuery, getQtRegexPattern } = require('./lib/line-qt-prefix');

async function runTests() {
  console.log('🧪 [U1 Test] Starting test suite...');

  // Test 1: ensureLinePrefix prepends "LINE-" to raw QT numbers
  const rawQt = 'QT-2026-0812-001';
  const prefixed = ensureLinePrefix(rawQt);
  assert.strictEqual(prefixed, 'LINE-QT-2026-0812-001', 'Raw QT number must be prefixed with LINE-');

  // Test 2: Idempotency check — Already prefixed number stays intact without double-prefixing
  const doubleCheck = ensureLinePrefix('LINE-QT-2026-0812-001');
  assert.strictEqual(doubleCheck, 'LINE-QT-2026-0812-001', 'Already prefixed QT number must not be double-prefixed');

  // Test 3: normalizeQtQuery strips "LINE-" prefix for flexible DB search
  const normalized = normalizeQtQuery('LINE-QT-2026-0812-001');
  assert.strictEqual(normalized, 'QT-2026-0812-001', 'Normalization should strip LINE- prefix');

  // Test 4: getQtRegexPattern matches both legacy QT- and LINE-QT-
  const regex = getQtRegexPattern();
  const sampleText = 'ดูใบเสนอ QT-1001 และ LINE-QT-1002';
  const matches = sampleText.match(regex);
  assert.ok(matches, 'Regex should match sample text');
  assert.strictEqual(matches.length, 2, 'Should match both QT-1001 and LINE-QT-1002');
  assert.strictEqual(matches[0], 'QT-1001', 'First match should be QT-1001');
  assert.strictEqual(matches[1], 'LINE-QT-1002', 'Second match should be LINE-QT-1002');

  console.log('✅ [U1 Test] All 4 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [U1 Test] FAILED:', err);
  process.exit(1);
});
