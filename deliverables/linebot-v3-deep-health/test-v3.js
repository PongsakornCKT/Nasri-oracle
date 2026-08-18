/**
 * test-v3.js — Verification Test Suite for V3 Deep /health + Build Info (#Phase04)
 * Environment-independent test suite.
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { getDeepHealthStatus, getBuildInfo } = require('./lib/deep-health-checker');

// Mock SQLite DB for standalone test execution
class MockSqliteDb {
  prepare(sql) {
    if (sql.includes('SELECT 1')) return { get: () => ({ '1': 1 }) };
    if (sql.includes('SELECT COUNT(*) as cnt FROM sync_outbox')) return { get: () => ({ cnt: 3 }) };
    return { get: () => null, all: () => [] };
  }
}

async function runTests() {
  console.log('🧪 [V3 Test] Starting test suite...');

  // Test 1: Deep health sub-checks aggregation with mock DB
  const mockDb = new MockSqliteDb();
  const subChecks = getDeepHealthStatus(mockDb, { catalogLkgAgeSec: 120, followupLastRun: '2026-08-12T10:00:00Z', pushQuotaUsagePct: 15.5 });

  assert.strictEqual(subChecks.sqlite_ok, true, 'sqlite_ok should be true for responsive DB');
  assert.strictEqual(subChecks.outbox_pending_count, 3, 'outbox_pending_count should match mock DB count');
  assert.strictEqual(subChecks.catalog_lkg_age_sec, 120, 'catalog_lkg_age_sec should match passed option');
  assert.strictEqual(subChecks.push_quota_usage_pct, 15.5, 'push_quota_usage_pct should match passed option');

  // Test 2: Build info endpoint generator
  const buildInfo = getBuildInfo();
  assert.ok(buildInfo.git_sha, 'Build info must contain git_sha');
  assert.ok(buildInfo.deploy_at, 'Build info must contain deploy_at');
  assert.strictEqual(buildInfo.service, 'ai.enervia.co.th', 'Service name must match ai.enervia.co.th');

  console.log('✅ [V3 Test] All 2 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [V3 Test] FAILED:', err);
  process.exit(1);
});
