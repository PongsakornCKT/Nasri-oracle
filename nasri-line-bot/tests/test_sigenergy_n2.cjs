/**
 * Test suite: Sigenergy & N2 engine integration for Nasri LINE bot (#N2)
 * Run: node nasri-line-bot/tests/test_sigenergy_n2.cjs
 */
'use strict';

var cp = require('child_process');
var path = require('path');
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

function runCliSync(args, envs) {
  var cliPath = path.join(__dirname, '..', '..', 'mcp-bomsolar', 'srp_calc_cli.py');
  var cmd = 'python3 ' + JSON.stringify(cliPath) + ' ' + JSON.stringify(JSON.stringify(args));
  var env = Object.assign({}, process.env, envs || { LF_BOM_FIXTURE_MODE: '1' });
  var stdout = cp.execSync(cmd, { encoding: 'utf8', env: env });
  return JSON.parse(stdout.trim());
}

console.log('=== Sigenergy & N2 Node.js Bridge Test Suite ===\n');

// 1. Sigenergy quick reply detection helper
function isSigenergySubtypeSpecified(text) {
  return /5in1|5\s*in\s*1|neo|c&i|ci\b/i.test(text);
}

test('1. "sigenergy" without subtype requires quick reply selection',
  !isSigenergySubtypeSpecified('sigenergy'));

test('2. "sigenergy 5in1 16 แผง" subtype is detected',
  isSigenergySubtypeSpecified('sigenergy 5in1 16 แผง'));

test('3. "sigenergy neo 10 แผง" subtype is detected',
  isSigenergySubtypeSpecified('sigenergy neo 10 แผง'));

test('4. "sigenergy c&i 50kw" subtype is detected',
  isSigenergySubtypeSpecified('sigenergy c&i 50kw'));

// 2. Python CLI bridge for Golden Case (3): Sigenergy 5in1 16 panels 3P
var res5in1 = runCliSync({ action: 'bom_n2', system: 'sigenergy5in1', panels: 16, phase: '3P', fixture_filename: 'pricelist_fixture_2p5.json' });

test('5. Golden Case (3): Sigenergy 5in1 CLI returns success=true',
  res5in1.success === true);

test('6. Golden Case (3): Inverter model is SigenStor EC 10.0 TP @ 70,000 THB',
  res5in1.lines.some(function(l) { return l.n === 'SigenStor EC 10.0 TP' && l.c === 70000; }));

test('7. Golden Case (3): Optimizer is AndSolar AMCP Power Optimizer x8 @ 1,900 THB',
  res5in1.lines.some(function(l) { return l.n === 'AndSolar AMCP Power Optimizer' && l.q === 8 && l.c === 1900; }));

// 3. Python CLI bridge for Golden Case (5): Sigenergy C&I 50kW 3P + backup + 1C battery
var resCI = runCliSync({ action: 'bom_n2', system: 'sigenci', kw: 50, phase: '3P', battery_kwh: 100, backup: true, c_rate: '1C', fixture_filename: 'pricelist_fixture_2p5.json' });

test('8. Golden Case (5): Sigenergy C&I CLI returns success=true',
  resCI.success === true);

test('9. Golden Case (5): Inverter is Sigen PV 50M1-HYB @ 161,100 THB',
  resCI.lines.some(function(l) { return l.n === 'Sigen PV 50M1-HYB' && l.c === 161100; }));

test('10. Golden Case (5): Battery is SigenStack BAT 12.0 (M2) x9 @ 83,200 THB',
  resCI.lines.some(function(l) { return l.n === 'SigenStack BAT 12.0 (M2)' && l.q === 9 && l.c === 83200; }));

test('11. Golden Case (5): MEA Fee is 21,500 THB for 50kW system',
  resCI.lines.some(function(l) { return l.k === 'D:meaFee' && l.c === 21500; }));

// 4. Python CLI bridge for Golden Case (6): Atmoce AC Coupling 1P
var resAC = runCliSync({ action: 'bom_n2', system: 'atmoce_ac', phase: '1P', battery_kwh: 7, backup: true, fixture_filename: 'pricelist_fixture_2p5.json' });

test('12. Golden Case (6): AC Coupling CLI returns success=true',
  resAC.success === true);

test('13. Golden Case (6): ESS Labor is flat fee line with labor:flat key',
  resAC.lines.some(function(l) { return l.k === 'labor:flat' && l.s === 'C'; }));

test('14. Golden Case (6): AC Coupling has no solar panel line',
  !resAC.lines.some(function(l) { return l.k === 'panel'; }));

console.log('\n=== Results: ' + passed + '/' + (passed + failed) + ' passed ===');
if (failed) process.exit(1);
