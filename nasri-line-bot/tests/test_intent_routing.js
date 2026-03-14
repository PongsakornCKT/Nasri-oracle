/**
 * Test suite: Intent routing + keyword detection for Nasri LINE bot
 * Run: node nasri-line-bot/tests/test_intent_routing.js
 */
'use strict';

var passed = 0, failed = 0;

function test(name, condition) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    console.log('  FAIL  ' + name);
  }
}

// ── Replicate the regex functions from app.js ──

function isQuotationRequest(lo) {
  return /ใบเสนอราคา|quotation|เสนอราคา|ขอใบเสนอ|ทำใบเสนอราคา/.test(lo);
}

function isBomRequest(lo) {
  return /\bbom\b/i.test(lo) || lo.indexOf('ขอbom') >= 0 || lo.indexOf('ขอ bom') >= 0 || lo.indexOf('solar') >= 0;
}

function hasSystemSpec(lo) {
  return /\d+\s*kw/.test(lo) && /(atmoce|sigenergy|huawei|deye|solis|hoymiles|sig)/.test(lo);
}

function broadQuotationMatch(lo) {
  // The new broader catch: "เสนอ" + solar spec
  return /เสนอ/.test(lo) && hasSystemSpec(lo);
}

console.log('=== Nasri LINE Bot Intent Routing Tests ===\n');

// Test 1: Original quotation keywords still work
test('1. "ใบเสนอราคา" triggers quotation',
  isQuotationRequest('นัด ใบเสนอราคา deye 42kw'));

// Test 2: New keyword "ทำใบเสนอราคา" works
test('2. "ทำใบเสนอราคา" triggers quotation',
  isQuotationRequest('นัด ทำใบเสนอราคา deye 42kw'));

// Test 3: "เสนอราคา" still works
test('3. "เสนอราคา" triggers quotation',
  isQuotationRequest('เสนอราคา sigenergy 10kw'));

// Test 4: Broad match - "เสนอ" + spec triggers quotation
test('4. "เสนอ" + system spec triggers broad match',
  broadQuotationMatch('นัด เสนอ deye 42kw'));

// Test 5: "เสนอ" alone WITHOUT spec does NOT trigger
test('5. "เสนอ" without spec does NOT trigger',
  !broadQuotationMatch('นัด เสนอ ความคิด'));

// Test 6: BOM request still works
test('6. "bom" triggers BOM flow',
  isBomRequest('นัด ขอ bom'));

// Test 7: "ราคา" alone does NOT trigger quotation (it's a price query)
test('7. "ราคา" alone does NOT trigger quotation',
  !isQuotationRequest('ราคา deye 5kw'));

// Test 8: System spec detection works
test('8. hasSystemSpec detects "deye 42kw"',
  hasSystemSpec('deye 42kw 3phase'));

// Test 9: System spec requires brand + kw
test('9. hasSystemSpec requires brand + kw',
  !hasSystemSpec('42kw 3phase'));

// Test 10: Edge case - mixed Thai+English triggers correctly
test('10. Thai+English mixed works',
  isQuotationRequest('ทำใบเสนอราคา huawei 7kw batt 14kw'));

// Updated: require BOTH brand AND kW to auto-generate
function needsDetailAsk(text) {
  var specStr = text.replace(/ใบเสนอราคา|quotation|เสนอราคา|ขอใบเสนอ|ทำใบเสนอราคา|นัด|nasri|ไอ่นัด|เสนอ|ทำ|ขอ/gi, '').trim();
  var slo = specStr.toLowerCase();
  var hasBrand = /atmoce|huawei|sol[io]s|deye|sig(?:energy)?|hoymiles|enphase/i.test(slo);
  var hasKw = /\d+\s*kw/i.test(slo) || /\d+\s*แผ[งง่]/i.test(slo);
  return !specStr || !hasBrand || !hasKw;
}

// Test 11: No spec at all -> ask
test('11. "นัด ใบเสนอราคา" alone -> asks',
  needsDetailAsk('นัด ใบเสนอราคา'));

// Test 12: Brand + kW -> generate directly
test('12. "ไอ่นัด ทำใบเสนอราคา deye 42kw แบท 14kw" -> generates',
  !needsDetailAsk('ไอ่นัด ทำใบเสนอราคา deye 42kw แบท 14kw'));

// Test 13: Brand alone (no kW) -> still ask
test('13. "นัด ทำใบเสนอราคา atmoce" brand only -> asks',
  needsDetailAsk('นัด ทำใบเสนอราคา atmoce'));

// Test 14: kW alone (no brand) -> still ask
test('14. "นัด ทำใบเสนอราคา 5kw" kW only -> asks',
  needsDetailAsk('นัด ทำใบเสนอราคา 5kw'));

// Test 15: Panel count + brand -> generates (panel count = kW proxy)
test('15. "นัด ทำใบเสนอราคา atmoce 12แผง" panel count -> generates',
  !needsDetailAsk('นัด ทำใบเสนอราคา atmoce 12แผง'));

console.log('\n=== Results: ' + passed + '/' + (passed + failed) + ' passed ===');
if (failed) process.exit(1);
