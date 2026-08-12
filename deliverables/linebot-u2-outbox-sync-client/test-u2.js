/**
 * test-u2.js — Verification Test Suite for U2 Outbox Queue & Sync Client (#Phase04)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');

// Mock SQLite DB for standalone test execution
class MockSqliteDb {
  constructor() {
    this.outbox = new Map();
    this.autoInc = 1;
  }
  pragma() {}
  exec() {}
  prepare(sql) {
    const self = this;
    if (sql.includes('SELECT * FROM sync_outbox WHERE status = "pending"')) {
      return {
        all: (now) => Array.from(self.outbox.values()).filter(r => r.status === 'pending' && r.next_retry_at <= now)
      };
    }
    if (sql.includes('INSERT OR REPLACE INTO sync_outbox')) {
      return {
        run: (qtNo, payloadJson, ts) => {
          const id = self.autoInc++;
          self.outbox.set(id, { id: id, qt_no: qtNo, payload_json: payloadJson, status: 'pending', retry_count: 0, next_retry_at: 0, created_at: ts });
        }
      };
    }
    if (sql.includes('UPDATE sync_outbox SET status = "synced"')) {
      return {
        run: (id) => {
          if (self.outbox.has(id)) self.outbox.get(id).status = 'synced';
        }
      };
    }
    if (sql.includes('UPDATE sync_outbox SET status = "dead_letter"')) {
      return {
        run: (retries, id) => {
          if (self.outbox.has(id)) {
            self.outbox.get(id).status = 'dead_letter';
            self.outbox.get(id).retry_count = retries;
          }
        }
      };
    }
    if (sql.includes('UPDATE sync_outbox SET retry_count = ?')) {
      return {
        run: (retries, nextTry, id) => {
          if (self.outbox.has(id)) {
            self.outbox.get(id).retry_count = retries;
            self.outbox.get(id).next_retry_at = nextTry;
          }
        }
      };
    }
    return { get: () => null, all: () => [], run: () => ({}) };
  }
}

const createSyncOutboxClient = require('./lib/sync-outbox-client');

async function runTests() {
  console.log('🧪 [U2 Test] Starting test suite...');

  let fetchCalled = 0;
  let mockFetchShouldFail = false;
  let adminAlertText = '';

  const mockFetch = async (url, opts) => {
    fetchCalled++;
    assert.strictEqual(opts.headers['X-LF-Bot-Secret'], 'test_secret_abc', 'Header X-LF-Bot-Secret must be sent');
    if (mockFetchShouldFail) {
      return { ok: false, status: 500 };
    }
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };

  const mockDb = new MockSqliteDb();
  const client = createSyncOutboxClient({
    db: mockDb,
    fetchFn: mockFetch,
    botSecret: 'test_secret_abc',
    notifyAdmin: async (txt) => { adminAlertText = txt; }
  });

  // Test 1: Enqueue quotation
  const ok = client.enqueueQuotation('LINE-QT-001', { qt_no: 'LINE-QT-001', amount: 150000 });
  assert.strictEqual(ok, true, 'Enqueue should succeed');
  assert.strictEqual(mockDb.outbox.size, 1, 'Outbox size should be 1');

  // Test 2: Flush outbox successfully
  const flushRes = await client.flushOutbox();
  assert.strictEqual(flushRes.flushed, 1, 'Should flush 1 item successfully');
  assert.strictEqual(fetchCalled, 1, 'Mock fetch should be called exactly 1 time');
  assert.strictEqual(mockDb.outbox.get(1).status, 'synced', 'Outbox item status should be updated to synced');

  // Test 3: Dead-letter handling on 5th retry failure
  mockFetchShouldFail = true;
  client.enqueueQuotation('LINE-QT-FAIL', { qt_no: 'LINE-QT-FAIL' });
  const failItem = mockDb.outbox.get(2);
  failItem.retry_count = 4; // Set 4 prior retries

  await client.flushOutbox();
  assert.strictEqual(failItem.status, 'dead_letter', 'Item with 5 failures must become dead_letter');
  assert.ok(adminAlertText.includes('[SYNC DEAD-LETTER]'), 'Dead-letter must notify admin');

  console.log('✅ [U2 Test] All 3 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [U2 Test] FAILED:', err);
  process.exit(1);
});
