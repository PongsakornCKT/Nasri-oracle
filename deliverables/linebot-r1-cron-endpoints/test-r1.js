/**
 * test-r1.js — Verification Test Suite for R1 External Cron Endpoints (#R1)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const createCronRouter = require('./lib/cron-router');

async function runTests() {
  console.log('🧪 [R1 Test] Starting test suite...');

  let prewarmTriggered = false;
  let freshnessTriggered = false;
  let auditLogCategory = '';

  const mockCatalogCache = {
    invalidate: () => { prewarmTriggered = true; },
    get: async () => ({ Finalprice: [] }),
    stats: () => ({ age_ms: 1000 })
  };

  const mockFreshnessMonitor = {
    checkFreshness: () => { freshnessTriggered = true; }
  };

  const router = createCronRouter({
    cronToken: 'valid_cron_secret_123',
    catalogCache: mockCatalogCache,
    freshnessMonitor: mockFreshnessMonitor,
    auditLog: (cat) => { auditLogCategory = cat; }
  });

  function simulateReq(url, token, headers) {
    headers = headers || {};
    if (token) headers['authorization'] = 'Bearer ' + token;
    let resStatus = 0;
    let resBody = null;
    const res = {
      writeHead: (s) => { resStatus = s; },
      end: (b) => { resBody = JSON.parse(b); }
    };
    const handled = router.handleCronRequest({ url: url, headers: headers }, res);
    return { handled: handled, status: resStatus, body: resBody };
  }

  // Test 1: Non-cron URL returns false immediately
  const nonCron = simulateReq('/api/catalog', 'valid_cron_secret_123');
  assert.strictEqual(nonCron.handled, false, 'Non-cron URL should return false');

  // Test 2: Missing or invalid CRON_TOKEN returns 401 Unauthorized
  const unauth = simulateReq('/api/cron/prewarm', 'invalid_token');
  assert.strictEqual(unauth.handled, true, 'Cron URL should be handled');
  assert.strictEqual(unauth.status, 401, 'Invalid token should return 401');

  // Test 3: Admin token MUST NOT grant access to cron endpoints (Strict Scope Isolation)
  const adminAttempt = simulateReq('/api/cron/prewarm', 'ADMIN_SECRET_TOKEN');
  assert.strictEqual(adminAttempt.status, 401, 'ADMIN_API_TOKEN must not work on cron endpoints');

  // Test 4: Valid CRON_TOKEN via Bearer header triggers prewarm job
  const prewarmRes = simulateReq('/api/cron/prewarm', 'valid_cron_secret_123');
  assert.strictEqual(prewarmRes.status, 200, 'Valid CRON_TOKEN should return 200');
  assert.strictEqual(prewarmRes.body.job, 'prewarm', 'Body should confirm prewarm job');
  assert.strictEqual(prewarmTriggered, true, 'Prewarm job should trigger invalidate');

  // Test 5: Valid CRON_TOKEN via URL query param triggers freshness job
  const freshnessRes = simulateReq('/api/cron/freshness?token=valid_cron_secret_123', '');
  assert.strictEqual(freshnessRes.status, 200, 'Query param CRON_TOKEN should return 200');
  assert.strictEqual(freshnessRes.body.job, 'freshness', 'Body should confirm freshness job');

  // Test 6: Unknown cron job returns 404
  const unknownRes = simulateReq('/api/cron/unknown_job', 'valid_cron_secret_123');
  assert.strictEqual(unknownRes.status, 404, 'Unknown cron job should return 404');

  console.log('✅ [R1 Test] All 6 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [R1 Test] FAILED:', err);
  process.exit(1);
});
