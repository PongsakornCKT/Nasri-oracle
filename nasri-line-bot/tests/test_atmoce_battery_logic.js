'use strict';

// test_atmoce_battery_logic.js
// Tests for ATMOCE battery quantity parsing and tiered pricing
// MS-7K = 7kWh each. "batt N" where N >= 7 = kWh, N < 7 = quantity
// Pricing: 1P first=110k +99k each; 3P first=130k +99k each

// ---------------------------------------------------------------------------
// Extract parsing logic from app.js (BOM parser)
// ---------------------------------------------------------------------------
function parseBomBattery(text, invBrand) {
  var lo = text.toLowerCase();
  var battKwh = 0;
  var battQty = 1;

  var battKwhMatch = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s*(\d+(?:\.\d+)?)\s*(?:kw|kwh)/);
  if (battKwhMatch) battKwh = parseFloat(battKwhMatch[1]);
  else { battKwhMatch = lo.match(/(\d+(?:\.\d+)?)\s*(?:kw|kwh)\s*(?:batt|แบต|แบท)/); if (battKwhMatch) battKwh = parseFloat(battKwhMatch[1]); }

  var battQtyMatch = text.match(/batt(?:ery)?\s*\d+\s*(?:kw|kwh)?\s*[*x×]\s*(\d+)/i)
    || text.match(/[*x×]\s*(\d+)\s*ลูก/)
    || text.match(/(\d+)\s*ลูก/)
    || text.match(/batt(?:ery)?\s*\d+\s*(?:kw|kwh)?\s+(\d+)\s*ลูก/i);
  if (battQtyMatch) battQty = parseInt(battQtyMatch[1]);

  if (battQty <= 1 && !battKwhMatch) {
    var battNumMatch = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s+(\d+)(?:\s|$|\+)/);
    if (battNumMatch) {
      var bn = parseInt(battNumMatch[1]);
      if (invBrand === 'ATMOCE' && bn >= 7 && bn <= 50) {
          battKwh = bn;
        } else if (bn >= 1 && bn <= 20) {
          battQty = bn;
        }
    }
  }

  return { battKwh, battQty };
}

// ---------------------------------------------------------------------------
// Extract BOM battery qty + pricing logic
// ---------------------------------------------------------------------------
function calcAtmoceBattery(battKwh, battQty, phase) {
  var abQty;
  if (battKwh > 0) {
    abQty = Math.max(1, Math.ceil(battKwh / 7));
  } else if (battQty >= 7) {
    abQty = Math.max(1, Math.ceil(battQty / 7));
  } else if (battQty > 1) {
    abQty = battQty;
  } else {
    abQty = 1;
  }
  if (phase === '1P' && abQty > 3) abQty = 3;

  var firstBattPrice = phase === '1P' ? 110000 : 130000;
  var additionalBattPrice = 99000;
  var battTotalCost = firstBattPrice + Math.max(0, abQty - 1) * additionalBattPrice;

  return { qty: abQty, totalCost: battTotalCost };
}

// ---------------------------------------------------------------------------
// Extract parseQuotationSpec battery logic
// ---------------------------------------------------------------------------
function parseQuotBattery(text, brand) {
  var lo = text.toLowerCase();
  var battKwh = 0;
  var battQty = 1;

  var bm = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s*(\d+(?:\.\d+)?)\s*(?:kw|kwh)/);
  if (bm) battKwh = parseFloat(bm[1]);
  else { bm = lo.match(/(\d+(?:\.\d+)?)\s*(?:kw|kwh)\s*(?:batt|แบต|แบท)/); if (bm) battKwh = parseFloat(bm[1]); }

  var bqm = text.match(/batt(?:ery)?\s*\d+\s*[*x×]\s*(\d+)/i)
    || text.match(/[*x×]\s*(\d+)\s*ลูก/)
    || text.match(/(\d+)\s*ลูก/)
    || text.match(/batt(?:ery)?\s*\d+\s+(\d+)\s*ลูก/i);
  if (bqm) battQty = parseInt(bqm[1]);

  if (battQty <= 1 && !bm) {
    var bnm = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s+(\d+)(?:\s|$|\+)/);
    if (bnm) {
      var bnv = parseInt(bnm[1]);
      if (brand === 'ATMOCE' && bnv >= 7 && bnv <= 50) {
          battKwh = bnv;
        } else if (bnv >= 1 && bnv <= 20) {
          battQty = bnv;
        }
    }
  }

  if (battKwh > 0 && battQty > 1) battKwh = battKwh * battQty;

  return { battery_kwh: battKwh, battQty };
}

// ---------------------------------------------------------------------------
// Extract AI result processing logic
// ---------------------------------------------------------------------------
function processAiResult(aiResult) {
  var aiBattKwh = aiResult.battery_kwh || 0;
  if (aiResult.brand === 'ATMOCE' && aiBattKwh <= 0 && aiResult.battery_qty > 0) {
    if (aiResult.battery_qty >= 7) {
      aiBattKwh = aiResult.battery_qty;
    } else {
      aiBattKwh = aiResult.battery_qty * 7;
    }
  }
  return aiBattKwh;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
var pass = 0, fail = 0;
function assert(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log('  ✓ ' + label);
    pass++;
  } else {
    console.log('  ✗ ' + label + ' → got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected));
    fail++;
  }
}

// ═══ Test 1: "batt 14" ATMOCE = 14kWh = 2 units ═══
console.log('\nTest 1: "batt 14" ATMOCE 1P (the bug case)');
(function() {
  var p = parseBomBattery('atmoce 10kw 1phase + batt 14 + backup', 'ATMOCE');
  assert('BOM parser: battKwh=14', p.battKwh, 14);
  assert('BOM parser: battQty=1', p.battQty, 1);
  var c = calcAtmoceBattery(p.battKwh, p.battQty, '1P');
  assert('BOM calc: qty=2', c.qty, 2);
  assert('BOM calc: totalCost=209000', c.totalCost, 209000);
})();

// ═══ Test 2: "batt 14" quotation spec ═══
console.log('\nTest 2: "batt 14" quotation spec ATMOCE');
(function() {
  var q = parseQuotBattery('atmoce 10kw 1phase + batt 14 + backup', 'ATMOCE');
  assert('Quot parser: battery_kwh=14', q.battery_kwh, 14);
})();

// ═══ Test 3: "batt 21" ATMOCE 1P = 21kWh = 3 units (max for 1P) ═══
console.log('\nTest 3: "batt 21" ATMOCE 1P = 3 units');
(function() {
  var p = parseBomBattery('atmoce 10kw 1phase + batt 21 + backup', 'ATMOCE');
  assert('BOM parser: battKwh=21', p.battKwh, 21);
  var c = calcAtmoceBattery(p.battKwh, p.battQty, '1P');
  assert('BOM calc: qty=3', c.qty, 3);
  assert('BOM calc: totalCost=308000', c.totalCost, 308000);
})();

// ═══ Test 4: "batt 7" ATMOCE = 7kWh = 1 unit ═══
console.log('\nTest 4: "batt 7" ATMOCE 1P = 1 unit');
(function() {
  var p = parseBomBattery('atmoce 5kw 1phase + batt 7', 'ATMOCE');
  assert('BOM parser: battKwh=7', p.battKwh, 7);
  var c = calcAtmoceBattery(p.battKwh, p.battQty, '1P');
  assert('BOM calc: qty=1', c.qty, 1);
  assert('BOM calc: totalCost=110000', c.totalCost, 110000);
})();

// ═══ Test 5: "batt 2" ATMOCE = 2 units (< 7 = quantity) ═══
console.log('\nTest 5: "batt 2" ATMOCE 1P = 2 units');
(function() {
  var p = parseBomBattery('atmoce 5kw 1phase + batt 2', 'ATMOCE');
  assert('BOM parser: battQty=2', p.battQty, 2);
  assert('BOM parser: battKwh=0', p.battKwh, 0);
  var c = calcAtmoceBattery(p.battKwh, p.battQty, '1P');
  assert('BOM calc: qty=2', c.qty, 2);
  assert('BOM calc: totalCost=209000', c.totalCost, 209000);
})();

// ═══ Test 6: "batt 3" ATMOCE 1P = 3 units ═══
console.log('\nTest 6: "batt 3" ATMOCE 1P = 3 units');
(function() {
  var p = parseBomBattery('atmoce 5kw 1phase + batt 3', 'ATMOCE');
  assert('BOM parser: battQty=3', p.battQty, 3);
  var c = calcAtmoceBattery(p.battKwh, p.battQty, '1P');
  assert('BOM calc: qty=3', c.qty, 3);
  assert('BOM calc: totalCost=308000', c.totalCost, 308000);
})();

// ═══ Test 7: "batt 14kw" explicit kWh ═══
console.log('\nTest 7: "batt 14kw" explicit kWh');
(function() {
  var p = parseBomBattery('atmoce 10kw 1phase + batt 14kw', 'ATMOCE');
  assert('BOM parser: battKwh=14', p.battKwh, 14);
  var c = calcAtmoceBattery(p.battKwh, p.battQty, '1P');
  assert('BOM calc: qty=2', c.qty, 2);
})();

// ═══ Test 8: 3P pricing ═══
console.log('\nTest 8: ATMOCE 3P pricing — 2 batteries');
(function() {
  var c = calcAtmoceBattery(14, 1, '3P');
  assert('3P calc: qty=2', c.qty, 2);
  assert('3P calc: totalCost=229000', c.totalCost, 229000);
})();

// ═══ Test 9: AI result processing — battery_qty=14 → 14kWh ═══
console.log('\nTest 9: AI result with battery_qty=14 (ATMOCE)');
(function() {
  var kwh = processAiResult({ brand: 'ATMOCE', battery_qty: 14, battery_kwh: 0 });
  assert('AI: aiBattKwh=14', kwh, 14);
})();

// ═══ Test 10: AI result processing — battery_qty=2 → 14kWh ═══
console.log('\nTest 10: AI result with battery_qty=2 (ATMOCE)');
(function() {
  var kwh = processAiResult({ brand: 'ATMOCE', battery_qty: 2, battery_kwh: 0 });
  assert('AI: aiBattKwh=14', kwh, 14);
})();

// ═══ Summary ═══
console.log('\n' + (fail === 0 ? '✓' : '✗') + ' Results: ' + pass + '/' + (pass + fail) + ' passed');
if (fail > 0) process.exit(1);
