/**
 * intent-bridge.js — CJS wrapper for scripts/enervia/qt-intent.ts classifyIntent()
 *
 * Spawns a bun subprocess to call classifyIntent() and returns the parsed
 * IntentResult as a plain JS object.  Falls back gracefully (returns null)
 * on any error so callers can always fall through to the old parser.
 *
 * ENV:
 *   ANTHROPIC_API_KEY  — required for LLM call
 *   BUN_BIN            — override bun binary path (default: /home/po-ch/.bun/bin/bun)
 *
 * ra ☀️ — AI Engineer | 2026-04-13
 */

'use strict';

var execFile = require('child_process').execFile;
var path     = require('path');

var _fs         = require('fs');
var _homeBun    = require('os').homedir() + '/.bun/bin/bun';
var BUN_BIN     = process.env.BUN_BIN
  || (_fs.existsSync(_homeBun) ? _homeBun : (_fs.existsSync('/home/po-ch/.bun/bin/bun') ? '/home/po-ch/.bun/bin/bun' : 'bun'));
// Prefer env override → prod path (scripts under app root) → dev path (5 up).
var _devIntentTs  = path.resolve(__dirname, '../../../../../scripts/enervia/qt-intent.ts');
var _prodIntentTs = path.resolve(__dirname, '..', 'scripts', 'enervia', 'qt-intent.ts');
var QT_INTENT_TS  = process.env.QT_INTENT_TS_PATH
  || (_fs.existsSync(_prodIntentTs) ? _prodIntentTs : _devIntentTs);

/**
 * Quick heuristic mirroring needsLLM() from qt-intent.ts.
 * Avoids spawning bun for trivially short/QT-only messages.
 */
function needsLLM(text) {
  var t = (text || '').trim();
  if (t.length < 3) return false;
  if (/^QT\d{12,}$/.test(t)) return false;
  return true;
}

/**
 * Classify a LINE message via Claude Haiku intent router.
 *
 * @param {string} message   — raw LINE message text
 * @param {object} [opts]
 * @param {string} [opts.apiKey]   — override API key
 * @param {number} [opts.timeout]  — ms, default 18000
 * @returns {Promise<IntentResult|null>}  null on any error
 */
function classifyIntent(message, opts) {
  opts = opts || {};
  var apiKey  = opts.apiKey != null ? opts.apiKey : (process.env.ANTHROPIC_API_KEY || '');
  var timeout = opts.timeout || 18000;

  if (!needsLLM(message)) {
    return Promise.resolve({
      intent: 'unknown', quotation_id: null, confidence: 'low', params: {},
    });
  }

  // Build a short inline bun script that imports qt-intent.ts and calls classifyIntent
  var script = [
    'import { classifyIntent } from ' + JSON.stringify(QT_INTENT_TS) + ';',
    'const r = await classifyIntent(' + JSON.stringify(message) + ', {',
    '  apiKey: ' + JSON.stringify(apiKey) + ',',
    '  timeout: ' + (timeout - 2000) + ',',  // inner timeout slightly shorter
    '});',
    'process.stdout.write(JSON.stringify(r));',
  ].join('\n');

  return new Promise(function(resolve) {
    var env = Object.assign({}, process.env, { ANTHROPIC_API_KEY: apiKey });

    execFile(BUN_BIN, ['--eval', script], {
      timeout: timeout,
      maxBuffer: 64 * 1024,
      env: env,
    }, function(err, stdout, stderr) {
      if (err) {
        console.error('[intent-bridge] error:', (stderr || err.message).slice(0, 120));
        return resolve(null);
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch(e) {
        console.error('[intent-bridge] parse error:', stdout.slice(0, 80));
        resolve(null);
      }
    });
  });
}

module.exports = { classifyIntent: classifyIntent, needsLLM: needsLLM };
