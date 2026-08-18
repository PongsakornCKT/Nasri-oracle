/**
 * test-r2.js — Verification Test Suite for R2 Webhook Redelivery Dedup (#R2)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');

// Mock SQLite DB for standalone test execution
class MockSqliteDb {
  constructor() {
    this.rows = new Map();
  }
  pragma() {}
  exec() {}
  prepare(sql) {
    const self = this;
    if (sql.includes('SELECT processed_at FROM processed_events')) {
      return {
        get: (id) => self.rows.has(id) ? { processed_at: self.rows.get(id) } : null
      };
    }
    if (sql.includes('INSERT OR IGNORE INTO processed_events')) {
      return {
        run: (id, type, ts) => {
          if (!self.rows.has(id)) self.rows.set(id, ts);
        }
      };
    }
    if (sql.includes('DELETE FROM processed_events')) {
      return {
        run: (cutoffTs) => {
          let count = 0;
          for (const [id, ts] of self.rows.entries()) {
            if (ts < cutoffTs) {
              self.rows.delete(id);
              count++;
            }
          }
          return { changes: count };
        }
      };
    }
    return { get: () => null, run: () => ({}) };
  }
}

const createWebhookDedup = require('./lib/webhook-dedup');

async function runTests() {
  console.log('🧪 [R2 Test] Starting test suite...');

  const mockDb = new MockSqliteDb();
  const dedup = createWebhookDedup({ db: mockDb, ttlDays: 7 });

  // Test 1: First event processing is allowed (returns false for duplicate check)
  const event1 = 'evt_line_1001_abc';
  const isDup1 = dedup.isDuplicateAndRecord(event1, 'message');
  assert.strictEqual(isDup1, false, 'First occurrence of eventId should not be flagged as duplicate');

  // Test 2: Redelivered duplicate event is rejected (returns true for duplicate check)
  const isDup2 = dedup.isDuplicateAndRecord(event1, 'message');
  assert.strictEqual(isDup2, true, 'Second occurrence of same eventId MUST be flagged as duplicate');

  // Test 3: Different eventId is allowed
  const event2 = 'evt_line_1002_def';
  const isDup3 = dedup.isDuplicateAndRecord(event2, 'message');
  assert.strictEqual(isDup3, false, 'Different eventId should be allowed');

  // Test 4: TTL Cleanup — Purges records older than 7 days
  const oldEvent = 'evt_old_stale_999';
  mockDb.rows.set(oldEvent, Date.now() - (8 * 24 * 60 * 60 * 1000)); // 8 days old
  assert.strictEqual(mockDb.rows.has(oldEvent), true, 'Old event should be present before cleanup');

  const purgedCount = dedup.cleanupOldEvents();
  assert.strictEqual(purgedCount, 1, 'Cleanup should purge 1 old event');
  assert.strictEqual(mockDb.rows.has(oldEvent), false, 'Old event should be deleted after cleanup');

  // Test 5: Missing or null eventId degrades gracefully (returns false)
  assert.strictEqual(dedup.isDuplicateAndRecord(null, 'message'), false, 'Null eventId should return false gracefully');
  assert.strictEqual(dedup.isDuplicateAndRecord('', 'message'), false, 'Empty eventId should return false gracefully');

  console.log('✅ [R2 Test] All 5 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [R2 Test] FAILED:', err);
  process.exit(1);
});
