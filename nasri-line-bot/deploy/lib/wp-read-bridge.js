'use strict';

var crypto = require('crypto');
var httpsDefault = require('https');

function normalizePhone(value) {
  var p = String(value || '').trim().replace(/[\s\-().]/g, '');
  p = p.replace(/^\+?66/, '0');
  return p;
}

module.exports = function createWpReadBridge(opts) {
  opts = opts || {};
  var base = String(opts.endpoint || process.env.LF_READ_BRIDGE_URL || 'https://survey.enervia.co.th/wp-json/lf/v1/bot').replace(/\/$/, '');
  var secret = opts.secret || process.env.LF_BOT_SECRET || '';
  var requestImpl = opts.request || function (options, cb) { return httpsDefault.request(options, cb); };
  var timeoutMs = Number(opts.timeoutMs || 8000);

  function requestJson(route, params, lineUserId) {
    var query = Object.keys(params || {}).filter(function (k) { return params[k] !== '' && params[k] != null; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])); }).join('&');
    var pathWithQuery = route + (query ? '?' + query : '');
    var ts = String(Date.now());
    // A fresh nonce per request is what lets the bridge tell a replayed capture
    // apart from a legitimate repeat — the same question asked twice in one
    // second would otherwise produce an identical signature.
    var nonce = crypto.randomBytes(16).toString('hex');
    var sig = crypto.createHmac('sha256', secret).update(ts + '|' + nonce + '|' + pathWithQuery).digest('hex');
    return new Promise(function (resolve) {
      if (!secret || !lineUserId) return resolve(null);
      var req;
      try {
        req = requestImpl({ hostname: new URL(base).hostname, port: new URL(base).port || 443, path: new URL(base).pathname.replace(/\/$/, '') + pathWithQuery, method: 'GET', headers: { 'X-LF-Signature': sig, 'X-LF-Timestamp': ts, 'X-LF-Nonce': nonce, 'X-LF-Line-User': String(lineUserId), Accept: 'application/json' } }, function (res) {
          var chunks = [];
          res.on('data', function (c) { chunks.push(c); });
          res.on('end', function () {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) return resolve(null);
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { resolve(null); }
          });
        });
        req.on('error', function () { resolve(null); });
        req.setTimeout(timeoutMs, function () { req.destroy(); resolve(null); });
        req.end();
      } catch (e) { resolve(null); }
    });
  }

  function findLead(q, lineUserId) { return requestJson('/lead', { q: normalizePhone(q) || q }, lineUserId).then(function (r) { return r && Array.isArray(r.leads) ? r.leads : null; }); }
  function getLeadDoc(leadId, type, lineUserId) { return requestJson('/lead-docs', { lead_id: leadId, type: type }, lineUserId); }
  function findStock(q, lineUserId) { return requestJson('/stock', { q: q }, lineUserId).then(function (r) { return r && Array.isArray(r.items) ? r.items : null; }); }

  return {
    findLead: findLead,
    getLeadDoc: getLeadDoc,
    findStock: findStock,
    requestJson: requestJson,
    normalizePhone: normalizePhone,
    sign: function (ts, nonce, path) {
      return crypto.createHmac('sha256', secret).update(String(ts) + '|' + String(nonce) + '|' + path).digest('hex');
    },
  };
};

module.exports.normalizePhone = normalizePhone;
