/**
 * test-v2.js — Verification Test Suite for V2 PDPA Postback & Quick Reply (#LINE UX v2)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { buildPdpaConsentMessage } = require('./lib/pdpa-postback-builder');

async function runTests() {
  console.log('🧪 [V2 Test] Starting test suite...');

  // Test 1: Build PDPA consent message with Quick Replies
  const msg = buildPdpaConsentMessage('คุณสมชาย', 'QT-2026-0812-001');
  assert.strictEqual(msg.type, 'text', 'Message type should be text');
  assert.ok(msg.text.includes('คุณสมชาย'), 'Message text must include customer name');
  assert.ok(msg.quickReply && msg.quickReply.items, 'Message must contain quickReply items');
  assert.strictEqual(msg.quickReply.items.length, 2, 'Quick reply items count should be 2');

  // Test 2: Quick Reply postback data formatting
  const consentItem = msg.quickReply.items[0];
  assert.strictEqual(consentItem.action.label, '✅ ยินยอม', 'Consent button label must match');
  assert.strictEqual(consentItem.action.data, 'action=consent&qt=QT-2026-0812-001', 'Consent postback data must format action=consent&qt=...');

  const declineItem = msg.quickReply.items[1];
  assert.strictEqual(declineItem.action.label, '❌ ไม่ยินยอม', 'Decline button label must match');
  assert.strictEqual(declineItem.action.data, 'action=decline&qt=QT-2026-0812-001', 'Decline postback data must format action=decline&qt=...');

  console.log('✅ [V2 Test] All 2 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [V2 Test] FAILED:', err);
  process.exit(1);
});
