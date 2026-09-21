/**
 * Test suite: ATMOCE BOM N1 engine integration for Nasri LINE bot (Round 2)
 * Run: LF_BOM_FIXTURE_MODE=1 node nasri-line-bot/tests/test_atmoce_n1.cjs
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

console.log('=== ATMOCE BOM N1 Node.js Bridge Test Suite (Round 2) ===\n');

// 1. Ratio unspecified detection test
function isRatioSpecified(text) {
  return /1:1|2:1|mi-500|mi-1250/i.test(text);
}

test('1. "atmoce 10 แผง" without ratio is detected as unspecified',
  !isRatioSpecified('atmoce 10 แผง'));

test('2. "atmoce 2:1 10 แผง" ratio is detected',
  isRatioSpecified('atmoce 2:1 10 แผง'));

test('3. "atmoce mi-500 8 แผง" ratio is detected',
  isRatioSpecified('atmoce mi-500 8 แผง'));

// 2. Python CLI bridge for Golden Case (a): 10 panels 2:1 1P
var resA = runCliSync({ action: 'atmoce_n1', panels: 10, ratio: '2:1', phase: '1P' });

test('4. Golden Case (a): Python CLI returns success=true',
  resA.success === true);

test('5. Golden Case (a): Ratio key is 2:1',
  resA.ratio === '2:1');

test('6. Golden Case (a): Micro inverter is MI-1250 x5 @ 4,750 THB',
  resA.inverter_sku === 'MI-1250' && resA.inverter_count === 5 &&
  resA.items.some(function(i) { return i.part_number === 'MI-1250' && i.unit_cost === 4750; }));

test('7. Golden Case (a): Trunk cable MW-025025-A is missing in staging snapshot',
  resA.items.some(function(i) { return i.part_number === 'MW-025025-A' && i.unit_cost === null && i.notes === 'ไม่มีราคาในชีตราคากลาง'; }));

test('8. Golden Case (a): Combiner Box is MC100 Warranty 5 year @ 15,900 THB',
  resA.items.some(function(i) { return i.part_number === 'MC100' && i.unit_cost === 15900; }));

test('9. Golden Case (a): Junction adapter is MT-04003-A x2 @ 640 THB',
  resA.items.some(function(i) { return i.part_number === 'MT-04003-A' && i.quantity === 2 && i.unit_cost === 640; }));

test('10. Golden Case (a): Keenoc mounting Rail 4800m = 6 @ 500 THB',
  resA.items.some(function(i) { return i.part_number === 'Rail 4800m' && i.quantity === 6 && i.unit_cost === 500; }));

test('11. Golden Case (a): Keenoc mounting L-Feet = 22 @ 27.5 THB',
  resA.items.some(function(i) { return i.part_number === 'L-Feet' && i.quantity === 22 && i.unit_cost === 27.5; }));

test('12. Golden Case (a): Summary text includes missing item notice and synced_at footer',
  resA.summary_text.indexOf('⚠️ มี 1 รายการไม่มีราคาในชีตราคากลาง') >= 0 &&
  resA.summary_text.indexOf('ราคาจากชีตราคากลาง survey ณ') >= 0);

// 3. Trunk Cable override: 1.3m cable explicitly requested
var res13 = runCliSync({ action: 'atmoce_n1', panels: 10, ratio: '2:1', phase: '1P', trunk_cable_length: '1.3' });
test('13. Explicit 1.3m trunk cable returns MW-025013-A @ 600 THB',
  res13.items.some(function(i) { return i.part_number === 'MW-025013-A' && i.quantity === 5 && i.unit_cost === 600; }));

// 4. Golden Case (c): 3P 20 panels
var resC = runCliSync({ action: 'atmoce_n1', panels: 20, ratio: '2:1', phase: '3P' });
test('14. Golden Case (c): 3P Combiner Box is MC100T @ 20,900 THB',
  resC.items.some(function(i) { return i.part_number === 'MC100T' && i.unit_cost === 20900; }));
test('15. Golden Case (c): 3P Adapter is MT-03205-A @ 1,050 THB',
  resC.items.some(function(i) { return i.part_number === 'MT-03205-A' && i.unit_cost === 1050; }));

// 5. Test SurveyUnavailable when fixture mode is OFF and key is missing
try {
  runCliSync({ action: 'atmoce_n1', panels: 10, ratio: '2:1', phase: '1P' }, { LF_BOM_FIXTURE_MODE: '0', LF_SURVEY_API_KEY: '' });
  test('16. No API key without fixture mode raises SurveyUnavailable', false);
} catch (e) {
  var errText = '';
  if (e.stderr) errText += e.stderr.toString('utf8');
  if (e.stdout) errText += e.stdout.toString('utf8');
  errText += e.message || '';
  test('16. No API key without fixture mode raises SurveyUnavailable',
    errText.indexOf('ไม่มี API Key') >= 0 || errText.indexOf('SurveyUnavailable') >= 0);
}

console.log('\n=== Results: ' + passed + '/' + (passed + failed) + ' passed ===');
if (failed) process.exit(1);
