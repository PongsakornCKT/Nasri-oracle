/**
 * Environment Stub for Unit & Integration Testing (#N2 r5/r6)
 * Sets required environment variables before app.js is loaded in tests.
 */
const path = require('path');

process.env.NASRI_NO_LISTEN = '1';
process.env.QSOLAR_SHEET_ID = process.env.QSOLAR_SHEET_ID || '1MockSheetID1234567890ForTesting';
process.env.LF_BOM_FIXTURE_MODE = '1';
process.env.NASRI_DB_PATH = process.env.NASRI_DB_PATH || ':memory:';
process.env.BOMSOLAR_SCRIPT = process.env.BOMSOLAR_SCRIPT || path.resolve(__dirname, '../../mcp-bomsolar/server.py');
