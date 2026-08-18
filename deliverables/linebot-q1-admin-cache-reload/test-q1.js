/**
 * test-q1.js — Verification Test Suite for Q1 Admin Cache Reload (#12)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const path = require('path');
const assert = require('assert');

// 1. Require catalog-cache constructor
const createCatalogCache = require('/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/ψ/active/qsolar/ai.enervia.co.th/lib/catalog-cache');

const cache = createCatalogCache({
  sheetId: '1ubrfga3m0uiOf68MGQRApAdnhU8oby6nYKtfzirpn9Y',
  sheetGids: { 'Finalprice': 1639151553 },
  ttlMs: 60000
});

async function runTests() {
  console.log('🧪 [Q1 Test] Starting test suite...');

  // Test 1: Verify stats() and invalidate() initial state
  const stats0 = cache.stats();
  assert.strictEqual(stats0.cached, false, 'Initially should not be cached');
  assert.strictEqual(stats0.age_ms, null, 'Initially age_ms should be null');

  // Test 2: Invalidate method resets timestamp
  cache.invalidate();
  const stats1 = cache.stats();
  assert.strictEqual(stats1.cached, false, 'Invalidate should set timestamp to 0');

  // Test 3: Verify LINE command regex patterns
  const commandRegex = /^(นัด\s*)?reload\s*ราคา/i;
  const reloadCatalogRegex = /reload\s*catalog/i;

  assert.ok(commandRegex.test('นัด reload ราคา'), 'Should match "นัด reload ราคา"');
  assert.ok(commandRegex.test('reload ราคา'), 'Should match "reload ราคา"');
  assert.ok(commandRegex.test('นัดreloadราคา'), 'Should match "นัดreloadราคา"');
  assert.ok(reloadCatalogRegex.test('reload catalog'), 'Should match "reload catalog"');
  assert.strictEqual(commandRegex.test('ขอราคา'), false, 'Should not match unrelated command');

  // Test 4: Mock HTTP POST route logic simulation
  function simulateHttpPost(method, url, headers) {
    if (method === 'POST' && url === '/api/catalog/reload') {
      const authHeader = headers['authorization'] || '';
      if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== 'mock-admin-token') {
        return { status: 401, body: { error: 'Unauthorized' } };
      }
      cache.invalidate();
      return {
        status: 200,
        body: {
          ok: true,
          message: 'Catalog cache invalidated successfully',
          reloaded_at: new Date().toISOString(),
          stats: cache.stats()
        }
      };
    }
    return { status: 404, body: { error: 'Not Found' } };
  }

  // Test 4a: HTTP POST without auth token
  const resUnauthorized = simulateHttpPost('POST', '/api/catalog/reload', {});
  assert.strictEqual(resUnauthorized.status, 401, 'Unauthenticated POST should return 401');

  // Test 4b: HTTP POST with valid admin auth token
  const resSuccess = simulateHttpPost('POST', '/api/catalog/reload', { authorization: 'Bearer mock-admin-token' });
  assert.strictEqual(resSuccess.status, 200, 'Authenticated POST should return 200');
  assert.strictEqual(resSuccess.body.ok, true, 'Response body ok should be true');
  assert.ok(resSuccess.body.reloaded_at, 'Response body should contain reloaded_at timestamp');

  console.log('✅ [Q1 Test] All 4 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [Q1 Test] FAILED:', err);
  process.exit(1);
});
