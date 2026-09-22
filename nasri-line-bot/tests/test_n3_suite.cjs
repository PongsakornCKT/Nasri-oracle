/**
 * N3 Comprehensive Verification Test Suite (#N3 r2)
 * Run from nasri-line-bot/: LF_BOM_FIXTURE_MODE=1 node tests/test_n3_suite.cjs
 */

require('./env.stub.cjs');
var assert = require('assert');
var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');

console.log('=== N3 Complete Requirement Verification Suite (Round 2) ===\n');

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
  // Test 2: Flex Card Result Formatting & Legacy Snapshot
  // ---------------------------------------------------------------------------
  var flexBuilders = require('../deploy/lib/flex-builders');
  
  // 2.1 Legacy route (no bom_meta) — snapshot comparison against a6a4d74 baseline
  var case1 = {
    project_name: 'Huawei 5kW 1P',
    items: [
      { part_name: 'SUN2000-5KTL-L1', manufacturer: 'Huawei', quantity: 1, unit_cost: 35000, total_cost: 35000, category: 'Inverter' },
      { part_name: 'JAM72S30-550/MR', manufacturer: 'JA Solar', quantity: 10, unit_cost: 3500, total_cost: 35000, category: 'โมดูล' }
    ]
  };
  var case2 = {
    project_name: 'Custom System',
    phase: '3P',
    items: [
      { part_name: 'SUN2000-10KTL-M1', manufacturer: 'Huawei', quantity: 1, unit_cost: 45000, total_cost: 45000, category: 'Inverter' },
      { part_name: 'JAM72S30-550/MR', manufacturer: 'JA Solar', quantity: 20, unit_cost: 3500, total_cost: 70000, category: 'โมดูล' }
    ]
  };

  var snap1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/flex-legacy-1.json'), 'utf8'));
  var snap2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/flex-legacy-2.json'), 'utf8'));

  var cur1 = flexBuilders.buildBomResultFlex(case1);
  var cur2 = flexBuilders.buildBomResultFlex(case2);

  var snap1Match = false, snap2Match = false;
  try {
    assert.deepStrictEqual(cur1, snap1);
    snap1Match = true;
  } catch (e) { console.error('  Snapshot 1 mismatch:', e.message); }

  try {
    assert.deepStrictEqual(cur2, snap2);
    snap2Match = true;
  } catch (e) { console.error('  Snapshot 2 mismatch:', e.message); }

  check('2.1 Legacy Flex card Case 1 matches a6a4d74 snapshot 100% byte-for-byte', snap1Match);
  check('2.2 Legacy Flex card Case 2 matches a6a4d74 snapshot 100% byte-for-byte', snap2Match);

  // 2.3 N2 route (with bom_meta)
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

  check('2.3 N2 Flex card contains spec line with kWp, kW AC, phase, and package label',
    n2Json.includes('10.4 kWp') && n2Json.includes('10 kW AC') && n2Json.includes('3P') && n2Json.includes('ATMOCE 2:1 Package'),
    'got: ' + n2Json);

  check('2.4 N2 Flex card contains synced_at_thai footer',
    n2Json.includes('📌 ราคาจากชีตราคากลาง survey ณ 15/09/2026 00:17:29'),
    'got: ' + n2Json);

  check('2.5 N2 Flex card contains missing items warning block',
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
  // Test 4: /health Fixture Mode & Error Path Verification
  // ---------------------------------------------------------------------------
  var createPythonBridge = require('../deploy/lib/python-bridge');
  var bridge = createPythonBridge({ __dirname: path.join(__dirname, '../deploy') });
  var statusRes = await bridge.getCatalogStatus();

  check('4.1 python-bridge getCatalogStatus() in fixture mode returns ok: true with non-empty synced_at_thai',
    statusRes && statusRes.ok === true && typeof statusRes.synced_at_thai === 'string' && statusRes.synced_at_thai.length > 0,
    'got: ' + JSON.stringify(statusRes));

  // 4.2 Real server boot test for /health error path
  var errorScriptPath = path.join(__dirname, 'fixtures/fake_failing_script.py');
  fs.writeFileSync(errorScriptPath, '#!/usr/bin/env python3\nimport sys\nprint("ERROR", file=sys.stderr)\nsys.exit(1)\n');
  fs.chmodSync(errorScriptPath, '755');

  await new Promise(function(resolve, reject) {
    var testPort = 3997;
    var env = Object.assign({}, process.env, {
      PORT: String(testPort),
      QSOLAR_SHEET_ID: 'dummy',
      LF_BOM_FIXTURE_MODE: '0',
      BOMSOLAR_SCRIPT: errorScriptPath,
    });
    delete env.NASRI_NO_LISTEN;
    delete env.LF_SURVEY_API_KEY;

    var child = spawn('node', ['deploy/app.js'], {
      cwd: path.join(__dirname, '..'),
      env: env,
    });

    var resolved = false;
    var timeoutTimer = setTimeout(function() {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error('/health error test timed out'));
      }
    }, 10000);

    child.stdout.on('data', async function(chunk) {
      if (chunk.toString().includes('listening on ' + testPort)) {
        if (resolved) return;
        try {
          var startTime = Date.now();
          var res = await fetch('http://localhost:' + testPort + '/health');
          var elapsedMs = Date.now() - startTime;
          var json = await res.json();

          resolved = true;
          clearTimeout(timeoutTimer);
          child.kill();

          check('4.2 /health error path returns HTTP 200, survey_catalog.ok === false, error present, in < 2s',
            res.status === 200 &&
            json.survey_catalog &&
            json.survey_catalog.ok === false &&
            typeof json.survey_catalog.error === 'string' &&
            json.survey_catalog.error.length > 0 &&
            elapsedMs < 2000,
            'status=' + res.status + ' elapsed=' + elapsedMs + 'ms json=' + JSON.stringify(json.survey_catalog));

          resolve();
        } catch (err) {
          resolved = true;
          clearTimeout(timeoutTimer);
          child.kill();
          reject(err);
        }
      }
    });

    child.on('exit', function(code) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutTimer);
        reject(new Error('app exited prematurely with code ' + code));
      }
    });
  });

  // Clean up error script fixture
  try { fs.unlinkSync(errorScriptPath); } catch (e) {}

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
