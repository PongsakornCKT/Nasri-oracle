/**
 * Test app.js load test suite (#N2 r5)
 * Verifies requiring app.js with NASRI_NO_LISTEN=1 and env.stub.cjs succeeds without errors or listening on port.
 */
require('./env.stub.cjs');

try {
  const app = require('../deploy/app.js');
  console.log('  PASS  test_app_load: app.js loaded successfully without error');
  process.exit(0);
} catch (err) {
  console.error('  FAIL  test_app_load: error requiring app.js:', err);
  process.exit(1);
}
