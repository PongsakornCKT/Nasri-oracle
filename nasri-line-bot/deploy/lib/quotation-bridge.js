/**
 * lib/quotation-bridge.js — CommonJS bridge to scripts/enervia/quotation-crud.ts
 *
 * quotation-crud.ts uses bun:sqlite (Bun runtime only).
 * app.js runs on Node.js via Phusion Passenger.
 *
 * This bridge spawns a Bun subprocess (quotation-runner.ts) for each call,
 * communicates via JSON stdio, and returns a Promise to the caller.
 *
 * Protocol:
 *   stdin  → { fn: string, args: any[] }
 *   stdout → { ok: true, result: any } | { ok: false, error: string }
 *
 * Env:
 *   BUN_PATH           — path to bun binary (default: 'bun' in PATH)
 *   NASRI_DB_PATH      — path to nasri.sqlite (forwarded to runner)
 *   ORACLE_REPO_ROOT   — repo root (forwarded to runner for path resolution)
 *
 * Usage in app.js:
 *   const qtCrud = require('./lib/quotation-bridge');
 *   const result = await qtCrud.createQuotation({ id: 'QT001', customer_name: 'Test' });
 *
 * ptah 𓂀 — Backend Architect | 2026-04-13
 */
'use strict';

var childProcess = require('child_process');
var path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

var BUN_PATH = process.env.BUN_PATH || process.env.BUN_BIN || 'bun';

// Resolve quotation-runner.ts: prefer env override → prod path (scripts/ under app root)
// → dev path (5 levels up). Fixes ENOENT on Plesk where the 5-level-up path lands above /var/.
var _devRunner  = path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'enervia', 'quotation-runner.ts');
var _prodRunner = path.resolve(__dirname, '..', 'scripts', 'enervia', 'quotation-runner.ts');
var RUNNER_PATH = process.env.QT_RUNNER_PATH
  || (require('fs').existsSync(_prodRunner) ? _prodRunner : _devRunner);

// DB path — forwarded to the Bun process so it opens the right sqlite file
var NASRI_DB_PATH = process.env.NASRI_DB_PATH || path.join(__dirname, '..', 'boms', 'nasri.sqlite');

// ── Core: spawn Bun runner ────────────────────────────────────────────────────

/**
 * call(fn, args) → Promise<result>
 *
 * Spawns `bun quotation-runner.ts`, sends JSON on stdin, reads JSON from stdout.
 * Rejects on non-zero exit or if runner returns { ok: false }.
 * Times out after 30 s to avoid hanging LINE webhook handlers.
 */
function call(fn, args) {
  return new Promise(function(resolve, reject) {
    var payload = JSON.stringify({ fn: fn, args: args || [] });
    var stdout = '';
    var stderr = '';
    var timedOut = false;

    var child = childProcess.spawn(BUN_PATH, ['run', RUNNER_PATH], {
      env: Object.assign({}, process.env, {
        NASRI_DB_PATH: NASRI_DB_PATH,
      }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    var timer = setTimeout(function() {
      timedOut = true;
      child.kill('SIGTERM');
      reject(new Error('[quotation-bridge] timeout calling ' + fn + ' (30s)'));
    }, 30000);

    child.stdin.write(payload);
    child.stdin.end();

    child.stdout.on('data', function(chunk) { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', function(chunk) { stderr += chunk.toString('utf8'); });

    child.on('close', function(code) {
      clearTimeout(timer);
      if (timedOut) return;

      if (stderr) {
        console.error('[quotation-bridge] stderr from runner (' + fn + '):', stderr.trim());
      }

      try {
        var parsed = JSON.parse(stdout.trim());
        if (!parsed.ok) {
          return reject(new Error('[quotation-bridge] runner error (' + fn + '): ' + parsed.error));
        }
        resolve(parsed.result);
      } catch (e) {
        reject(new Error(
          '[quotation-bridge] failed to parse runner output (' + fn + '). ' +
          'exit=' + code + ' stdout=' + stdout.slice(0, 200)
        ));
      }
    });

    child.on('error', function(err) {
      clearTimeout(timer);
      reject(new Error('[quotation-bridge] spawn error (' + fn + '): ' + err.message +
        '\nEnsure bun is installed and BUN_PATH env is set if not in PATH.'));
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * createQuotation(input) → Promise<CreateQuotationResult>
 *
 * Insert a new quotation header row into nasri.sqlite.
 * Call immediately after the Python PDF generator produces a new QT.
 *
 * input: {
 *   id: string,              // QT number (must match Python generator quote_number)
 *   customer_name: string,
 *   customer_phone?: string,
 *   customer_address?: string,
 *   seller_name?: string,
 *   system_size_kw?: number,
 *   phase?: number,          // 1 or 3
 *   brand?: string,
 *   subtotal?: number,
 *   discount?: number,
 *   vat_rate?: number,
 *   vat?: number,
 *   total?: number,          // grand_total from Python result
 *   payment_terms?: string,
 *   notes?: string,
 *   status?: string,         // default 'draft'
 *   created_by?: string,     // LINE userId
 *   labor_rate?: number,
 *   bos_rate?: number,
 *   pea_fee_used?: number,
 * }
 *
 * Returns: { ok, quotation_id, version, error? }
 */
function createQuotation(input) {
  return call('createQuotation', [input]);
}

/**
 * getQuotationDetail(quotationId) → Promise<{ header, items } | null>
 */
function getQuotationDetail(quotationId) {
  return call('getQuotationDetail', [quotationId]);
}

/**
 * editItem(quotationId, itemId, changes, opts?) → Promise<CrudResult>
 * opts: { changedBy?, changeNote?, expectedVersion? }
 */
function editItem(quotationId, itemId, changes, opts) {
  return call('editItem', [quotationId, itemId, changes, opts || {}]);
}

/**
 * addItem(quotationId, newItem, opts?) → Promise<CrudResult>
 * newItem: { description, quantity?, unit?, unit_price?, brand?, model?, category?, warranty?, is_optional?, sort_order? }
 * opts: { changedBy?, changeNote?, expectedVersion? }
 */
function addItem(quotationId, newItem, opts) {
  return call('addItem', [quotationId, newItem, opts || {}]);
}

/**
 * removeItem(quotationId, itemId, opts?) → Promise<CrudResult>
 * opts: { changedBy?, changeNote?, expectedVersion? }
 */
function removeItem(quotationId, itemId, opts) {
  return call('removeItem', [quotationId, itemId, opts || {}]);
}

/**
 * updateQuotationPrices(quotationId) → Promise<UpdatePricesResult>
 * READ-ONLY — computes price diff, does not mutate. Call applyPriceUpdate to commit.
 */
function updateQuotationPrices(quotationId) {
  return call('updateQuotationPrices', [quotationId]);
}

/**
 * applyPriceUpdate(quotationId, priceDiff, opts?) → Promise<UpdatePricesResult>
 * priceDiff: result from updateQuotationPrices()
 * opts: { changedBy?, expectedVersion? }
 */
function applyPriceUpdate(quotationId, priceDiff, opts) {
  return call('applyPriceUpdate', [quotationId, priceDiff, opts || {}]);
}

/**
 * resendPdf(quotationId) → Promise<{ ok, quotation_id, pdf_path, pdf_status, error? }>
 */
function resendPdf(quotationId) {
  return call('resendPdf', [quotationId]);
}

/**
 * listQuotationsByUser(userId, opts?) → Promise<QuotationSummary[]>
 * opts: { limit?: number, role?: 'customer' | 'sales' | 'admin' }
 * role 'customer' → filters to created_by=userId; sales/admin → all
 */
function listQuotationsByUser(userId, opts) {
  return call('listQuotationsByUser', [userId, opts || {}]);
}

/**
 * searchQuotationsByCustomer(nameQuery, userId, opts?) → Promise<QuotationSummary[]>
 * opts: { limit?: number, role?: 'customer' | 'sales' | 'admin' }
 * role 'customer' → also filters to created_by=userId
 */
function searchQuotationsByCustomer(nameQuery, userId, opts) {
  return call('searchQuotationsByCustomer', [nameQuery, userId, opts || {}]);
}

/**
 * bumpVersion — not exposed directly; requires an open DB transaction.
 * Use editItem / addItem / removeItem instead — they call bumpVersion internally.
 */

module.exports = {
  createQuotation: createQuotation,
  getQuotationDetail: getQuotationDetail,
  editItem: editItem,
  addItem: addItem,
  removeItem: removeItem,
  updateQuotationPrices: updateQuotationPrices,
  applyPriceUpdate: applyPriceUpdate,
  resendPdf: resendPdf,
  listQuotationsByUser: listQuotationsByUser,
  searchQuotationsByCustomer: searchQuotationsByCustomer,
  // Expose for diagnostics / health checks
  _runnerPath: RUNNER_PATH,
  _nasriDbPath: NASRI_DB_PATH,
};
