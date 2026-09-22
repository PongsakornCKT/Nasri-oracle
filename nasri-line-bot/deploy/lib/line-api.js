'use strict';

// ─── LINE API wrappers ────────────────────────────────────────
// Factory takes a getter for LINE_TOKEN so tests / hot-reload still work
// without requiring the caller to re-import.
//
//   var lineApi = require('./lib/line-api')({ getToken: () => LINE_TOKEN });
//   lineApi.lReply(replyToken, messages);
//
// Exposes: lHeaders, lReply, lPush, rText, _trackLine, _lastLineResults
module.exports = function createLineApi(opts) {
  opts = opts || {};
  var API = opts.api || 'https://api.line.me/v2/bot';
  var getToken = opts.getToken || function() { return process.env.LINE_CHANNEL_ACCESS_TOKEN || ''; };

  // Track last LINE API results for diagnostics
  var _lastLineResults = [];
  function _trackLine(type, status, detail) {
    _lastLineResults.push({ ts: new Date().toISOString(), type: type, status: status, detail: (detail || '').slice(0, 200) });
    if (_lastLineResults.length > 20) _lastLineResults.shift();
  }

  function lHeaders() {
    var token = getToken();
    if (!token) return null;
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  }

  async function lReply(rt, msgs) {
    var h = lHeaders();
    if (!h) { console.log('[dev reply]', JSON.stringify(msgs.map(function(m) { return m.text || m.type; }))); _trackLine('reply', 'no-token', ''); return; }
    try {
      var r = await fetch(API + '/message/reply', { method: 'POST', headers: h, body: JSON.stringify({ replyToken: rt, messages: msgs }) });
      if (!r.ok) { var t = await r.text(); console.error('[LINE reply]', r.status, t); _trackLine('reply', r.status, t); }
      else { _trackLine('reply', 200, 'ok'); }
    } catch (e) { console.error('[LINE reply] error:', e.message); _trackLine('reply', 'error', e.message); }
  }

  async function lPush(to, msgs) {
    var h = lHeaders();
    if (!h) { console.log('[dev push]', to); _trackLine('push', 'no-token', ''); return; }
    try {
      var r = await fetch(API + '/message/push', { method: 'POST', headers: h, body: JSON.stringify({ to: to, messages: msgs }) });
      if (!r.ok) { var t = await r.text(); console.error('[LINE push]', r.status, t); _trackLine('push', r.status, 'to=' + to + ' ' + t); return { ok: false, status: r.status }; }
      else { _trackLine('push', 200, 'to=' + to); return { ok: true, status: 200 }; }
    } catch (e) { console.error('[LINE push] error:', e.message); _trackLine('push', 'error', e.message); return { ok: false, error: e.message }; }
  }

  function rText(rt, t) { return lReply(rt, [{ type: 'text', text: t }]); }

  return {
    API: API,
    lHeaders: lHeaders,
    lReply: lReply,
    lPush: lPush,
    rText: rText,
    _trackLine: _trackLine,
    getLastLineResults: function() { return _lastLineResults; },
  };
};
