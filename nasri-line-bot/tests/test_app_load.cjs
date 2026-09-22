/**
 * Production Load & Server Listening Test Suite (#N2 r7)
 * 1. Verifies requiring app.js/python-bridge without BOMSOLAR_SCRIPT set (production path)
 *    resolves BOMSOLAR_SCRIPT correctly without ReferenceError (fs module test).
 * 2. Spawns 'node app.js' on a test PORT (e.g. 3999) without NASRI_NO_LISTEN set,
 *    verifying it prints 'listening on 3999' within 10s.
 */
const { spawn } = require('child_process');
const path = require('path');

// 1. Production path require test: clear BOMSOLAR_SCRIPT from env first
delete process.env.BOMSOLAR_SCRIPT;
process.env.NASRI_NO_LISTEN = '1';
process.env.QSOLAR_SHEET_ID = process.env.QSOLAR_SHEET_ID || '1MockSheetID1234567890ForTesting';
process.env.LF_BOM_FIXTURE_MODE = '1';
process.env.NASRI_DB_PATH = process.env.NASRI_DB_PATH || ':memory:';

console.log('=== app.js & python-bridge Production Load Test ===\n');

try {
  const createPythonBridge = require('../deploy/lib/python-bridge');
  const pb = createPythonBridge({ __dirname: path.join(__dirname, '../deploy') });
  if (!pb.BOMSOLAR_SCRIPT || !pb.BOMSOLAR_SCRIPT.endsWith('server.py')) {
    throw new Error('BOMSOLAR_SCRIPT failed to resolve: ' + pb.BOMSOLAR_SCRIPT);
  }
  console.log('  PASS  1. python-bridge resolved BOMSOLAR_SCRIPT without env set:', pb.BOMSOLAR_SCRIPT);

  const app = require('../deploy/app.js');
  console.log('  PASS  2. app.js loaded in production mode without ReferenceError');
} catch (err) {
  console.error('  FAIL  Production require test failed:', err);
  process.exit(1);
}

// 2. Server listening test: spawn 'node app.js' on TEST_PORT=3999
async function testServerListening() {
  return new Promise((resolve, reject) => {
    const testPort = 3999;
    const testEnv = Object.assign({}, process.env, {
      PORT: String(testPort),
      QSOLAR_SHEET_ID: '1MockSheetID1234567890ForTesting',
      LF_BOM_FIXTURE_MODE: '1',
      NASRI_DB_PATH: ':memory:',
    });
    delete testEnv.NASRI_NO_LISTEN; // Ensure server.listen is executed!
    delete testEnv.BOMSOLAR_SCRIPT;

    const child = spawn('node', ['deploy/app.js'], {
      cwd: path.join(__dirname, '..'),
      env: testEnv,
    });

    let output = '';
    let resolved = false;

    const timeoutTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error(`Timed out waiting for listening message after 10s. Output: ${output}`));
      }
    }, 10000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes(`listening on ${testPort}`)) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutTimer);
          child.kill();
          console.log(`  PASS  3. node app.js printed 'listening on ${testPort}' within 10s`);
          resolve();
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutTimer);
        reject(new Error(`node app.js exited prematurely with code ${code}. Output: ${output}`));
      }
    });
  });
}

testServerListening()
  .then(() => {
    console.log('\n=== All Production Load Tests Passed ===');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n  FAIL  Server listening test failed:', err.message);
    process.exit(1);
  });
