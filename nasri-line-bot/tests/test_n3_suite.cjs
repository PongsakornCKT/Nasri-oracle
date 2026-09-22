/**
 * N3 Comprehensive Verification Test Suite
 * Run from nasri-line-bot/: LF_BOM_FIXTURE_MODE=1 node tests/test_n3_suite.cjs
 */

require('./env.stub.cjs');
var assert = require('assert');
var path = require('path');
var fs = require('fs');

console.log('=== N3 Complete Requirement Verification Suite ===\n');

var passed = 0;
var failed = 0;

function check(title, condition, detail) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + title);
  } else {
    failed++;
    console.error('  FAIL  ' + title + (detail ? ' (' + detail + ')' : ''));
  }
}

async function runTests() {
  // ---------------------------------------------------------------------------
  // Test 1: AC Coupling Parsing (No Ratio Quick Reply Prompt)
  // ---------------------------------------------------------------------------
  var parser = require('../deploy/bom-parser');
  var acReq = parser.parseBomRequest('bom atmoce ac coupling แบต 7 backup');
  check('1.1 AC coupling returns action: bom_n2 and system: atmoce_ac',
    acReq.action === 'bom_n2' && acReq.system === 'atmoce_ac',
    'got: ' + JSON.stringify(acReq));

  check('1.2 AC coupling does not prompt for ratio quick reply',
    acReq.isAtmoceQuickReply === undefined && acReq.quickReplyMsg === undefined,
    'got: ' + JSON.stringify(acReq));

  // ---------------------------------------------------------------------------
  // Test 2: Flex Card Result Formatting
  // ---------------------------------------------------------------------------
  var flexBuilders = require('../deploy/lib/flex-builders');
  
  // 2.1 Legacy route (no bom_meta) — snapshot baseline
  var legacyData = {
    project_name: 'Huawei 5kW 1P',
    items: [
      { part_name: 'SUN2000-5KTL-L1', manufacturer: 'Huawei', quantity: 1, unit_cost: 35000, total_cost: 35000, category: 'Inverter' },
      { part_name: 'JAM72S30-550/MR', manufacturer: 'JA Solar', quantity: 10, unit_cost: 3500, total_cost: 35000, category: 'โมดูล' }
    ]
  };
  var legacyFlex = flexBuilders.buildBomResultFlex(legacyData);
  var legacyJson = JSON.stringify(legacyFlex);

  check('2.1 Legacy Flex card generated without error',
    legacyFlex && legacyFlex.type === 'flex',
    'got: ' + legacyFlex);

  // 2.2 N2 route (with bom_meta)
  var n2Data = {
    project_name: 'ATMOCE 10kW 3P',
    items: [
      { part_name: 'MI-1250', manufacturer: 'ATMOCE', quantity: 8, unit_cost: 12000, total_cost: 96000, category: 'Inverter' }
    ],
    bom_meta: {
      system: 'atmoce21',
      phase: '3P',
      panels: 16,
      kwp: 10.4,
      kw_ac: 10.0,
      package_label: 'ATMOCE 2:1 Package',
      inverter_sku: 'MI-1250',
      inverter_count: 8,
      synced_at_thai: '15/09/2026 00:17:29',
      has_missing_price: true,
      missing_items: ['สายไฟ AC Special']
    }
  };
  var n2Flex = flexBuilders.buildBomResultFlex(n2Data);
  var n2Json = JSON.stringify(n2Flex);

  check('2.2 N2 Flex card contains spec line with kWp, kW AC, phase, and package label',
    n2Json.includes('10.4 kWp') && n2Json.includes('10 kW AC') && n2Json.includes('3P') && n2Json.includes('ATMOCE 2:1 Package'),
    'got: ' + n2Json);

  check('2.3 N2 Flex card contains synced_at_thai footer',
    n2Json.includes('📌 ราคาจากชีตราคากลาง survey ณ 15/09/2026 00:17:29'),
    'got: ' + n2Json);

  check('2.4 N2 Flex card contains missing items warning block',
    n2Json.includes('⚠️ ไม่มีราคาในชีต: สายไฟ AC Special'),
    'got: ' + n2Json);

  // ---------------------------------------------------------------------------
  // Test 3: README Documentation Verification
  // ---------------------------------------------------------------------------
  var readmePath = path.join(__dirname, '../deploy/README.md');
  var readmeExists = fs.existsSync(readmePath);
  var readmeText = readmeExists ? fs.readFileSync(readmePath, 'utf8') : '';

  check('3.1 README.md exists in nasri-line-bot/deploy/',
    readmeExists, 'path: ' + readmePath);

  check('3.2 README.md documents 2:1 ratio, 2.5m trunk cable, C&I >=30kW, ratio quick reply, env vars, and deploy.sh v3.1',
    readmeText.includes('2:1') &&
    readmeText.includes('2.5') &&
    readmeText.includes('30 kW') &&
    readmeText.includes('Quick Reply') &&
    readmeText.includes('SURVEY_BASE_URL') &&
    readmeText.includes('LF_SURVEY_API_KEY') &&
    readmeText.includes('LF_BOM_FIXTURE_MODE') &&
    readmeText.includes('deploy.sh') &&
    readmeText.includes('DEPLOY_EXPECT_LIVE=live/ai-enervia-current'),
    'missing expected text in README.md');

  // ---------------------------------------------------------------------------
  // Test 4: /health Endpoint & survey_catalog Status
  // ---------------------------------------------------------------------------
  var createPythonBridge = require('../deploy/lib/python-bridge');
  var bridge = createPythonBridge({ __dirname: path.join(__dirname, '../deploy') });
  var statusRes = await bridge.getCatalogStatus();

  check('4.1 python-bridge getCatalogStatus() returns ok: true with synced_at_thai',
    statusRes && statusRes.ok === true && typeof statusRes.synced_at_thai === 'string',
    'got: ' + JSON.stringify(statusRes));

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n=== Test Summary: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(function(err) {
  console.error('Unhandled error in test runner:', err);
  process.exit(1);
});
