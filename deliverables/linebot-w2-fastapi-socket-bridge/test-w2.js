/**
 * test-w2.js — Verification Test Suite for W2 FastAPI Socket Bridge (#Phase04)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const createQsolarSocketClient = require('./lib/qsolar-socket-client');

async function runTests() {
  console.log('🧪 [W2 Test] Starting test suite...');

  // Test 1: Default behavior is DISABLED (process.env.QSOLAR_USE_SOCKET is unset) -> Returns ok: false for safety
  delete process.env.QSOLAR_USE_SOCKET;
  const disabledClient = createQsolarSocketClient();
  assert.strictEqual(disabledClient.isEnabled(), false, 'Default socket client MUST be disabled');

  const disabledRes = await disabledClient.getHealth();
  assert.strictEqual(disabledRes.ok, false, 'Disabled socket request MUST return ok: false to trigger spawn fallback');
  assert.ok(disabledRes.error.includes('Socket disabled'), 'Error message must state socket is disabled');

  // Test 2: Opt-in enabled behavior (process.env.QSOLAR_USE_SOCKET = '1') with non-existent socket -> Graceful fallback
  process.env.QSOLAR_USE_SOCKET = '1';
  const enabledClient = createQsolarSocketClient({ socketPath: '/tmp/nonexistent_test_qsolar.sock', timeoutMs: 500 });
  assert.strictEqual(enabledClient.isEnabled(), true, 'Enabled socket client isEnabled() MUST be true when QSOLAR_USE_SOCKET=1');

  const fallbackRes = await enabledClient.getHealth();
  assert.strictEqual(fallbackRes.ok, false, 'Non-existent socket MUST gracefully return ok: false without crashing');
  assert.ok(fallbackRes.error.includes('Socket connection failed'), 'Error message should indicate connection failure for spawn fallback');

  // Reset env
  delete process.env.QSOLAR_USE_SOCKET;

  console.log('✅ [W2 Test] All 2 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [W2 Test] FAILED:', err);
  process.exit(1);
});
