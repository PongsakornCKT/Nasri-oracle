/**
 * BOM Parser Unit Test Suite (#N2 Round 2)
 * Tests parser payload generation & quick reply routing against real user inputs.
 */

var parser = require('../deploy/bom-parser');

console.log('=== BOM Parser Unit Test Suite (N2 Round 2) ===\n');

var passed = 0;
var failed = 0;

function test(name, condition, detail) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    console.log('  FAIL  ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

// 1. ATMOCE C&I ≥30kW auto-detection
var p1 = parser.parseBomRequest('bom atmoce 40kw 3phase');
test('1. "bom atmoce 40kw 3phase" detects C&I system',
  p1.system === 'atmoce21' && p1.isCI === true && p1.kw === 40 && p1.phase === '3P');

// 2. ATMOCE 10 panels + 2:1 + batt 7 + backup + warranty 25 yrs
var p2 = parser.parseBomRequest('bom atmoce 10 แผง 2:1 แบต 7 backup ประกัน 25 ปี');
test('2. "bom atmoce 10 แผง 2:1 แบต 7 backup ประกัน 25 ปี" parses battery, backup, and warranty',
  p2.action === 'bom_n2' && p2.system === 'atmoce21' && p2.panels === 10 &&

  p2.battery_kwh === 7 && p2.backup === true && p2.warr === 'p10');

// 3. ATMOCE without ratio -> ratio quick reply
var p3 = parser.parseBomRequest('bom atmoce 10 แผง');
test('3. "bom atmoce 10 แผง" returns ratio quick reply',
  p3.isAtmoceQuickReply === true && p3.quickReplyMsg && p3.quickReplyMsg.quickReply);

// 4. Sigenergy without subtype -> subtype quick reply
var p4 = parser.parseBomRequest('bom sigenergy');
test('4. "bom sigenergy" returns subtype quick reply',
  p4.isSigenergyQuickReply === true && p4.quickReplyMsg && p4.quickReplyMsg.quickReply);

// 5. Sigenergy C&I without backup/C-rate -> prompts for choices
var p5 = parser.parseBomRequest('bom sigenergy c&i 50kw 3P');
test('5. "bom sigenergy c&i 50kw 3P" prompts for backup & C-rate',
  p5.isSigenergyCiPrompt === true && p5.promptMsg && p5.promptMsg.quickReply);

// 6. Sigenergy C&I with backup & 1C
var p6 = parser.parseBomRequest('bom sigenergy c&i 50kw 3P backup 1C');
test('6. "bom sigenergy c&i 50kw 3P backup 1C" parses backup:true and c_rate:1C',
  p6.action === 'bom_n2' && p6.system === 'sigenci' && p6.kw === 50 &&
  p6.backup === true && p6.c_rate === '1C');

// 7. Sigenergy Neo 10 panels
var p7 = parser.parseBomRequest('bom sigenergy neo 10 แผง');
test('7. "bom sigenergy neo 10 แผง" parses sigenneo system',
  p7.action === 'bom_n2' && p7.system === 'sigenneo' && p7.panels === 10);

console.log('\n=== Results: ' + passed + '/' + (passed + failed) + ' passed ===');
if (failed) process.exit(1);
