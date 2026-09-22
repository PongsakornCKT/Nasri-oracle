'use strict';

/**
 * lib/sheet-sync.js — Async fire-and-forget sync of QT metadata to Google Sheet
 * via an Apps Script Web App.
 *
 * Contract:
 *   - syncQuotationToSheet(spec, quoteNumber, pdfUrl, lineDisplayName)
 *   - Returns Promise that ALWAYS resolves (never rejects). Errors logged to stderr.
 *   - 10s timeout. Uses Node built-in https only (zero deps).
 *   - Follows 302 → script.googleusercontent.com (Apps Script Web Apps require this).
 *   - Config via env vars: QSOLAR_SHEET_WEBAPP_URL, QSOLAR_SHEET_SECRET (defaults baked in).
 *
 * Payload keys = exact Sheet headers (Thai+English) so Apps Script can append by header name.
 *
 * If Apps Script doPost is missing, POST returns the HTML editor page or non-2xx.
 * Bot will deploy fine — sync simply logs and continues.
 */

var https = require('https');
var url = require('url');

var DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzFi05jB04BazDed0ktAb_sTPKsken_a_pu7UDD_UcgQeAPYTlQenatPMOzjFpwPUbpqQ/exec';
var DEFAULT_SECRET = 'pa-qsolar-2026-04';
var TIMEOUT_MS = 10000;
var MAX_REDIRECTS = 3;

function getRedirect(targetUrl, redirectsLeft) {
  return new Promise(function(resolve) {
    var u;
    try { u = url.parse(targetUrl); }
    catch (e) { return resolve({ ok: false, error: 'parse: ' + e.message }); }
    var opts = {
      method: 'GET',
      hostname: u.hostname,
      port: u.port || 443,
      path: u.path,
      headers: { 'User-Agent': 'qsolar-sheet-sync/1.0' },
    };
    var req = https.request(opts, function(res) {
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return resolve({ ok: false, status: res.statusCode, error: 'too many redirects' });
        return resolve(getRedirect(res.headers.location, redirectsLeft - 1));
      }
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var body = Buffer.concat(chunks).toString('utf8');
        var ok = res.statusCode >= 200 && res.statusCode < 300;
        resolve({ ok: ok, status: res.statusCode, body: body.slice(0, 500) });
      });
    });
    req.on('error', function(err) { resolve({ ok: false, error: err.message }); });
    req.setTimeout(TIMEOUT_MS, function() { req.destroy(new Error('timeout after ' + TIMEOUT_MS + 'ms')); });
    req.end();
  });
}

function postJson(targetUrl, bodyStr, redirectsLeft) {
  return new Promise(function(resolve) {
    var u;
    try { u = url.parse(targetUrl); }
    catch (e) { return resolve({ ok: false, error: 'parse: ' + e.message }); }

    var opts = {
      method: 'POST',
      hostname: u.hostname,
      port: u.port || 443,
      path: u.path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
        'User-Agent': 'qsolar-sheet-sync/1.0',
      },
    };

    var req = https.request(opts, function(res) {
      // Apps Script Web App pattern: POST processes body at /exec, returns 302 to echo URL.
      // Follow the redirect with GET (not POST) — body was already consumed by the first URL.
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return resolve({ ok: false, status: res.statusCode, error: 'too many redirects' });
        return resolve(getRedirect(res.headers.location, redirectsLeft - 1));
      }
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var body = Buffer.concat(chunks).toString('utf8');
        var ok = res.statusCode >= 200 && res.statusCode < 300;
        resolve({ ok: ok, status: res.statusCode, body: body.slice(0, 500) });
      });
    });

    req.on('error', function(err) {
      resolve({ ok: false, error: err.message });
    });
    req.setTimeout(TIMEOUT_MS, function() {
      req.destroy(new Error('timeout after ' + TIMEOUT_MS + 'ms'));
    });

    req.write(bodyStr);
    req.end();
  });
}

function syncQuotationToSheet(spec, quoteNumber, pdfUrl, lineDisplayName) {
  var webAppUrl = process.env.QSOLAR_SHEET_WEBAPP_URL || DEFAULT_WEBAPP_URL;
  var secret = process.env.QSOLAR_SHEET_SECRET || DEFAULT_SECRET;

  spec = spec || {};
  var inverterParts = [spec.brand || '', (spec.size_kw != null ? spec.size_kw + 'kW' : ''), spec.phase || ''];
  var inverter = inverterParts.filter(function(s) { return s; }).join(' ');

  var gatewayOrBackup = '';
  if (spec.has_backup) gatewayOrBackup = 'Backup';
  else if (spec.has_battery) gatewayOrBackup = 'Battery';

  var payload = {
    secret: secret,
    quote_number: quoteNumber || '',
    'Date': new Date().toISOString(),
    'ชื่อ-นามสกุล': spec.customer_name || '',
    'Online Name': lineDisplayName || '',
    'Lead': '',
    'Inverter': inverter,
    'ยี่ห้อ แผง': spec.panel_brand || '',
    'จำนวนแผง': spec.panel_count || 0,
    'Gateway or backup': gatewayOrBackup,
    'Batt Size': spec.battery_kwh || 0,
    'NOTE': '',
    'Email': '',
    'เบอร์': '',
    'Date Finish': '',
    'Status': 'Generated',
    'Approval 1': '',
    'Approval 2': '',
    'Ref link PDF': pdfUrl || '',
  };

  var bodyStr;
  try { bodyStr = JSON.stringify(payload); }
  catch (e) {
    console.error('[sheet-sync] stringify failed:', e.message);
    return Promise.resolve({ ok: false, error: 'stringify: ' + e.message });
  }

  return postJson(webAppUrl, bodyStr, MAX_REDIRECTS).then(function(result) {
    if (!result.ok) {
      console.error('[sheet-sync] failed for', quoteNumber || '(no-id)', '— status=' + (result.status || 'n/a'),
        'err=' + (result.error || ''), 'body=' + (result.body || '').slice(0, 200));
    } else {
      console.log('[sheet-sync] ok', quoteNumber || '(no-id)', 'status=' + result.status);
    }
    return result;
  }).catch(function(err) {
    console.error('[sheet-sync] unexpected:', err.message);
    return { ok: false, error: err.message };
  });
}

module.exports = {
  syncQuotationToSheet: syncQuotationToSheet,
};
