'use strict';

/**
 * qsolar-socket-client.js — W2 FastAPI Persistent Socket Bridge Client (#Phase04)
 * Provides persistent Unix domain socket communication to FastAPI server (/tmp/qsolar.sock).
 * Endpoints: /health, /install_lines, /bom_generate.
 *
 * STRICT SAFETY RULE:
 *   - Opt-in via process.env.QSOLAR_USE_SOCKET === '1'.
 *   - DEFAULT IS DISABLED -> returns ok:false triggering automatic fallback to standard CLI spawn!
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

var http = require('http');

function createQsolarSocketClient(opts) {
  opts = opts || {};
  var socketPath = opts.socketPath || process.env.QSOLAR_SOCKET_PATH || '/tmp/qsolar.sock';
  var timeoutMs = opts.timeoutMs || 3000;

  function isEnabled() {
    return process.env.QSOLAR_USE_SOCKET === '1' || opts.forceEnable === true;
  }

  function request(endpoint, payload) {
    if (!isEnabled()) {
      return Promise.resolve({ ok: false, error: 'Socket disabled (use QSOLAR_USE_SOCKET=1)' });
    }

    return new Promise(function(resolve) {
      var postData = JSON.stringify(payload || {});
      var reqOpts = {
        socketPath: socketPath,
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: timeoutMs
      };

      var req = http.request(reqOpts, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try {
            var parsed = JSON.parse(data);
            resolve({ ok: true, data: parsed, statusCode: res.statusCode });
          } catch (e) {
            resolve({ ok: false, error: 'JSON parse error: ' + e.message, raw: data });
          }
        });
      });

      req.on('error', function(err) {
        resolve({ ok: false, error: 'Socket connection failed: ' + err.message });
      });

      req.on('timeout', function() {
        req.destroy();
        resolve({ ok: false, error: 'Socket request timed out after ' + timeoutMs + 'ms' });
      });

      req.write(postData);
      req.end();
    });
  }

  function getHealth() {
    return request('/health', {});
  }

  function generateBom(spec, customerName, projectAddress) {
    return request('/bom_generate', {
      spec: spec,
      customer_name: customerName,
      project_address: projectAddress
    });
  }

  function getInstallLines(spec) {
    return request('/install_lines', { spec: spec });
  }

  return {
    isEnabled: isEnabled,
    request: request,
    getHealth: getHealth,
    generateBom: generateBom,
    getInstallLines: getInstallLines
  };
}

module.exports = createQsolarSocketClient;
