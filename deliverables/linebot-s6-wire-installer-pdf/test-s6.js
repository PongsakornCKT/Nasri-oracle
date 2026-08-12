/**
 * test-s6.js — Verification Test Suite for S6 Wire Installer PDF (#20)
 * Runs standalone using Node.js / Bun. Exits 0 on clean pass, 1 on failure.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { generateInstallerPdfBridge, handleInstallerPdfCommand } = require('./lib/installer-pdf-bridge');

async function runTests() {
  console.log('🧪 [S6 Test] Starting test suite...');

  // Test 1: Command handler ACK-first workflow
  let ackMessage = '';
  const isHandled = handleInstallerPdfCommand('ใบช่าง QT-2026-0812-001', (msg) => {
    ackMessage = msg;
  });
  assert.strictEqual(isHandled, true, 'Command "ใบช่าง <id>" should be handled');
  assert.ok(ackMessage.includes('กำลังสร้างเอกสารใบช่าง'), 'ACK message should be sent immediately');

  // Test 2: Non-matching command is ignored
  const nonMatch = handleInstallerPdfCommand('ขอราคาแผง', () => {});
  assert.strictEqual(nonMatch, false, 'Non-installer command should return false');

  // Test 3: PDF Generation bridge execution
  const tmpDir = path.join(__dirname, 'tmp_test');
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const res = generateInstallerPdfBridge('QT-2026-0812-001', { brand: 'Huawei' }, [], tmpDir);
    assert.strictEqual(res.ok, true, 'Bridge execution should return ok: true');
    assert.strictEqual(fs.existsSync(res.pdf_path), true, 'PDF file must be created on disk');
    assert.ok(res.pdf_url.includes('installer-QT-2026-0812-001.pdf'), 'PDF URL should contain filename');
    console.log('✅ [S6 Test] All 3 assertion checks PASSED cleanly!');
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

runTests().catch(err => {
  console.error('❌ [S6 Test] FAILED:', err);
  process.exit(1);
});
