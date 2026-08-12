/**
 * test-u4.js — Verification Test Suite for U4 Dashboard Sync Badge (#B6)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { getPendingBadgeText, getSyncedBadgeText, createSyncUpdateMessage } = require('./lib/sync-badge-builder');

async function runTests() {
  console.log('🧪 [U4 Test] Starting test suite...');

  // Test 1: Initial pending badge text
  const pendingText = getPendingBadgeText();
  assert.strictEqual(pendingText, '⏳ รอขึ้น dashboard', 'Initial badge text must be ⏳ รอขึ้น dashboard');

  // Test 2: Synced badge text with lead ID
  const syncedTextWithLead = getSyncedBadgeText(105);
  assert.strictEqual(syncedTextWithLead, '✓ ขึ้น dashboard แล้ว (lead #105)', 'Synced badge should include lead ID #105');

  const syncedTextNoLead = getSyncedBadgeText(null);
  assert.strictEqual(syncedTextNoLead, '✓ ขึ้น dashboard แล้ว', 'Synced badge without lead ID should format cleanly');

  // Test 3: Create sync update message for lPush
  const updateMsg = createSyncUpdateMessage('LINE-QT-001', 105);
  assert.strictEqual(updateMsg.type, 'text', 'Message type should be text');
  assert.ok(updateMsg.text.includes('ขึ้น dashboard เรียบร้อยแล้ว (Lead #105)'), 'Update text should contain lead ID notification');

  console.log('✅ [U4 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [U4 Test] FAILED:', err);
  process.exit(1);
});
