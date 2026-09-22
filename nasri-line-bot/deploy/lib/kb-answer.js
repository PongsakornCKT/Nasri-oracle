'use strict';

var https = require('https');

var SYSTEM_PROMPT = 'ตอบจากบริบทที่ให้เท่านั้น ถ้าบริบทไม่มีคำตอบให้บอกตรงๆ ว่า "ไม่มีข้อมูลเรื่องนี้ในเอกสาร" ห้ามเดา ห้ามใช้ความรู้นอกบริบท ตอบภาษาไทย กระชับ แล้วลงท้ายด้วยชื่อไฟล์ที่ใช้อ้างอิง';

function sourceNames(hits) {
  var seen = {};
  return (hits || []).map(function(hit) { return String(hit && hit.source || ''); }).filter(function(source) {
    if (!source || seen[source]) return false;
    seen[source] = true;
    return true;
  });
}

// A single chunk can be large — the biggest in the live snapshot is 8,441
// characters, so eight of them would push roughly 34k tokens of Thai into one
// prompt on every question. Cap per chunk and overall: answer quality does not
// improve past a few thousand characters of context, but cost and latency do.
var MAX_CHUNK_CHARS = Number(process.env.KB_MAX_CHUNK_CHARS || 2500);
var MAX_CONTEXT_CHARS = Number(process.env.KB_MAX_CONTEXT_CHARS || 12000);

function buildPrompt(question, hits) {
  var parts = [];
  var used = 0;
  var list = hits || [];
  for (var i = 0; i < list.length; i++) {
    var body = String(list[i].content || '');
    if (body.length > MAX_CHUNK_CHARS) body = body.slice(0, MAX_CHUNK_CHARS) + '…';
    var block = '[เอกสาร ' + (parts.length + 1) + '] ' + (list[i].source || 'ไม่ทราบไฟล์') + '\n' + body;
    // Always keep at least one document, even if it alone exceeds the budget.
    if (parts.length && used + block.length > MAX_CONTEXT_CHARS) break;
    parts.push(block);
    used += block.length;
  }
  return 'คำถาม: ' + String(question || '') + '\n\nบริบทเอกสาร:\n' + parts.join('\n\n');
}

function answer(question, hits, snapshotDate, options) {
  options = options || {};
  var apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey || !hits || !hits.length) return Promise.resolve(null);
  var body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(question, hits) }],
  });
  var timeoutMs = Number(options.timeoutMs || 15000);
  return new Promise(function(resolve) {
    var settled = false;
    function finish(value) { if (!settled) { settled = true; resolve(value); } }
    var req;
    try {
      req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      }, function(res) {
        var chunks = [];
        res.on('data', function(chunk) { chunks.push(chunk); });
        res.on('end', function() {
          try {
            if (res.statusCode && res.statusCode >= 400) return finish(null);
            var parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            var text = parsed.content && parsed.content[0] && parsed.content[0].text;
            if (!text) return finish(null);
            finish({ answer: String(text), sources: sourceNames(hits), snapshot_date: snapshotDate || null });
          } catch (e) { finish(null); }
        });
      });
      req.on('error', function() { finish(null); });
      req.setTimeout(timeoutMs, function() { try { req.destroy(); } catch (e) {} finish(null); });
      req.write(body);
      req.end();
    } catch (e) { finish(null); }
  });
}

module.exports = { answer: answer, buildPrompt: buildPrompt, systemPrompt: SYSTEM_PROMPT, sourceNames: sourceNames };
