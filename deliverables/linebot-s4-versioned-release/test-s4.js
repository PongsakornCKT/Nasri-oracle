/**
 * test-s4.js — Verification Test Suite for S4 Versioned Release & Rollback (#S4)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('🧪 [S4 Test] Starting test suite...');

  const scriptPath = path.join(__dirname, 'scripts', 'qsolar-release.sh');
  assert.strictEqual(fs.existsSync(scriptPath), true, 'qsolar-release.sh script must exist');

  // Test 1: Test --release flag execution
  try {
    execSync(`bash "${scriptPath}" --release`, { cwd: __dirname });
    const releasesDir = path.join(__dirname, 'releases');
    assert.strictEqual(fs.existsSync(releasesDir), true, 'releases/ directory should be created');
    
    const latestFile = path.join(releasesDir, 'LATEST_RELEASE');
    assert.strictEqual(fs.existsSync(latestFile), true, 'LATEST_RELEASE file should exist');
    const latestTag = fs.readFileSync(latestFile, 'utf8').trim();
    assert.ok(latestTag.startsWith('qsolar-v'), 'Release tag should start with qsolar-v');

    const manifestFile = path.join(releasesDir, latestTag, 'manifest.sha256');
    assert.strictEqual(fs.existsSync(manifestFile), true, 'manifest.sha256 file should exist');

    // Test 2: Test --rollback flag execution
    execSync(`bash "${scriptPath}" --rollback "${latestTag}"`, { cwd: __dirname });
    const rollbackDir = path.join(releasesDir, `rollback-${latestTag}`);
    assert.strictEqual(fs.existsSync(rollbackDir), true, 'rollback directory should be created');

    console.log('✅ [S4 Test] All 2 assertion checks PASSED cleanly!');
  } finally {
    // Cleanup temporary releases directory created during test
    const releasesDir = path.join(__dirname, 'releases');
    if (fs.existsSync(releasesDir)) {
      fs.rmSync(releasesDir, { recursive: true, force: true });
    }
  }
}

runTests().catch(err => {
  console.error('❌ [S4 Test] FAILED:', err);
  process.exit(1);
});
