'use strict';

/**
 * user-context.js — LINE V3 PR-8: rolling conversation memory per user/group.
 *
 * conversation_states (30-min pending action) stays untouched. This table is a
 * separate, long-lived summary so the bot remembers what a person has been
 * talking about across days without replaying raw history into every prompt.
 *
 * Flow: every General/RAG exchange bumps msg_count. Once the counter reaches
 * SUMMARIZE_EVERY, the recent turns are compacted by Haiku into a short summary
 * that replaces the previous one, and the counter resets.
 *
 * Every failure path is soft — a broken summary must never block a reply.
 *
 * pa Oracle — Eye of Ma'at 𓂀 | 2026-08-21
 */

var https = require('https');

var SUMMARIZE_EVERY = 10;
var MAX_SUMMARY_CHARS = 1200;
var MAX_TURN_CHARS = 400;
var RECENT_TURNS_KEPT = 12;

var DDL = [
  'CREATE TABLE IF NOT EXISTS user_context (',
  '  user_key    TEXT PRIMARY KEY,',
  '  summary     TEXT,',
  '  recent      TEXT DEFAULT \'[]\',',
  '  msg_count   INTEGER DEFAULT 0,',
  '  updated_at  TEXT DEFAULT (datetime(\'now\'))',
  ');',
].join('\n');

var SYSTEM_PROMPT = 'สรุปบทสนทนาให้สั้นที่สุดเท่าที่ยังเก็บสาระครบ เพื่อใช้เป็นความจำของผู้ช่วยในการคุยครั้งต่อไป '
  + 'เก็บ: ลูกค้า/งานที่พูดถึง ยี่ห้อและขนาดระบบที่สนใจ การตัดสินใจ สิ่งที่ค้างอยู่ '
  + 'ตัดทิ้ง: คำทักทาย คำขอบคุณ ข้อความที่ไม่มีสาระ '
  + 'ถ้ามีสรุปเดิมให้รวมกับบทสนทนาใหม่เป็นฉบับเดียว ห้ามเขียนยาวเกิน 5 บรรทัด ห้ามแต่งข้อมูลที่ไม่ได้พูดถึง ตอบเป็นภาษาไทยแบบข้อความล้วน';

function createUserContext(opts) {
  opts = opts || {};
  var db = opts.db || null;
  var apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY || '';
  var summarizeEvery = Number(opts.summarizeEvery || SUMMARIZE_EVERY);
  var askFn = opts.askFn || null; // injectable for tests
  var ready = false;

  function init() {
    if (ready || !db) return ready;
    try {
      db.exec(DDL);
      ready = true;
    } catch (e) {
      console.warn('[user-context] init failed: ' + e.message);
      ready = false;
    }
    return ready;
  }

  function getRow(userKey) {
    if (!init() || !userKey) return null;
    try {
      return db.prepare('SELECT user_key, summary, recent, msg_count FROM user_context WHERE user_key = ?').get(userKey) || null;
    } catch (e) {
      console.warn('[user-context] read failed: ' + e.message);
      return null;
    }
  }

  function parseRecent(raw) {
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /** Summary text to prepend as context, or '' when there is nothing useful yet. */
  function getSummary(userKey) {
    var row = getRow(userKey);
    return row && row.summary ? String(row.summary) : '';
  }

  function trim(text) {
    var value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    return value.length > MAX_TURN_CHARS ? value.slice(0, MAX_TURN_CHARS) + '…' : value;
  }

  function callHaiku(prompt) {
    // A synchronous throw here would escape the promise chain in record() and
    // break the user's reply, so the injected path is guarded too.
    if (askFn) {
      try { return Promise.resolve(askFn(prompt)); }
      catch (e) {
        console.warn('[user-context] summarizer threw: ' + e.message);
        return Promise.resolve(null);
      }
    }
    if (!apiKey) return Promise.resolve(null);
    var body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });
    return new Promise(function(resolve) {
      var settled = false;
      function finish(v) { if (!settled) { settled = true; resolve(v); } }
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
          res.on('data', function(c) { chunks.push(c); });
          res.on('end', function() {
            try {
              if (res.statusCode && res.statusCode >= 400) return finish(null);
              var parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              var text = parsed.content && parsed.content[0] && parsed.content[0].text;
              finish(text ? String(text) : null);
            } catch (e) { finish(null); }
          });
        });
        req.on('error', function() { finish(null); });
        req.setTimeout(Number(opts.timeoutMs || 12000), function() {
          try { req.destroy(); } catch (e) {}
          finish(null);
        });
        req.write(body);
        req.end();
      } catch (e) { finish(null); }
    });
  }

  function buildPrompt(previousSummary, turns) {
    var history = turns.map(function(t) {
      return (t.role === 'bot' ? 'ผู้ช่วย: ' : 'ผู้ใช้: ') + t.text;
    }).join('\n');
    return (previousSummary ? 'สรุปเดิม:\n' + previousSummary + '\n\n' : '')
      + 'บทสนทนาใหม่:\n' + history;
  }

  /**
   * Record one exchange. Returns a promise resolving to true when a new summary
   * was written this call. Never rejects.
   */
  function record(userKey, userText, botText) {
    if (!init() || !userKey) return Promise.resolve(false);
    var row = getRow(userKey);
    var recent = parseRecent(row && row.recent);
    var count = Number((row && row.msg_count) || 0) + 1;

    recent.push({ role: 'user', text: trim(userText) });
    if (botText) recent.push({ role: 'bot', text: trim(botText) });
    if (recent.length > RECENT_TURNS_KEPT) recent = recent.slice(-RECENT_TURNS_KEPT);

    function persist(summary, msgCount, turns) {
      try {
        db.prepare(
          'INSERT INTO user_context (user_key, summary, recent, msg_count, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\')) '
          + 'ON CONFLICT(user_key) DO UPDATE SET summary = excluded.summary, recent = excluded.recent, '
          + 'msg_count = excluded.msg_count, updated_at = excluded.updated_at'
        ).run(userKey, summary, JSON.stringify(turns), msgCount);
      } catch (e) {
        console.warn('[user-context] write failed: ' + e.message);
      }
    }

    var previousSummary = row && row.summary ? String(row.summary) : '';

    if (count < summarizeEvery) {
      persist(previousSummary, count, recent);
      return Promise.resolve(false);
    }

    // Counter reached the threshold — compact and reset. Persist the raw turns
    // first so a failed summarization never loses the conversation.
    persist(previousSummary, count, recent);

    var pending;
    try {
      pending = callHaiku(buildPrompt(previousSummary, recent));
    } catch (e) {
      console.warn('[user-context] summarize failed: ' + e.message);
      return Promise.resolve(false);
    }

    return Promise.resolve(pending)
      .then(function(summary) {
        if (!summary) return false; // keep counter high, retry next message
        var clipped = String(summary).trim().slice(0, MAX_SUMMARY_CHARS);
        persist(clipped, 0, recent);
        return true;
      })
      .catch(function(e) {
        console.warn('[user-context] summarize failed: ' + e.message);
        return false;
      });
  }

  function clear(userKey) {
    if (!init() || !userKey) return false;
    try {
      db.prepare('DELETE FROM user_context WHERE user_key = ?').run(userKey);
      return true;
    } catch (e) {
      console.warn('[user-context] clear failed: ' + e.message);
      return false;
    }
  }

  return {
    getSummary: getSummary,
    record: record,
    clear: clear,
    buildPrompt: buildPrompt,
    systemPrompt: SYSTEM_PROMPT,
    summarizeEvery: summarizeEvery,
  };
}

module.exports = createUserContext;
module.exports.DDL = DDL;
module.exports.SUMMARIZE_EVERY = SUMMARIZE_EVERY;
