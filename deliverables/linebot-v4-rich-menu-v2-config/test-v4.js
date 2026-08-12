/**
 * test-v4.js — Verification Test Suite for V4 Rich Menu v2 Config (#Phase04)
 * Environment-independent test suite.
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { getRichMenuConfig, verifyActionMapping } = require('./lib/rich-menu-v2');

async function runTests() {
  console.log('🧪 [V4 Test] Starting test suite...');

  // Test 1: Validate Rich Menu JSON schema structure
  const config = getRichMenuConfig();
  assert.strictEqual(config.size.width, 2500, 'Rich menu width must be 2500px');
  assert.strictEqual(config.size.height, 1686, 'Rich menu height must be 1686px');
  assert.strictEqual(config.areas.length, 6, 'Rich menu must contain 6 touch areas');

  // Test 2: Verify 100% text command handlers mapping in app.js
  config.areas.forEach((area, i) => {
    const text = area.action.text;
    assert.ok(text, `Area ${i+1} must specify action text`);
    assert.strictEqual(verifyActionMapping(text), true, `Action "${text}" MUST map to an active handler in app.js`);
  });

  console.log('✅ [V4 Test] All 2 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [V4 Test] FAILED:', err);
  process.exit(1);
});
