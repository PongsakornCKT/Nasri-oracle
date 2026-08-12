/**
 * test-t2.js — Verification Test Suite for T2 Dynamic Labor & Default Roof (#7)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const { parseRoofType } = require('./lib/roof-labor-parser');

async function runTests() {
  console.log('🧪 [T2 Test] Starting test suite...');

  // Test 1: Unspecified text defaults to metal sheet (P'Phong business decision)
  const defaultRes = parseRoofType('ขอ bom huawei 10kw 3phase');
  assert.strictEqual(defaultRes.roofType, 'metal', 'Unspecified roof text MUST default to metal');
  assert.strictEqual(defaultRes.isExplicit, false, 'Unspecified text should have isExplicit: false');
  assert.ok(defaultRes.labelTh.includes('ค่าเริ่มต้น'), 'Display label should indicate default status');

  // Test 2: Explicit "ซีแพค" / "กระเบื้อง" parsing
  const tileRes = parseRoofType('ขอ bom huawei 10kw หลังคาซีแพค');
  assert.strictEqual(tileRes.roofType, 'tile', 'Explicit ซีแพค should return tile');
  assert.strictEqual(tileRes.isExplicit, true, 'Explicit text should have isExplicit: true');
  assert.strictEqual(tileRes.labelTh, 'หลังคาซีแพค', 'Display label should say หลังคาซีแพค');

  // Test 3: Explicit "ลอนคู่" / "Hangerbolt" parsing
  const hbRes = parseRoofType('ขอ bom 5kw หลังคาลอนคู่');
  assert.strictEqual(hbRes.roofType, 'hangerbolt', 'Explicit ลอนคู่ should return hangerbolt');

  // Test 4: Explicit "Kliplock" parsing
  const klRes = parseRoofType('ขอ bom 20kw หลังคา kliplock');
  assert.strictEqual(klRes.roofType, 'kliplock', 'Explicit kliplock should return kliplock');

  console.log('✅ [T2 Test] All 4 assertion checks PASSED cleanly!');
}

runTests().catch(err => {
  console.error('❌ [T2 Test] FAILED:', err);
  process.exit(1);
});
