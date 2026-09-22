/**
 * qt-crud-bridge.js — CJS wrapper for scripts/enervia/quotation-crud.ts operations
 *
 * Each function spawns a bun subprocess that imports quotation-crud.ts and
 * runs the requested operation, returning JSON on stdout.
 *
 * Callers must handle errors (Promise rejects on subprocess failure).
 *
 * ENV:
 *   BUN_BIN         — override bun binary (default: auto-detect ~/.bun/bin/bun or PATH)
 *   NASRI_DB_PATH   — override SQLite path (auto-set from caller via opts.dbPath)
 *
 * ra ☀️ — AI Engineer | 2026-04-13
 */

'use strict';

var execFile = require('child_process').execFile;
var path     = require('path');

// Resolve bun binary: env override → ~/.bun/bin/bun (portable home dir) → PATH fallback
// NOTE: /home/po-ch/.bun/bin/bun is LOCAL dev only — Plesk user is 'enervia', not 'po-ch'
var _homeBun  = require('os').homedir() + '/.bun/bin/bun';
var _fs       = require('fs');
var BUN_BIN   = process.env.BUN_BIN ||
               (_fs.existsSync(_homeBun) ? _homeBun : 'bun');
// Prefer env override → prod path (scripts under app root) → dev path (5 up).
var _devCrudTs  = path.resolve(__dirname, '../../../../../scripts/enervia/quotation-crud.ts');
var _prodCrudTs = path.resolve(__dirname, '..', 'scripts', 'enervia', 'quotation-crud.ts');
var CRUD_TS     = process.env.QT_CRUD_TS_PATH
  || (_fs.existsSync(_prodCrudTs) ? _prodCrudTs : _devCrudTs);

/**
 * Run a bun subprocess that executes `script` and returns parsed JSON stdout.
 */
function _run(script, opts) {
  opts = opts || {};
  var env = Object.assign({}, process.env);
  if (opts.dbPath) env.NASRI_DB_PATH = opts.dbPath;

  return new Promise(function(resolve, reject) {
    execFile(BUN_BIN, ['--eval', script], {
      timeout: opts.timeout || 20000,
      maxBuffer: 256 * 1024,
      env: env,
    }, function(err, stdout, stderr) {
      if (err) return reject(new Error((stderr || err.message).slice(0, 200)));
      try { resolve(JSON.parse(stdout.trim())); }
      catch(e) { reject(new Error('qt-crud-bridge parse error: ' + stdout.slice(0, 100))); }
    });
  });
}

/** One-liner import statement */
function _imp(fn) {
  return 'import { ' + fn + ' } from ' + JSON.stringify(CRUD_TS) + ';\n';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get full quotation detail (header + items).
 * @returns {Promise<{header, items}|null>}
 */
function getQuotationDetail(quotationId, dbPath) {
  var s = _imp('getQuotationDetail') +
    'const r = getQuotationDetail(' + JSON.stringify(quotationId) + ');\n' +
    'process.stdout.write(JSON.stringify(r));';
  return _run(s, { dbPath: dbPath });
}

/**
 * Edit an existing line item.
 * @param {string} quotationId
 * @param {number} itemId
 * @param {object} changes  — Partial<NewItem>: quantity, description, unit_price, etc.
 * @param {object} [opts]   — { dbPath, editedBy, expectedVersion }
 * @returns {Promise<CrudResult>}
 */
function editItem(quotationId, itemId, changes, opts) {
  opts = opts || {};
  var s = _imp('editItem') +
    'const r = await editItem(' + JSON.stringify(quotationId) + ', ' +
      JSON.stringify(itemId) + ', ' + JSON.stringify(changes) + ', ' +
      JSON.stringify({ editedBy: opts.editedBy, expectedVersion: opts.expectedVersion }) + ');\n' +
    'process.stdout.write(JSON.stringify(r));';
  return _run(s, { dbPath: opts.dbPath });
}

/**
 * Add a new line item to a quotation.
 * @param {string} quotationId
 * @param {object} item  — { description, quantity, unit, unit_price, category }
 * @param {object} [opts] — { dbPath, editedBy }
 * @returns {Promise<CrudResult>}
 */
function addItem(quotationId, item, opts) {
  opts = opts || {};
  var s = _imp('addItem') +
    'const r = await addItem(' + JSON.stringify(quotationId) + ', ' + JSON.stringify(item) + ', ' +
      JSON.stringify({ editedBy: opts.editedBy }) + ');\n' +
    'process.stdout.write(JSON.stringify(r));';
  return _run(s, { dbPath: opts.dbPath });
}

/**
 * Remove a line item from a quotation.
 * @param {string} quotationId
 * @param {number} itemId
 * @param {object} [opts] — { dbPath, editedBy }
 * @returns {Promise<CrudResult>}
 */
function removeItem(quotationId, itemId, opts) {
  opts = opts || {};
  var s = _imp('removeItem') +
    'const r = await removeItem(' + JSON.stringify(quotationId) + ', ' + JSON.stringify(itemId) + ', ' +
      JSON.stringify({ editedBy: opts.editedBy }) + ');\n' +
    'process.stdout.write(JSON.stringify(r));';
  return _run(s, { dbPath: opts.dbPath });
}

/**
 * Read-only price diff: compare quotation item prices against current catalog.
 * Returns PriceDiff — caller decides whether to call applyPriceUpdate.
 * @returns {Promise<PriceDiff>}
 */
function updateQuotationPrices(quotationId, dbPath) {
  var s = _imp('updateQuotationPrices') +
    'const r = updateQuotationPrices(' + JSON.stringify(quotationId) + ');\n' +
    'process.stdout.write(JSON.stringify(r));';
  return _run(s, { dbPath: dbPath });
}

/**
 * Apply a previously computed PriceDiff to the quotation.
 * @param {string} quotationId
 * @param {object} priceDiff  — PriceDiff from updateQuotationPrices()
 * @param {object} [opts]     — { dbPath, editedBy }
 * @returns {Promise<CrudResult>}
 */
function applyPriceUpdate(quotationId, priceDiff, opts) {
  opts = opts || {};
  var s = _imp('applyPriceUpdate') +
    'const r = await applyPriceUpdate(' + JSON.stringify(quotationId) + ', ' + JSON.stringify(priceDiff) + ', ' +
      JSON.stringify({ editedBy: opts.editedBy }) + ');\n' +
    'process.stdout.write(JSON.stringify(r));';
  return _run(s, { dbPath: opts.dbPath });
}

/**
 * Resend the PDF for a quotation (pushes to LINE).
 * @returns {Promise<{ok, pdf_url?}>}
 */
function resendPdf(quotationId, opts) {
  opts = opts || {};
  var s = _imp('resendPdf') +
    'const r = await resendPdf(' + JSON.stringify(quotationId) + ', ' +
      JSON.stringify({ editedBy: opts.editedBy }) + ');\n' +
    'process.stdout.write(JSON.stringify(r));';
  return _run(s, { dbPath: opts.dbPath });
}

/**
 * Search quotations by customer name (LIKE search).
 * @param {string} nameQuery        — partial customer name
 * @param {string|null} ownUserId   — null for sales/admin (all results); userId for PDPA filtering
 * @param {object} [opts]           — { dbPath, limit }
 * @returns {Promise<Array<QuotationSummary>>}
 */
function searchQuotationsByCustomer(nameQuery, ownUserId, opts) {
  opts = opts || {};
  var role = (ownUserId === null || ownUserId === undefined) ? 'sales' : 'customer';
  var userId = ownUserId || '';
  var s = _imp('searchQuotationsByCustomer') +
    'const r = searchQuotationsByCustomer(' +
      JSON.stringify(nameQuery) + ', ' +
      JSON.stringify(userId) + ', ' +
      '{ limit: ' + (opts.limit || 20) + ', role: ' + JSON.stringify(role) + ' }' +
    ');\n' +
    'process.stdout.write(JSON.stringify(r));';
  return _run(s, { dbPath: opts.dbPath });
}

/**
 * Get version history for a quotation.
 * @returns {Promise<Array<{version, created_at, created_by, change_type, total_snapshot}>>}
 */
function getVersions(quotationId, dbPath) {
  var s = [
    'import { openNasri } from ' + JSON.stringify(CRUD_TS) + ';',
    'const db = openNasri();',
    'const rows = db.prepare(',
    '  "SELECT version, created_at, created_by, change_type, total_snapshot FROM quotation_versions WHERE quotation_id=? ORDER BY version ASC"',
    ').all(' + JSON.stringify(quotationId) + ');',
    'db.close();',
    'process.stdout.write(JSON.stringify(rows));',
  ].join('\n');
  return _run(s, { dbPath: dbPath });
}

module.exports = {
  getQuotationDetail:          getQuotationDetail,
  editItem:                    editItem,
  addItem:                     addItem,
  removeItem:                  removeItem,
  updateQuotationPrices:       updateQuotationPrices,
  applyPriceUpdate:            applyPriceUpdate,
  resendPdf:                   resendPdf,
  getVersions:                 getVersions,
  searchQuotationsByCustomer:  searchQuotationsByCustomer,
};
