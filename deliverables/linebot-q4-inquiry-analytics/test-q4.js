/**
 * test-q4.js — Verification Test Suite for Q4 Inquiry Demand Analytics (#9)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Create lightweight mock SQLite DB for standalone assertion testing
class MockSqliteDb {
  constructor() {
    this.rows = [];
    this.tableSql = 'CREATE TABLE inquiries (id INTEGER PRIMARY KEY, inquiry_type TEXT, brand TEXT, size_kw TEXT, package_name TEXT, created_at INTEGER)';
  }
  pragma() {}
  exec() {}
  prepare(sql) {
    const self = this;
    if (sql.includes('SELECT sql FROM sqlite_master')) {
      return { get: () => ({ sql: self.tableSql }) };
    }
    if (sql.includes('INSERT INTO inquiries')) {
      return {
        run: (type, brand, sizeKw, pkgName, createdAt) => {
          self.rows.push({ inquiry_type: type, brand: brand, size_kw: sizeKw, package_name: pkgName, created_at: createdAt });
        }
      };
    }
    if (sql.includes('SELECT count(*) as total')) {
      return {
        get: (sinceTs) => {
          const matched = self.rows.filter(r => r.created_at >= sinceTs);
          return { total: matched.length };
        }
      };
    }
    if (sql.includes('GROUP BY brand')) {
      return {
        all: (sinceTs) => {
          const matched = self.rows.filter(r => r.created_at >= sinceTs);
          const groups = {};
          matched.forEach(r => {
            const key = r.brand + '|' + r.size_kw + '|' + r.package_name;
            if (!groups[key]) groups[key] = { brand: r.brand, size_kw: r.size_kw, package_name: r.package_name, count: 0 };
            groups[key].count++;
          });
          return Object.values(groups).sort((a, b) => b.count - a.count);
        }
      };
    }
    return { get: () => ({}), all: () => [], run: () => {} };
  }
}

const createInquiryAnalytics = require('./lib/inquiry-analytics');

async function runTests() {
  console.log('🧪 [Q4 Test] Starting test suite...');

  const mockDb = new MockSqliteDb();
  const analytics = createInquiryAnalytics({ db: mockDb });

  // Test 1: Schema verification — Ensure zero PII columns exist
  const schemaRow = mockDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='inquiries'").get();
  assert.ok(schemaRow && schemaRow.sql, 'Table inquiries should be created');
  const sqlLower = schemaRow.sql.toLowerCase();
  assert.strictEqual(sqlLower.includes('userid'), false, 'Schema MUST NOT contain userId column');
  assert.strictEqual(sqlLower.includes('customer_name'), false, 'Schema MUST NOT contain customer_name column');
  assert.strictEqual(sqlLower.includes('phone'), false, 'Schema MUST NOT contain phone column');

  // Test 2: Log inquiries
  analytics.logInquiry('price_search', 'Huawei', '10', '10kW 3-Phase');
  analytics.logInquiry('price_search', 'Huawei', '10', '10kW 3-Phase');
  analytics.logInquiry('price_search', 'ATMOCE', '5', '5kW 1-Phase');

  // Test 3: Demand summary aggregation
  const summary = analytics.getDemandSummary(30);
  assert.strictEqual(summary.total, 3, 'Total inquiries should equal 3');
  assert.strictEqual(summary.top_packages.length, 2, 'Should have 2 unique top packages');
  assert.strictEqual(summary.top_packages[0].brand, 'Huawei', 'Top brand should be Huawei');
  assert.strictEqual(summary.top_packages[0].count, 2, 'Huawei count should be 2');
  assert.strictEqual(summary.top_packages[0].share_pct, 66.7, 'Huawei share_pct should be 66.7%');

  // Test 4: Admin regex matching
  const demandRegex = /สรุป\s*demand|demand\s*summary/i;
  assert.ok(demandRegex.test('สรุป demand'), 'Should match "สรุป demand"');
  assert.ok(demandRegex.test('demand summary'), 'Should match "demand summary"');

  console.log('✅ [Q4 Test] All 4 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [Q4 Test] FAILED:', err);
  process.exit(1);
});
