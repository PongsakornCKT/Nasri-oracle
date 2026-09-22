'use strict';

// ── Extracted logic from app.js (lines 605-614, 666-671, 843) ──

/**
 * Parse panel-related fields from a raw input string.
 * Returns { panelWatts, explicitPanelQty, miModel, miQty, panelQty, systemKw }
 */
function parsePanelFields(text) {
  var lo = text.toLowerCase();

  // System kW
  var systemKw = 0;
  var kwMatch = lo.match(/(\d+(?:\.\d+)?)\s*kw/);
  if (kwMatch) systemKw = parseFloat(kwMatch[1]);

  // Panel watts from brand keywords (mirrors app.js lines 599-605)
  var panelWatts = 0;
  if (/aiko\s*(\d{3})?/i.test(lo)) {
    panelWatts = RegExp.$1 ? parseInt(RegExp.$1) : 650;
  } else if (/ja\s*(?:solar)?\s*(\d{3})/i.test(lo)) {
    panelWatts = parseInt(RegExp.$1);
  } else if (/แผง\s*(\d{3})/i.test(lo)) {
    panelWatts = parseInt(RegExp.$1);
  }

  // Default panel watts for ATMOCE if none detected
  if (!panelWatts && systemKw) panelWatts = 625;

  // Explicit panel count (app.js lines 607-614)
  var explicitPanelQty = 0;
  var pqMatch = lo.match(/(\d+)\s*แผง/) || lo.match(/(\d+)\s*panels?/i);
  if (pqMatch) {
    var pqVal = parseInt(pqMatch[1]);
    if (pqVal > 0 && pqVal < 400) explicitPanelQty = pqVal;
  }

  // MI model selection (app.js lines 646-671)
  var forceMI1250 = /mi[\-\s]*1250/i.test(lo);
  var forceMI500  = /mi[\-\s]*500/i.test(lo);
  var miModel = (forceMI1250 && !forceMI500) ? 'MI-1250' : 'MI-500';
  var miKw    = miModel === 'MI-1250' ? 1.25 : 0.5;

  var miQty;
  if (miModel === 'MI-500') {
    miQty = explicitPanelQty > 0 ? explicitPanelQty : Math.ceil(systemKw / miKw);
  } else {
    miQty = Math.ceil(systemKw / miKw);
  }

  // Panel qty for BOM (app.js line 843)
  var panelQty = explicitPanelQty > 0
    ? explicitPanelQty
    : (panelWatts > 0 ? Math.ceil((systemKw * 1000) / panelWatts) : 8);

  return { systemKw, panelWatts, explicitPanelQty, miModel, miKw, miQty, panelQty };
}

// ── Minimal test runner ──

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

function run(caseNum, input, checks) {
  console.log('\nCase ' + caseNum + ': "' + input + '"');
  var r = parsePanelFields(input);
  checks.forEach(function(c) { assert(c.label, r[c.field], c.expected); });
}

// ── Test cases ──

run(1,
  'atmoce 42kw แผง Aiko650w 42แผง',
  [
    { label: 'explicitPanelQty = 42 (THE BUG CASE)', field: 'explicitPanelQty', expected: 42 },
    { label: 'MI-500 qty = 42 (1 per panel)',         field: 'miQty',           expected: 42 },
    { label: 'panelQty = 42',                         field: 'panelQty',        expected: 42 },
    { label: 'miModel = MI-500',                      field: 'miModel',         expected: 'MI-500' },
  ]
);

run(2,
  'atmoce 10kw',
  [
    { label: 'explicitPanelQty = 0 (no count given)',  field: 'explicitPanelQty', expected: 0 },
    { label: 'MI-500 qty = 20 (10kW / 0.5kW)',         field: 'miQty',            expected: 20 },
    { label: 'panelQty = 16 (10000W / 625W)',          field: 'panelQty',         expected: 16 },
    { label: 'miModel = MI-500',                       field: 'miModel',          expected: 'MI-500' },
  ]
);

run(3,
  'atmoce 5kw 12แผง',
  [
    { label: 'explicitPanelQty = 12', field: 'explicitPanelQty', expected: 12 },
    { label: 'MI-500 qty = 12',       field: 'miQty',            expected: 12 },
    { label: 'panelQty = 12',         field: 'panelQty',         expected: 12 },
  ]
);

run(4,
  'atmoce 5kw 12 panels',
  [
    { label: 'explicitPanelQty = 12 (English "panels")', field: 'explicitPanelQty', expected: 12 },
    { label: 'MI-500 qty = 12',                          field: 'miQty',            expected: 12 },
    { label: 'panelQty = 12',                            field: 'panelQty',         expected: 12 },
  ]
);

run(5,
  'atmoce 42kw แผง aiko650',
  [
    // "650" is watts (≥400) — filtered out; no explicit count token like "42แผง"
    { label: 'explicitPanelQty = 0 (650 is watts, not count)', field: 'explicitPanelQty', expected: 0 },
    { label: 'panelWatts = 650 (AIKO default)',                 field: 'panelWatts',       expected: 650 },
    { label: 'panelQty = 65 (42000W / 650W)',                   field: 'panelQty',         expected: 65 },
    { label: 'MI-500 qty = 84 (42kW / 0.5kW, kW-based)',        field: 'miQty',            expected: 84 },
  ]
);

run(6,
  'atmoce 30kw 50แผง mi-1250',
  [
    { label: 'explicitPanelQty = 50',                        field: 'explicitPanelQty', expected: 50 },
    { label: 'miModel = MI-1250',                            field: 'miModel',          expected: 'MI-1250' },
    { label: 'MI-1250 qty = 24 (30kW / 1.25kW, NOT panels)', field: 'miQty',            expected: 24 },
    { label: 'panelQty = 50 (explicit overrides kW calc)',   field: 'panelQty',         expected: 50 },
  ]
);

run(7,
  'atmoce 5kw 8แผง',
  [
    { label: 'explicitPanelQty = 8', field: 'explicitPanelQty', expected: 8 },
    { label: 'MI-500 qty = 8',       field: 'miQty',            expected: 8 },
    { label: 'panelQty = 8',         field: 'panelQty',         expected: 8 },
  ]
);

run(8,
  'atmoce 100kw 150แผง',
  [
    { label: 'explicitPanelQty = 150 (< 400 threshold)', field: 'explicitPanelQty', expected: 150 },
    { label: 'MI-500 qty = 150',                         field: 'miQty',            expected: 150 },
    { label: 'panelQty = 150',                           field: 'panelQty',         expected: 150 },
  ]
);

run(9,
  'atmoce 5kw',
  [
    { label: 'explicitPanelQty = 0',              field: 'explicitPanelQty', expected: 0 },
    { label: 'MI-500 qty = 10 (5kW / 0.5kW)',     field: 'miQty',           expected: 10 },
    { label: 'panelQty = 8 (5000W / 625W)',        field: 'panelQty',        expected: 8 },
  ]
);

run(10,
  'atmoce 42kw แผง 650',
  [
    // "แผง 650" — pqMatch captures 650 via /(\d+)\s*แผง/ pattern? No: "แผง 650" means
    // digits come BEFORE แผง for that pattern. Here digits come AFTER แผง → panelWatts branch.
    // pqMatch = "650" via /(\d+)\s*แผง/? "แผง 650" has digits AFTER แผง, no match for /(\d+)\s*แผง/
    // English panels pattern also won't match. So explicitPanelQty = 0.
    { label: 'explicitPanelQty = 0 (650 follows แผง, digits-before pattern needs digits first)', field: 'explicitPanelQty', expected: 0 },
    { label: 'panelWatts = 650 (แผง\\s*\\d{3} branch)',                                          field: 'panelWatts',       expected: 650 },
    { label: 'panelQty = 65 (42000W / 650W)',                                                    field: 'panelQty',         expected: 65 },
  ]
);

// ── Summary ──

console.log('\n' + '─'.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed out of ' + (passed + failed) + ' assertions');
if (failed === 0) {
  console.log('All assertions passed.');
} else {
  console.log(failed + ' assertion(s) failed — review logic above.');
  process.exitCode = 1;
}
