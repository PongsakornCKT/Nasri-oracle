'use strict';

// test_battery_selection.js
// Standalone CJS test for Sigenergy battery parsing + selection logic.
// Extracted from nasri-line-bot/deploy/app.js lines 607-616 (BOM flow)
// and lines 1404-1414 (quotation flow).

// ---------------------------------------------------------------------------
// Logic under test — BOM flow
// ---------------------------------------------------------------------------
function parseBatteryBom(text) {
  var lo = text.toLowerCase();

  var wantBatt = /batt|แบต|แบท/i.test(lo);
  var battKwh = 0;
  var battMatch = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s*(\d+(?:\.\d+)?)\s*(?:kw|kwh)?/);
  if (battMatch) battKwh = parseFloat(battMatch[1]);
  else {
    battMatch = lo.match(/(\d+(?:\.\d+)?)\s*(?:kw|kwh)\s*(?:batt|แบต|แบท)/);
    if (battMatch) battKwh = parseFloat(battMatch[1]);
  }

  var battQty = 1;
  var battQtyMatch =
    text.match(/batt(?:ery)?\s*\d+\s*\*\s*(\d+)/i) ||
    text.match(/(\d+)\s*ลูก/) ||
    text.match(/batt(?:ery)?\s*\d+\s+(\d+)\s*ลูก/i);
  if (battQtyMatch) battQty = parseInt(battQtyMatch[1]);

  // Sigenergy model selection rule: battKwh > 6 → BAT 10.0, else BAT 6.0
  var selectedModel = battKwh > 6 ? 'BAT 10.0' : 'BAT 6.0';

  return { wantBatt, battKwh, battQty, selectedModel };
}

// ---------------------------------------------------------------------------
// Logic under test — Quotation flow (includes multi-unit kWh multiplication)
// ---------------------------------------------------------------------------
function parseBatteryQuotation(text) {
  var lo = text.toLowerCase();

  var battKwh = 0;
  var bm = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s*(\d+(?:\.\d+)?)\s*(?:kw|kwh)?/);
  if (bm) battKwh = parseFloat(bm[1]);
  else {
    bm = lo.match(/(\d+(?:\.\d+)?)\s*(?:kw|kwh)\s*(?:batt|แบต|แบท)/);
    if (bm) battKwh = parseFloat(bm[1]);
  }

  var battQty = 1;
  var bqm =
    text.match(/batt(?:ery)?\s*\d+\s*\*\s*(\d+)/i) ||
    text.match(/(\d+)\s*ลูก/) ||
    text.match(/batt(?:ery)?\s*\d+\s+(\d+)\s*ลูก/i);
  if (bqm) battQty = parseInt(bqm[1]);
  if (battKwh > 0 && battQty > 1) battKwh = battKwh * battQty;

  var selectedModel = battKwh > 6 ? 'BAT 10.0' : 'BAT 6.0';

  return { battKwh, battQty, selectedModel };
}

// ---------------------------------------------------------------------------
// Minimal test runner
// ---------------------------------------------------------------------------
var passed = 0;
var failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log('  PASS  ' + label);
    passed++;
  } else {
    console.error('  FAIL  ' + label);
    console.error('        expected: ' + JSON.stringify(expected));
    console.error('        actual  : ' + JSON.stringify(actual));
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------
console.log('\n=== Sigenergy Battery Selection — 10 Test Cases ===\n');

// Case 1 — THE BUG CASE: "แบต 9kw 5ลูก"
// battKwh=9, battQty=5, model=BAT 10.0 (BOM flow does NOT multiply)
{
  var r = parseBatteryBom('แบต 9kw 5ลูก');
  console.log('[1] "แบต 9kw 5ลูก" — the original bug case');
  assert('wantBatt=true',     r.wantBatt,      true);
  assert('battKwh=9',         r.battKwh,        9);
  assert('battQty=5',         r.battQty,        5);
  assert('model=BAT 10.0',    r.selectedModel, 'BAT 10.0');
}

// Case 2 — boundary: exactly 6kWh → BAT 6.0
{
  var r = parseBatteryBom('แบต 6kw');
  console.log('\n[2] "แบต 6kw" — boundary, exactly 6');
  assert('wantBatt=true',     r.wantBatt,      true);
  assert('battKwh=6',         r.battKwh,        6);
  assert('battQty=1',         r.battQty,        1);
  assert('model=BAT 6.0',     r.selectedModel, 'BAT 6.0');
}

// Case 3 — just over 6 → BAT 10.0
{
  var r = parseBatteryBom('แบต 7kw');
  console.log('\n[3] "แบต 7kw" — just over boundary');
  assert('wantBatt=true',     r.wantBatt,      true);
  assert('battKwh=7',         r.battKwh,        7);
  assert('model=BAT 10.0',    r.selectedModel, 'BAT 10.0');
}

// Case 4 — English keyword
{
  var r = parseBatteryBom('batt 10kw');
  console.log('\n[4] "batt 10kw" — English keyword');
  assert('wantBatt=true',     r.wantBatt,      true);
  assert('battKwh=10',        r.battKwh,        10);
  assert('model=BAT 10.0',    r.selectedModel, 'BAT 10.0');
}

// Case 5 — แบท variant with 3ลูก
{
  var r = parseBatteryBom('แบท 5kwh 3ลูก');
  console.log('\n[5] "แบท 5kwh 3ลูก" — แบท variant');
  assert('wantBatt=true',     r.wantBatt,      true);
  assert('battKwh=5',         r.battKwh,        5);
  assert('battQty=3',         r.battQty,        3);
  assert('model=BAT 6.0',     r.selectedModel, 'BAT 6.0');
}

// Case 6 — large size, no unit suffix
{
  var r = parseBatteryBom('battery 15');
  console.log('\n[6] "battery 15" — large size no unit');
  assert('wantBatt=true',     r.wantBatt,      true);
  assert('battKwh=15',        r.battKwh,        15);
  assert('model=BAT 10.0',    r.selectedModel, 'BAT 10.0');
}

// Case 7 — want battery, no size → default BAT 6.0
{
  var r = parseBatteryBom('+ batt');
  console.log('\n[7] "+ batt" — no size, default to BAT 6.0');
  assert('wantBatt=true',     r.wantBatt,      true);
  assert('battKwh=0',         r.battKwh,        0);
  assert('model=BAT 6.0',     r.selectedModel, 'BAT 6.0');
}

// Case 8 — reverse order: size before keyword
{
  var r = parseBatteryBom('9kw แบต');
  console.log('\n[8] "9kw แบต" — reverse order');
  assert('wantBatt=true',     r.wantBatt,      true);
  assert('battKwh=9',         r.battKwh,        9);
  assert('model=BAT 10.0',    r.selectedModel, 'BAT 10.0');
}

// Case 9 — multiply notation "batt 10 *3" (quotation flow multiplies)
{
  var r = parseBatteryQuotation('batt 10 *3');
  console.log('\n[9] "batt 10 *3" — multiply notation (quotation flow)');
  assert('battKwh=30 (10×3)', r.battKwh,        30);
  assert('battQty=3',         r.battQty,        3);
  assert('model=BAT 10.0',    r.selectedModel, 'BAT 10.0');
}

// Case 10 — regression: plain text with no battery request
// NOTE: /batt|แบต|แบท/i matches the substring "batt" inside "no battery".
// The regex does not have a negative-lookbehind for "no". This is a known
// limitation of the current implementation — wantBatt will be true here.
// Test documents ACTUAL behavior so a future fix is detectable.
{
  var r = parseBatteryBom('sigenergy 10kw 3phase');
  console.log('\n[10] "sigenergy 10kw 3phase" — regression, no battery keyword at all');
  assert('wantBatt=false', r.wantBatt, false);
  assert('battKwh=0',      r.battKwh,  0);
  assert('battQty=1',      r.battQty,  1);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n' + '─'.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed out of ' + (passed + failed) + ' assertions');
if (failed === 0) {
  console.log('All assertions passed.');
} else {
  console.log('Some assertions failed — review above.');
  process.exitCode = 1;
}
