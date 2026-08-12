/**
 * test-t6.js — Verification Test Suite for T6 Win/Loss Deal Tracking (#B9)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');

// Mock SQLite DB for standalone test execution
class MockSqliteDb {
  constructor() {
    this.outcomes = new Map();
  }
  pragma() {}
  exec() {}
  prepare(sql) {
    const self = this;
    if (sql.includes('SELECT status, category FROM qt_outcomes')) {
      return {
        all: () => Array.from(self.outcomes.values())
      };
    }
    if (sql.includes('INSERT OR REPLACE INTO qt_outcomes')) {
      return {
        run: (qtNo, status, category, note, userId, ts) => {
          self.outcomes.set(qtNo, { status: status, category: category, reason_note: note, user_id: userId, closed_at: ts });
        }
      };
    }
    return { get: () => null, all: () => [], run: () => ({}) };
  }
}

const createWinLossTracker = require('./lib/winloss-tracker');

async function runTests() {
  console.log('🧪 [T6 Test] Starting test suite...');

  const mockDb = new MockSqliteDb();
  const tracker = createWinLossTracker({ db: mockDb });

  // Test 1: Reason taxonomy parsing (P'Phong 4 categories: แพง, คู่แข่ง, เลื่อน, อื่นๆ)
  assert.strictEqual(tracker.parseReasonCategory('ลูกค้าบอกราคาแพงไปนิด').category, 'แพง', 'ราคาแพง should map to แพง');
  assert.strictEqual(tracker.parseReasonCategory('แพ้เจ้าอื่น').category, 'คู่แข่ง', 'เจ้าอื่น should map to คู่แข่ง');
  assert.strictEqual(tracker.parseReasonCategory('ขอเลื่อนไปทำปีหน้า').category, 'เลื่อน', 'เลื่อนปีหน้า should map to เลื่อน');
  assert.strictEqual(tracker.parseReasonCategory('เปลี่ยนใจไม่ทำแล้ว').category, 'อื่นๆ', 'Unmatched reason should map to อื่นๆ');

  // Test 2: Record Win and Loss outcomes
  tracker.recordOutcome('QT-1001', 'win', '', 'U1');
  tracker.recordOutcome('QT-1002', 'loss', 'แพงกว่าเจ้าอื่น', 'U1');
  tracker.recordOutcome('QT-1003', 'loss', 'เลื่อนโครงการ', 'U2');
  tracker.recordOutcome('QT-1004', 'win', '', 'U2');

  assert.strictEqual(mockDb.outcomes.size, 4, 'Should record 4 outcomes');

  // Test 3: Close rate summary from real data (2 wins out of 4 total = 50.0%)
  const summary = tracker.getCloseRateSummary();
  assert.strictEqual(summary.total, 4, 'Total deals should be 4');
  assert.strictEqual(summary.wins, 2, 'Wins should be 2');
  assert.strictEqual(summary.losses, 2, 'Losses should be 2');
  assert.strictEqual(summary.close_rate_pct, 50.0, 'Close rate should be 50.0% (NOT fake 0.72)');
  assert.strictEqual(summary.category_breakdown['แพง'], 1, 'Loss breakdown for แพง should be 1');
  assert.strictEqual(summary.category_breakdown['เลื่อน'], 1, 'Loss breakdown for เลื่อน should be 1');

  console.log('✅ [T6 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [T6 Test] FAILED:', err);
  process.exit(1);
});
