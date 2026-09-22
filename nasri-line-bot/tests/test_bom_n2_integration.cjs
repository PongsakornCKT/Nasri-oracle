/**
 * Integration Test Suite for BOM N2 Flow (#N2 r5)
 * Tests full flow: natural language text -> parseSystemSpec / bomParser -> srpCalcBom -> srp_calc_cli.py
 * Uses LF_BOM_FIXTURE_MODE=1 + pricelist_fixture_2p5.json.
 */
require('./env.stub.cjs');

const path = require('path');
const { parseSystemSpec } = (function() {
  // Extract parseSystemSpec from app.js by using python-bridge and bom-parser
  const app = require('../deploy/app.js');
  return { parseSystemSpec: async function(text) {
    // Calling app's internal parseSystemSpec or simulating it via python-bridge
    const _bomParser = require('../deploy/bom-parser.js');
    const _pythonBridge = require('../deploy/lib/python-bridge')({ __dirname: path.join(__dirname, '../deploy') });
    const parsedReq = _bomParser.parseBomRequest(text);
    if (parsedReq.isAtmoceQuickReply) return { isAtmoceQuickReply: true, quickReplyMsg: parsedReq.quickReplyMsg };
    if (parsedReq.isSigenergyQuickReply) return { isSigenergyQuickReply: true, quickReplyMsg: parsedReq.quickReplyMsg };
    if (parsedReq.isSigenergyCiPrompt) return { isSigenergyCiPrompt: true, promptMsg: parsedReq.promptMsg };

    // Pass fixture_filename to fixture mode CLI
    parsedReq.fixture_filename = 'pricelist_fixture_2p5.json';
    const pyRes = await _pythonBridge.srpCalcBom(parsedReq);
    if (pyRes && pyRes.items) {
      const resItems = pyRes.items.map(function(i) {
        return {
          part_number: i.part_number,
          part_name: i.part_name,
          manufacturer: i.manufacturer,
          category: i.category,
          quantity: i.quantity,
          unit: i.unit,
          unit_cost: i.unit_cost !== null ? i.unit_cost : 0,
          total_cost: i.total_cost !== null ? i.total_cost : 0,
          notes: i.notes || ''
        };
      });
      resItems._summaryText = pyRes.summary_text;
      resItems._rawPyRes = pyRes;
      return resItems;
    }
    return [];
  }};
})();

async function runTests() {
  console.log('=== BOM N2 End-to-End Integration Test Suite ===\n');
  let passed = 0, failed = 0;

  function assertTest(name, cond, detail = '') {
    if (cond) {
      passed++;
      console.log(`  PASS  ${name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${name}  ${detail}`);
    }
  }

  // 1. ATMOCE C&I >= 30kW auto-detect
  try {
    const res1 = await parseSystemSpec('bom atmoce 30kw 3P');
    const invLine = Array.isArray(res1) && res1.find(i => i.part_number === 'MI-1250');
    assertTest('1. ATMOCE >=30kW auto-detects C&I (MI-1250)', !!invLine, `got: ${JSON.stringify(res1)}`);
  } catch (e) { assertTest('1. ATMOCE >=30kW auto-detects C&I', false, e.message); }

  // 2. ATMOCE 2:1 10 panels + battery 7 + backup (wantBackup=true)
  try {
    const res2 = await parseSystemSpec('bom atmoce 10 แผง 2:1 แบต 7 backup');
    const backupLine = Array.isArray(res2) && res2.find(i => i.part_number === 'MU100S');
    const battLine = Array.isArray(res2) && res2.find(i => i.part_number === 'MS-7K-U');
    assertTest('2. ATMOCE backup includes MU100S and MS-7K-U', !!backupLine && !!battLine, `backup=${!!backupLine}, batt=${!!battLine}`);
  } catch (e) { assertTest('2. ATMOCE backup includes MU100S', false, e.message); }

  // 3. ATMOCE Quick Reply trigger
  try {
    const res3 = await parseSystemSpec('bom atmoce 10 แผง');
    assertTest('3. ATMOCE without ratio returns quick reply', res3 && res3.isAtmoceQuickReply === true);
  } catch (e) { assertTest('3. ATMOCE without ratio returns quick reply', false, e.message); }

  // 4. Sigenergy 5in1 16 panels 3P price check from raw index 4 (70,000 THB)
  try {
    const res4 = await parseSystemSpec('bom sigenergy 5in1 16 แผง 3P');
    const invLine = Array.isArray(res4) && res4.find(i => i.part_number === 'SigenStor EC 10.0 TP');
    assertTest('4. Sigenergy 5in1 inverter unit cost = 70,000 (from raw index 4)', invLine && invLine.unit_cost === 70000, `got unit_cost: ${invLine ? invLine.unit_cost : null}`);
  } catch (e) { assertTest('4. Sigenergy 5in1 inverter unit cost', false, e.message); }

  // 5. Sigenergy C&I 50kW backup 1C
  try {
    const res5 = await parseSystemSpec('bom sigenergy c&i 50kw 3P backup 1C');
    const invLine = Array.isArray(res5) && res5.find(i => i.part_number === 'Sigen PV 50M1-HYB');
    const battLine = Array.isArray(res5) && res5.find(i => i.part_number === 'SigenStack BAT 12.0 (M2)');
    assertTest('5. Sigenergy C&I parses system, inverter & battery', !!invLine && !!battLine, `inv=${!!invLine}, batt=${!!battLine}`);
  } catch (e) { assertTest('5. Sigenergy C&I', false, e.message); }

  // 6. MEA Fee Tier 30 (20<kW<=30) -> 12,500 THB
  try {
    const res6 = await parseSystemSpec('bom atmoce 40 แผง 2:1 3P'); // 40 * 650 = 26kW
    const meaLine = Array.isArray(res6) && res6.find(l => l.k === 'D:meaFee' || (l.part_name && l.part_name.includes('MEA')));
    assertTest('6. MEA Fee Tier 20<kW<=30 equals 12,500 THB', meaLine && meaLine.unit_cost === 12500, `got fee: ${meaLine ? meaLine.unit_cost : null}`);
  } catch (e) { assertTest('6. MEA Fee Tier 20<kW<=30', false, e.message); }


  console.log(`\n=== Results: ${passed}/${passed + failed} passed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTests().catch(err => { console.error(err); process.exit(1); });

