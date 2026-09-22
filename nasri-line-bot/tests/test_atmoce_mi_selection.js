'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Standalone test: ATMOCE MI model selection + battery qty parsing
// Extracted from nasri-line-bot/deploy/app.js (lines 635-659, 613-616)
// Run: node nasri-line-bot/tests/test_atmoce_mi_selection.js
// ─────────────────────────────────────────────────────────────────────────────

// ── Logic extracted verbatim from app.js ─────────────────────────────────────

function selectMiModel(text) {
  var lo = text.toLowerCase();
  var forceMI500  = /mi[\-\s]*500/i.test(lo)  || /ใช้\s*mi[\-\s]*500/i.test(lo);
  var forceMI1250 = /mi[\-\s]*1250/i.test(lo) || /ใช้\s*mi[\-\s]*1250/i.test(lo);

  if (forceMI1250 && !forceMI500) {
    return 'MI-1250';
  } else {
    return 'MI-500';
  }
}

function parseBattQty(text) {
  var battQtyMatch =
    text.match(/batt(?:ery)?\s*\d+\s*\*\s*(\d+)/i) ||
    text.match(/x\s*(\d+)\s*ลูก/)                   ||
    text.match(/(\d+)\s*ลูก/)                        ||
    text.match(/batt(?:ery)?\s*\d+\s+(\d+)\s*ลูก/i);
  return battQtyMatch ? parseInt(battQtyMatch[1]) : 1;
}

// ── Test runner ───────────────────────────────────────────────────────────────

var passed = 0;
var failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log('  PASS  ' + label);
    passed++;
  } else {
    console.log('  FAIL  ' + label);
    console.log('         expected: ' + expected);
    console.log('         actual  : ' + actual);
    failed++;
  }
}

console.log('\nATMOCE MI selection + battery qty — 10 test cases\n');

// ── MI model selection ────────────────────────────────────────────────────────

// TC-01: THE BUG CASE — explicit MI-500 on large (42 kW) system
assert(
  'TC-01  "atmoce 42kw ใช้ mi-500" → MI-500 (explicit request wins)',
  selectMiModel('atmoce 42kw ใช้ mi-500'),
  'MI-500'
);

// TC-02: Large system, no explicit model — default must be MI-500
assert(
  'TC-02  "atmoce 42kw" → MI-500 (default even ≥30 kW)',
  selectMiModel('atmoce 42kw'),
  'MI-500'
);

// TC-03: Small residential system — default MI-500
assert(
  'TC-03  "atmoce 5kw" → MI-500 (small system, default)',
  selectMiModel('atmoce 5kw'),
  'MI-500'
);

// TC-04: Explicit MI-1250 request
assert(
  'TC-04  "atmoce 50kw mi-1250" → MI-1250 (explicit request)',
  selectMiModel('atmoce 50kw mi-1250'),
  'MI-1250'
);

// TC-05: C&I label alone must NOT force MI-1250
assert(
  'TC-05  "atmoce 10kw c&i" → MI-500 (C&I no longer forces MI-1250)',
  selectMiModel('atmoce 10kw c&i'),
  'MI-500'
);

// TC-06: Factory/C&I keyword must NOT force MI-1250
assert(
  'TC-06  "atmoce 100kw โรงงาน" → MI-500 (factory keyword no longer forces MI-1250)',
  selectMiModel('atmoce 100kw โรงงาน'),
  'MI-500'
);

// TC-07: Both MI-500 and MI-1250 in same message — MI-500 takes priority
//        because forceMI500=true blocks the MI-1250 branch
assert(
  'TC-07  "atmoce 42kw mi-500 mi-1250" → MI-500 (MI-500 flag blocks MI-1250)',
  selectMiModel('atmoce 42kw mi-500 mi-1250'),
  'MI-500'
);

// ── Battery quantity parsing ──────────────────────────────────────────────────

// TC-08: "x 6ลูก" — space after x
assert(
  'TC-08  "แบต 7kwh x 6ลูก" → battQty=6 (x + space + digit)',
  parseBattQty('แบต 7kwh x 6ลูก'),
  6
);

// TC-09: "x6ลูก" — no space after x
assert(
  'TC-09  "แบต 7kwh x6ลูก" → battQty=6 (x + digit, no space)',
  parseBattQty('แบต 7kwh x6ลูก'),
  6
);

// TC-10: bare digit before ลูก — existing pattern still works
assert(
  'TC-10  "แบต 10kw 3ลูก" → battQty=3 (digit+ลูก pattern)',
  parseBattQty('แบต 10kw 3ลูก'),
  3
);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed out of ' + (passed + failed) + ' tests');
if (failed === 0) {
  console.log('All tests passed.');
} else {
  console.log('Some tests FAILED. Review logic above.');
  process.exit(1);
}
