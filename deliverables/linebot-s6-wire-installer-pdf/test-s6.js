/**
 * test-s6.js — Verification Test Suite for S6v2 Wire Installer PDF (#20 - REVISION 2)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { generateInstallerPdfBridge, resolveInstallerData } = require('./lib/installer-pdf-bridge');

async function runTests() {
  console.log('🧪 [S6v2 Test] Starting test suite...');

  // Test 1: Real Data Resolver from QT Detail
  const mockQtCrud = {
    getQuotationDetail: async (qtId) => ({
      header: { quote_number: 'QT-999', customer_name: 'คุณสมชาย', brand: 'Huawei', size_kw: 10.0 },
      items: [{ part_number: 'SUN2000-10KTL-M1', unit_cost: 38000, total_cost: 38000 }]
    })
  };

  const resolvedData = await resolveInstallerData('QT-999', '/tmp/test.db', mockQtCrud, null);
  assert.ok(resolvedData, 'resolveInstallerData should return resolved data object');
  assert.strictEqual(resolvedData.spec.customer_name, 'คุณสมชาย', 'Customer name should be loaded from QT header');
  assert.strictEqual(resolvedData.items.length, 1, 'Resolved items count should be 1');

  // Test 2: Real Data Resolver fallback to BOM search
  const mockPersistence = {
    searchBoms: () => [{ filename: 'bom_test_001.json', customer_name: 'คุณวิชัย' }],
    loadBomData: () => ({ customer_name: 'คุณวิชัย', items: [{ part_number: 'RAIL-4200' }] })
  };

  const resolvedBomData = await resolveInstallerData('bom_test_001', '/tmp/test.db', null, mockPersistence);
  assert.ok(resolvedBomData, 'resolveInstallerData should fallback to BOM search');
  assert.strictEqual(resolvedBomData.spec.customer_name, 'คุณวิชัย', 'Customer name should be loaded from BOM');

  // Test 3: PDF Generation bridge execution with real payload
  const tmpDir = path.join(__dirname, 'tmp_test');
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const res = generateInstallerPdfBridge('QT-999', resolvedData.spec, resolvedData.items, tmpDir);
    assert.strictEqual(res.ok, true, 'Bridge execution should return ok: true');
    assert.strictEqual(fs.existsSync(res.pdf_path), true, 'PDF file must be created on disk');
    assert.ok(res.pdf_url.includes('installer-QT-999.pdf'), 'PDF URL should contain filename');
    console.log('✅ [S6v2 Test] All 3 assertion checks PASSED cleanly!');
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

runTests().catch(err => {
  console.error('❌ [S6v2 Test] FAILED:', err);
  process.exit(1);
});
